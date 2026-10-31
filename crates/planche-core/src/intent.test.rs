use super::*;
use crate::domain::ContentId;
use crate::fixtures::{board as board_fixture, column, issue, user};

fn board() -> Board {
    Board {
        columns: vec![
            column(
                "todo",
                "Todo",
                vec![
                    issue(
                        "PVTI_10",
                        10,
                        "HorebZ/Planche",
                        "Phase 7: finish the macOS window",
                    ),
                    issue("PVTI_11", 11, "HorebZ/Planche", "Handoff screens after v1"),
                    issue("PVTI_x11", 11, "HorebZ/Other", "Phase 7 follow-up"),
                ],
            ),
            column("progress", "In Progress", vec![]),
            column("done", "Done", vec![]),
        ],
        ..board_fixture()
    }
}

fn move_11(to: Option<&str>, placement: Placement) -> Intent {
    Intent::MoveCard {
        project_id: ProjectId("PVT_1".into()),
        item_id: ItemId("PVTI_11".into()),
        field_id: FieldId("PVTSSF_status".into()),
        to: to.map(|o| OptionId(o.into())),
        placement,
    }
}

#[derive(Deserialize)]
struct MoveCase {
    name: String,
    board: Board,
    intent: Intent,
    expected: Board,
}

#[test]
fn every_move_case_gives_its_expected_board_and_is_idempotent() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/move_cases.json"
    );
    let cases: Vec<MoveCase> =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();

    assert!(cases.len() >= 10);

    for case in cases {
        let once = apply(case.board, &case.intent);

        assert_eq!(once, case.expected, "{}", case.name);
        assert_eq!(
            apply(once, &case.intent),
            case.expected,
            "{} twice",
            case.name
        );
    }
}

#[test]
fn intent_json_names_its_type_and_placement() {
    let json = serde_json::to_value(move_11(
        Some("done"),
        Placement::After(ItemId("PVTI_2".into())),
    ))
    .unwrap();

    assert_eq!(
        json,
        serde_json::json!({
            "type": "move_card", "project_id": "PVT_1", "item_id": "PVTI_11",
            "field_id": "PVTSSF_status", "to": "done", "placement": { "after": "PVTI_2" }
        })
    );
}

#[test]
fn move_to_a_column_sets_its_option() {
    assert_eq!(
        to_operations(&move_11(Some("done"), Placement::Keep), &board()).unwrap(),
        [Operation::SetSingleSelect {
            project_id: ProjectId("PVT_1".into()),
            item_id: ItemId("PVTI_11".into()),
            field_id: FieldId("PVTSSF_status".into()),
            option_id: OptionId("done".into()),
        }]
    );
}

#[test]
fn move_to_no_status_clears_the_field() {
    assert_eq!(
        to_operations(&move_11(None, Placement::Keep), &board()).unwrap(),
        [Operation::ClearFieldValue {
            project_id: ProjectId("PVT_1".into()),
            item_id: ItemId("PVTI_11".into()),
            field_id: FieldId("PVTSSF_status".into()),
        }]
    );
}

#[test]
fn move_to_the_top_positions_without_after_id() {
    let operations = to_operations(&move_11(Some("done"), Placement::Top), &board()).unwrap();

    assert_eq!(operations.len(), 2);
    assert_eq!(
        operations[1],
        Operation::MoveItemPosition {
            project_id: ProjectId("PVT_1".into()),
            item_id: ItemId("PVTI_11".into()),
            after_id: None,
        }
    );
}

#[test]
fn move_after_a_card_positions_after_its_item_id() {
    let operations = to_operations(
        &move_11(Some("done"), Placement::After(ItemId("PVTI_2".into()))),
        &board(),
    )
    .unwrap();

    assert_eq!(operations.len(), 2);
    assert_eq!(
        operations[1],
        Operation::MoveItemPosition {
            project_id: ProjectId("PVT_1".into()),
            item_id: ItemId("PVTI_11".into()),
            after_id: Some(ItemId("PVTI_2".into())),
        }
    );
}

/// The fixture board with project positions 0, 1, 2 in Todo.
fn ranked() -> Board {
    let mut board = board();

    for (rank, card) in (0..).zip(&mut board.columns[0].cards) {
        card.position = rank;
    }

    board
}

fn set_assignees(item: &str, add: &[&str], remove: &[&str]) -> Intent {
    Intent::SetAssignees {
        project_id: ProjectId("PVT_1".into()),
        item_id: ItemId(item.into()),
        add: add.iter().map(|l| user(l)).collect(),
        remove: remove.iter().map(|l| user(l)).collect(),
    }
}

fn logins(board: &Board, item: &str) -> Vec<String> {
    let card = board
        .columns
        .iter()
        .flat_map(|c| &c.cards)
        .find(|c| c.item_id.as_str() == item)
        .unwrap();

    match &card.content {
        ItemContent::Issue { assignees, .. } | ItemContent::Draft { assignees, .. } => {
            assignees.iter().map(|u| u.login.clone()).collect()
        }
        _ => panic!("no assignees"),
    }
}

#[test]
fn set_assignees_on_an_issue_adds_and_removes_on_its_content() {
    let mut board = board();

    let ItemContent::Issue { assignees, .. } = &mut board.columns[0].cards[1].content else {
        unreachable!()
    };

    assignees.push(user("lea"));

    let intent = set_assignees("PVTI_11", &["horebz"], &["lea"]);
    let once = apply(board.clone(), &intent);

    assert_eq!(logins(&once, "PVTI_11"), ["horebz"]);
    assert_eq!(apply(once.clone(), &intent), once);
    assert_eq!(
        to_operations(&intent, &once).unwrap(),
        [
            Operation::AddAssignees {
                assignable_id: ContentId("I_PVTI_11".into()),
                assignee_ids: vec![UserId("U_horebz".into())],
            },
            Operation::RemoveAssignees {
                assignable_id: ContentId("I_PVTI_11".into()),
                assignee_ids: vec![UserId("U_lea".into())],
            },
        ]
    );
    assert_eq!(
        to_operations(&set_assignees("PVTI_11", &[], &["horebz"]), &once).unwrap(),
        [Operation::RemoveAssignees {
            assignable_id: ContentId("I_PVTI_11".into()),
            assignee_ids: vec![UserId("U_horebz".into())],
        }]
    );
}

#[test]
fn set_assignees_on_a_draft_sends_its_whole_list() {
    let mut board = board();

    board.columns[1].cards.push(Card {
        item_id: ItemId("PVTI_d".into()),
        position: 3,
        content: ItemContent::Draft {
            id: ContentId("DI_d".into()),
            title: "Planche test draft".into(),
            assignees: vec![user("lea")],
        },
        pending: false,
        updated_by_sync: false,
    });

    let intent = set_assignees("PVTI_d", &["horebz"], &[]);
    let shown = apply(board, &intent);

    assert_eq!(logins(&shown, "PVTI_d"), ["lea", "horebz"]);
    assert_eq!(
        to_operations(&intent, &shown).unwrap(),
        [Operation::SetDraftAssignees {
            draft_issue_id: ContentId("DI_d".into()),
            assignee_ids: vec![UserId("U_lea".into()), UserId("U_horebz".into())],
        }]
    );
}

#[test]
fn unarchive_puts_the_card_back_where_it_was() {
    let board = ranked();
    let card = board.columns[0].cards[1].clone();
    let archive = Intent::Archive {
        project_id: ProjectId("PVT_1".into()),
        item_id: card.item_id.clone(),
    };
    let archived = apply(board.clone(), &archive);

    assert_eq!(archived.columns[0].cards.len(), 2);
    assert_eq!(apply(archived.clone(), &archive), archived);

    let unarchive = Intent::Unarchive {
        project_id: ProjectId("PVT_1".into()),
        item_id: card.item_id.clone(),
        column: Some(OptionId("todo".into())),
        card,
    };
    let back = apply(archived, &unarchive);

    assert_eq!(back, board);
    assert_eq!(apply(back.clone(), &unarchive), back);
    assert_eq!(
        to_operations(&unarchive, &back).unwrap(),
        [Operation::UnarchiveItem {
            project_id: ProjectId("PVT_1".into()),
            item_id: ItemId("PVTI_11".into()),
        }]
    );
}

#[test]
fn a_new_draft_shows_at_the_top_of_its_column_until_github_has_it() {
    let create = Intent::CreateDraft {
        project_id: ProjectId("PVT_1".into()),
        item_id: ItemId("draft:1".into()),
        field_id: FieldId("PVTSSF_status".into()),
        column: Some(OptionId("progress".into())),
        title: "Planche test draft".into(),
    };
    let shown = apply(ranked(), &create);
    let column = &shown.columns[1];

    assert_eq!(column.cards[0].item_id.as_str(), "draft:1");
    assert_eq!(column.cards[0].position, 0);
    assert_eq!(shown.columns[0].cards[0].position, 1);

    // The snapshot with the real item, under another ID, reflects the intent.
    let mut synced = shown.clone();

    synced.columns[1].cards[0].item_id = ItemId("PVTI_new".into());

    assert_eq!(apply(synced.clone(), &create), synced);
    assert_eq!(
        to_operations(&create, &shown).unwrap(),
        [Operation::AddDraftIssue {
            project_id: ProjectId("PVT_1".into()),
            title: "Planche test draft".into(),
        }]
    );
}

#[test]
fn move_card_reads_the_board_field_and_project() {
    let board = board();
    let done = find_column(&board, "done").unwrap();

    assert_eq!(
        Intent::move_card(&board, &ItemId("PVTI_11".into()), done, Placement::Keep),
        move_11(Some("done"), Placement::Keep)
    );
}

#[test]
fn unknown_column_lists_the_valid_names() {
    let error = find_column(&board(), "Doing").unwrap_err();

    assert_eq!(
        error.to_string(),
        "no column `Doing`, expected one of: Todo, In Progress, Done, none"
    );
}

#[test]
fn column_names_ignore_case_and_none_is_no_status() {
    let board = board();

    assert_eq!(
        find_column(&board, "in progress").unwrap().unwrap().name,
        "In Progress"
    );
    assert!(find_column(&board, "NONE").unwrap().is_none());
    assert!(find_column(&board, "no status").unwrap().is_none());
}

#[test]
fn cards_resolve_by_reference_item_id_and_title_prefix() {
    let board = board();
    let id = |query| {
        find_card(&board, query)
            .unwrap()
            .item_id
            .as_str()
            .to_owned()
    };

    assert_eq!(id("#10"), "PVTI_10");
    assert_eq!(id("planche#11"), "PVTI_11");
    assert_eq!(id("HorebZ/Other#11"), "PVTI_x11");
    assert_eq!(id("PVTI_11"), "PVTI_11");
    assert_eq!(id("handoff"), "PVTI_11");
}

#[test]
fn an_ambiguous_card_lists_the_candidate_item_ids() {
    let board = board();
    let error = find_card(&board, "Phase 7").unwrap_err();

    assert_eq!(
        error.to_string(),
        "`Phase 7` matches several cards, pass one of these item IDs instead:\n  \
         PVTI_10  Phase 7: finish the macOS window\n  PVTI_x11  Phase 7 follow-up"
    );
    assert!(matches!(
        find_card(&board, "#11"),
        Err(Error::AmbiguousCard { .. })
    ));
    assert!(matches!(
        find_card(&board, "#99"),
        Err(Error::CardNotFound(_))
    ));
}
