use crate::Error;
use crate::board::project_board;
use crate::domain::{Item, ItemContent, ProjectMeta};
use crate::github::fixtures::{ITEM_PAGES, PROJECT_META};
use crate::github::ops::{decode_project_items, decode_project_meta};
use serde_json::{Value, json};

fn project_meta_json() -> Value {
    serde_json::from_str(PROJECT_META).unwrap()
}

fn meta(json: &Value) -> ProjectMeta {
    decode_project_meta(&json.to_string()).unwrap()
}

/// Both item pages, as a full sync concatenates them.
fn pages() -> [Value; 2] {
    ITEM_PAGES.map(|page| serde_json::from_str(page).unwrap())
}

fn items(pages: &[Value]) -> Vec<Item> {
    pages
        .iter()
        .flat_map(|p| decode_project_items(&p.to_string()).unwrap().items)
        .collect()
}

fn item_nodes(page: &mut Value) -> &mut Vec<Value> {
    page["data"]["node"]["items"]["nodes"]
        .as_array_mut()
        .unwrap()
}

fn titles(board: &crate::domain::Board) -> Vec<(String, Vec<String>)> {
    board
        .columns
        .iter()
        .map(|c| {
            (
                c.name.clone(),
                c.cards.iter().map(|card| card.title().to_owned()).collect(),
            )
        })
        .collect()
}

#[test]
fn every_unarchived_item_of_both_pages_becomes_a_card_in_position_order() {
    let pages = pages();
    let items = items(&pages);
    let board = project_board(&meta(&project_meta_json()), None, &items).unwrap();

    assert_eq!(board.field.name, "Status");

    let total: usize = board.columns.iter().map(|c| c.cards.len()).sum();

    assert_eq!(total, items.iter().filter(|i| !i.archived).count());

    for column in &board.columns {
        let positions: Vec<usize> = column
            .cards
            .iter()
            .map(|card| items.iter().position(|i| i.id == card.item_id).unwrap())
            .collect();

        assert!(
            positions.is_sorted(),
            "{} is out of POSITION order",
            column.name
        );
    }

    let names: Vec<&str> = board.columns.iter().map(|c| c.name.as_str()).collect();

    assert_eq!(names, ["Todo", "In Progress", "Done"]);
}

#[test]
fn an_item_without_status_falls_into_no_status_first() {
    let mut pages = pages();

    item_nodes(&mut pages[1])[0]["fieldValues"]["nodes"]
        .as_array_mut()
        .unwrap()
        .retain(|v| v["__typename"] != "ProjectV2ItemFieldSingleSelectValue");

    let board = project_board(&meta(&project_meta_json()), None, &items(&pages)).unwrap();

    assert_eq!(board.columns[0].name, "No Status");
    assert_eq!(board.columns[0].option_id, None);
    assert_eq!(board.columns[0].cards.len(), 1);
}

#[test]
fn a_redacted_item_becomes_the_redacted_card() {
    let mut pages = pages();
    let node = &mut item_nodes(&mut pages[0])[1];

    node["type"] = json!("REDACTED");
    node["content"] = Value::Null;

    let board = project_board(&meta(&project_meta_json()), None, &items(&pages)).unwrap();
    let redacted: Vec<_> = board
        .columns
        .iter()
        .flat_map(|c| &c.cards)
        .filter(|c| c.content == ItemContent::Redacted)
        .collect();

    assert_eq!(redacted.len(), 1);
    assert_eq!(redacted[0].title(), "Redacted item");
}

#[test]
fn an_archived_item_is_left_out() {
    let mut pages = pages();
    let node = &mut item_nodes(&mut pages[0])[0];

    node["isArchived"] = json!(true);

    let archived_id = node["id"].as_str().unwrap().to_owned();
    let board = project_board(&meta(&project_meta_json()), None, &items(&pages)).unwrap();

    assert!(
        board
            .columns
            .iter()
            .flat_map(|c| &c.cards)
            .all(|c| c.item_id.as_str() != archived_id)
    );
}

#[test]
fn a_board_view_grouped_by_another_field_uses_its_options() {
    let mut meta_json = project_meta_json();
    let project = &mut meta_json["data"]["node"];

    project["fields"]["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "__typename": "ProjectV2SingleSelectField",
            "id": "PVTSSF_priority",
            "name": "Priority",
            "dataType": "SINGLE_SELECT",
            "options": [
                { "id": "p-high", "name": "High", "color": "RED", "description": "" },
                { "id": "p-low", "name": "Low", "color": "GRAY", "description": "" }
            ]
        }));
    project["views"]["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "id": "PVTV_priority",
            "number": 9,
            "name": "By priority",
            "layout": "BOARD_LAYOUT",
            "filter": null,
            "verticalGroupByFields": { "nodes": [{ "id": "PVTSSF_priority" }] },
            "sortByFields": { "totalCount": 0 }
        }));

    let mut pages = pages();

    item_nodes(&mut pages[0])[0]["fieldValues"]["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "__typename": "ProjectV2ItemFieldSingleSelectValue",
            "optionId": "p-high",
            "field": { "id": "PVTSSF_priority" }
        }));

    let items = items(&pages);

    let board = project_board(&meta(&meta_json), Some(9), &items).unwrap();

    assert_eq!(board.field.name, "Priority");

    let titles = titles(&board);

    assert_eq!(titles[0].0, "No Priority");
    assert_eq!(titles[0].1.len(), items.len() - 1);
    assert_eq!(titles[1].0, "High");
    assert_eq!(titles[1].1, [items[0].content.title()]);
    assert_eq!(titles[2], ("Low".to_owned(), vec![]));
}

#[test]
fn a_view_filter_does_not_change_the_cards() {
    let mut meta_json = project_meta_json();

    for view in meta_json["data"]["node"]["views"]["nodes"]
        .as_array_mut()
        .unwrap()
    {
        view["filter"] = json!("status:Done");
    }

    let items = items(&pages());
    let unfiltered = project_board(&meta(&project_meta_json()), None, &items).unwrap();
    let filtered = project_board(&meta(&meta_json), None, &items).unwrap();

    assert_eq!(titles(&filtered), titles(&unfiltered));
}

#[test]
fn a_table_view_is_not_a_board() {
    let meta = meta(&project_meta_json());
    let table = meta
        .views
        .iter()
        .find(|v| v.layout == crate::domain::ViewLayout::Table)
        .unwrap();
    let error = project_board(&meta, Some(table.number), &items(&pages())).unwrap_err();

    assert!(matches!(error, Error::ViewNotBoard(n) if n == table.number));
    assert_eq!(
        error.to_string(),
        format!("view {} is not a board", table.number)
    );
}

#[test]
fn a_view_sorted_by_a_field_has_no_manual_order() {
    let sorted = |count: u32| {
        let mut meta_json = project_meta_json();

        for view in meta_json["data"]["node"]["views"]["nodes"]
            .as_array_mut()
            .unwrap()
        {
            view["sortByFields"]["totalCount"] = json!(count);
        }

        let board = project_board(&meta(&meta_json), None, &items(&pages())).unwrap();

        board.view.unwrap().manual_order
    };

    assert!(sorted(0));
    assert!(!sorted(1));
}
