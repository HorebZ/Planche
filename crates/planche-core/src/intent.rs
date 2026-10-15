//! User actions, and the GitHub mutations that carry them out.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::domain::{Board, Card, Column, FieldId, ItemContent, ItemId, OptionId, ProjectId};
use crate::error::{Error, Result};

/// Stored as JSON in `pending_mutation.intent`, and replayed by `fixtures/move_cases.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Intent {
    MoveCard {
        project_id: ProjectId,
        item_id: ItemId,
        field_id: FieldId,
        /// `None` clears the field, which is the "No <field>" column.
        to: Option<OptionId>,
        placement: Placement,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Placement {
    /// Leaves the card's position in the project unchanged.
    Keep,
    Top,
    After(ItemId),
}

/// One GitHub mutation, named after its operation in `graphql/mutations.graphql`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operation {
    SetSingleSelect {
        project_id: ProjectId,
        item_id: ItemId,
        field_id: FieldId,
        option_id: OptionId,
    },
    ClearFieldValue {
        project_id: ProjectId,
        item_id: ItemId,
        field_id: FieldId,
    },
    MoveItemPosition {
        project_id: ProjectId,
        item_id: ItemId,
        /// `None` moves the item to the top.
        after_id: Option<ItemId>,
    },
}

impl Intent {
    /// Moves `item` into `to` on the board's column field, where `None` is "No <field>".
    pub fn move_card(
        board: &Board,
        item: &ItemId,
        to: Option<&Column>,
        placement: Placement,
    ) -> Self {
        Self::MoveCard {
            project_id: board.project.id.clone(),
            item_id: item.clone(),
            field_id: board.field.id.clone(),
            to: to.and_then(|c| c.option_id.clone()),
            placement,
        }
    }
}

impl Intent {
    pub fn item_id(&self) -> &ItemId {
        let Self::MoveCard { item_id, .. } = self;
        item_id
    }
}

/// The board once GitHub has applied `intent`. Applying an intent the board already
/// reflects changes nothing, so a replayed intent cannot move a card twice.
pub fn apply(mut board: Board, intent: &Intent) -> Board {
    let Intent::MoveCard {
        project_id,
        item_id,
        field_id,
        to,
        placement,
    } = intent;
    let column_of = |board: &Board, option: Option<&OptionId>| {
        board
            .columns
            .iter()
            .position(|c| c.option_id.as_ref() == option)
    };
    if *project_id != board.project.id {
        return board;
    }
    let Some(from) = board
        .columns
        .iter()
        .position(|c| c.cards.iter().any(|card| &card.item_id == item_id))
    else {
        return board;
    };
    // Another field than the columns' leaves the card in its column.
    let option = if *field_id == board.field.id {
        to.clone()
    } else {
        board.columns[from].option_id.clone()
    };
    if option.is_some() && column_of(&board, option.as_ref()).is_none() {
        return board;
    }

    let mut order: Vec<&Card> = board.columns.iter().flat_map(|c| &c.cards).collect();
    order.sort_by_key(|c| c.position);
    let mut order: Vec<ItemId> = order.into_iter().map(|c| c.item_id.clone()).collect();
    let old_rank = order
        .iter()
        .position(|id| id == item_id)
        .expect("card is on the board");
    order.remove(old_rank);
    let rank = match placement {
        Placement::Keep => old_rank,
        Placement::Top => 0,
        Placement::After(anchor) => order
            .iter()
            .position(|id| id == anchor)
            .map_or(old_rank, |i| i + 1),
    };
    order.insert(rank, item_id.clone());
    let ranks: HashMap<ItemId, u32> = order.into_iter().zip(0..).collect();

    let index = board.columns[from]
        .cards
        .iter()
        .position(|c| &c.item_id == item_id)
        .expect("card is in its column");
    let card = board.columns[from].cards.remove(index);
    let to = column_of(&board, option.as_ref()).unwrap_or_else(|| {
        board.columns.insert(
            0,
            Column {
                option_id: None,
                name: format!("No {}", board.field.name),
                color: None,
                cards: Vec::new(),
            },
        );
        0
    });
    board.columns[to].cards.push(card);
    for column in &mut board.columns {
        for card in &mut column.cards {
            card.position = ranks[&card.item_id];
        }
        column.cards.sort_by_key(|c| c.position);
    }
    // `project_board` shows "No <field>" only when it holds a card.
    board
        .columns
        .retain(|c| c.option_id.is_some() || !c.cards.is_empty());
    board
}

pub fn to_operations(intent: &Intent) -> Vec<Operation> {
    match intent {
        Intent::MoveCard {
            project_id,
            item_id,
            field_id,
            to,
            placement,
        } => {
            let set = match to {
                Some(option_id) => Operation::SetSingleSelect {
                    project_id: project_id.clone(),
                    item_id: item_id.clone(),
                    field_id: field_id.clone(),
                    option_id: option_id.clone(),
                },
                None => Operation::ClearFieldValue {
                    project_id: project_id.clone(),
                    item_id: item_id.clone(),
                    field_id: field_id.clone(),
                },
            };
            let after_id = match placement {
                Placement::Keep => return vec![set],
                Placement::Top => None,
                Placement::After(id) => Some(id.clone()),
            };
            vec![
                set,
                Operation::MoveItemPosition {
                    project_id: project_id.clone(),
                    item_id: item_id.clone(),
                    after_id,
                },
            ]
        }
    }
}

/// Finds a card by `#123`, `repo#123`, `owner/repo#123`, an item ID, or a title prefix.
/// Matching ignores case.
pub fn find_card<'a>(board: &'a Board, query: &str) -> Result<&'a Card> {
    let cards = || board.columns.iter().flat_map(|c| &c.cards);
    if let Some(card) = cards().find(|c| c.item_id.as_str() == query) {
        return Ok(card);
    }
    let by_reference = query.rsplit_once('#').and_then(|(repo, number)| {
        let number: u32 = number.parse().ok()?;
        Some(
            cards()
                .filter(|c| matches_reference(&c.content, repo, number))
                .collect::<Vec<_>>(),
        )
    });
    let matches = by_reference.unwrap_or_else(|| {
        let prefix = query.to_lowercase();
        cards()
            .filter(|c| c.title().to_lowercase().starts_with(&prefix))
            .collect()
    });
    match matches.as_slice() {
        [] => Err(Error::CardNotFound(query.to_owned())),
        [card] => Ok(card),
        _ => Err(Error::AmbiguousCard {
            query: query.to_owned(),
            candidates: matches
                .iter()
                .map(|c| (c.item_id.clone(), c.title().to_owned()))
                .collect(),
        }),
    }
}

fn matches_reference(content: &ItemContent, repo: &str, number: u32) -> bool {
    let (ItemContent::Issue {
        number: n,
        repo: name_with_owner,
        ..
    }
    | ItemContent::PullRequest {
        number: n,
        repo: name_with_owner,
        ..
    }) = content
    else {
        return false;
    };
    let name = name_with_owner.rsplit('/').next().unwrap_or_default();
    *n == number
        && (repo.is_empty()
            || repo.eq_ignore_ascii_case(name_with_owner)
            || repo.eq_ignore_ascii_case(name))
}

/// Finds a column by option name, ignoring case. `none` and "No <field>" give `Ok(None)`.
pub fn find_column<'a>(board: &'a Board, name: &str) -> Result<Option<&'a Column>> {
    let no_value = format!("No {}", board.field.name);
    if name.eq_ignore_ascii_case("none") || name.eq_ignore_ascii_case(&no_value) {
        return Ok(None);
    }
    let options = || board.columns.iter().filter(|c| c.option_id.is_some());
    options()
        .find(|c| c.name.eq_ignore_ascii_case(name))
        .map(Some)
        .ok_or_else(|| Error::UnknownColumn {
            name: name.to_owned(),
            valid: options()
                .map(|c| c.name.clone())
                .chain(["none".to_owned()])
                .collect(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{BoardField, BoardProject, ContentId, IssueState};

    fn issue(item: &str, number: u32, repo: &str, title: &str) -> Card {
        Card {
            item_id: ItemId(item.into()),
            position: 0,
            content: ItemContent::Issue {
                id: ContentId(format!("I_{item}")),
                number,
                title: title.into(),
                url: format!("https://github.com/{repo}/issues/{number}"),
                repo: repo.into(),
                state: IssueState::Open,
                assignees: vec![],
                labels: vec![],
            },
            pending: false,
            updated_by_sync: false,
        }
    }

    fn column(option: &str, name: &str, cards: Vec<Card>) -> Column {
        Column {
            option_id: Some(OptionId(option.into())),
            name: name.into(),
            color: None,
            cards,
        }
    }

    fn board() -> Board {
        Board {
            project: BoardProject {
                id: ProjectId("PVT_1".into()),
                number: 2,
                title: "Planche".into(),
                url: "https://github.com/users/HorebZ/projects/2".into(),
            },
            view: None,
            field: BoardField {
                id: FieldId("PVTSSF_status".into()),
                name: "Status".into(),
            },
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
            pending_count: 0,
            synced_at: None,
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
            to_operations(&move_11(Some("done"), Placement::Keep)),
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
            to_operations(&move_11(None, Placement::Keep)),
            [Operation::ClearFieldValue {
                project_id: ProjectId("PVT_1".into()),
                item_id: ItemId("PVTI_11".into()),
                field_id: FieldId("PVTSSF_status".into()),
            }]
        );
    }

    #[test]
    fn move_to_the_top_positions_without_after_id() {
        let operations = to_operations(&move_11(Some("done"), Placement::Top));
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
        let operations = to_operations(&move_11(
            Some("done"),
            Placement::After(ItemId("PVTI_2".into())),
        ));
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
}
