//! User actions, and the GitHub mutations that carry them out.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::domain::{
    Board, Card, Column, ContentId, FieldId, ItemContent, ItemId, OptionId, ProjectId, User, UserId,
};
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
    SetAssignees {
        project_id: ProjectId,
        item_id: ItemId,
        add: Vec<User>,
        remove: Vec<User>,
    },
    Archive {
        project_id: ProjectId,
        item_id: ItemId,
    },
    /// Carries the card and its column, which the board no longer has once archived.
    Unarchive {
        project_id: ProjectId,
        item_id: ItemId,
        column: Option<OptionId>,
        card: Card,
    },
    /// A new draft at the top of `column`. `item_id` is a temporary ID chosen by the client,
    /// for the card shown until GitHub creates the real item.
    CreateDraft {
        project_id: ProjectId,
        item_id: ItemId,
        field_id: FieldId,
        column: Option<OptionId>,
        title: String,
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
    ArchiveItem {
        project_id: ProjectId,
        item_id: ItemId,
    },
    UnarchiveItem {
        project_id: ProjectId,
        item_id: ItemId,
    },
    /// Answers with the new item's ID.
    AddDraftIssue {
        project_id: ProjectId,
        title: String,
    },
    AddAssignees {
        assignable_id: ContentId,
        assignee_ids: Vec<UserId>,
    },
    RemoveAssignees {
        assignable_id: ContentId,
        assignee_ids: Vec<UserId>,
    },
    /// A draft takes its whole list of assignees at once.
    SetDraftAssignees {
        draft_issue_id: ContentId,
        assignee_ids: Vec<UserId>,
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

    pub fn project_id(&self) -> &ProjectId {
        match self {
            Self::MoveCard { project_id, .. }
            | Self::SetAssignees { project_id, .. }
            | Self::Archive { project_id, .. }
            | Self::Unarchive { project_id, .. }
            | Self::CreateDraft { project_id, .. } => project_id,
        }
    }

    pub fn item_id(&self) -> &ItemId {
        match self {
            Self::MoveCard { item_id, .. }
            | Self::SetAssignees { item_id, .. }
            | Self::Archive { item_id, .. }
            | Self::Unarchive { item_id, .. }
            | Self::CreateDraft { item_id, .. } => item_id,
        }
    }
}

/// The board once GitHub has applied `intent`. Applying an intent the board already
/// reflects changes nothing, so a replayed intent cannot move a card twice.
pub fn apply(mut board: Board, intent: &Intent) -> Board {
    if *intent.project_id() != board.project.id {
        return board;
    }

    match intent {
        Intent::MoveCard {
            item_id,
            field_id,
            to,
            placement,
            ..
        } => {
            let Some(from) = column_of_card(&board, item_id) else {
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

            let order = order(&board);
            let old_rank = order
                .iter()
                .position(|id| id == item_id)
                .expect("card is on the board");
            let card = take(&mut board, item_id).expect("card is on the board");
            let order = order_without(order, item_id);
            let rank = match placement {
                Placement::Keep => old_rank,
                Placement::Top => 0,
                Placement::After(anchor) => order
                    .iter()
                    .position(|id| id == anchor)
                    .map_or(old_rank, |i| i + 1),
            };

            insert(board, card, option.as_ref(), order, rank)
        }
        Intent::SetAssignees {
            item_id,
            add,
            remove,
            ..
        } => {
            let card = board
                .columns
                .iter_mut()
                .flat_map(|c| &mut c.cards)
                .find(|c| &c.item_id == item_id);
            let assignees = match card.map(|c| &mut c.content) {
                Some(
                    ItemContent::Draft { assignees, .. }
                    | ItemContent::Issue { assignees, .. }
                    | ItemContent::PullRequest { assignees, .. },
                ) => assignees,
                _ => return board,
            };

            assignees.retain(|u| !remove.iter().any(|r| r.id == u.id));

            for user in add {
                if !assignees.iter().any(|u| u.id == user.id) {
                    assignees.push(user.clone());
                }
            }

            board
        }
        Intent::Archive { item_id, .. } => {
            let order = order_without(order(&board), item_id);

            if take(&mut board, item_id).is_none() {
                return board;
            }

            finish(board, order)
        }
        Intent::Unarchive {
            item_id,
            column,
            card,
            ..
        } => {
            if column_of_card(&board, item_id).is_some() {
                return board;
            }

            let order = order(&board);
            let rank = card.position as usize;

            insert(board, card.clone(), column.as_ref(), order, rank)
        }
        Intent::CreateDraft {
            item_id,
            column,
            title,
            ..
        } => {
            // ponytail: the real item has another ID, so a draft with the same title counts as
            // this one. Creating a second draft with an existing title shows it after the sync.
            let exists =
                board.columns.iter().flat_map(|c| &c.cards).any(
                    |c| matches!(&c.content, ItemContent::Draft { title: t, .. } if t == title),
                );

            if exists {
                return board;
            }

            let card = Card {
                item_id: item_id.clone(),
                position: 0,
                content: ItemContent::Draft {
                    id: ContentId(String::new()),
                    title: title.clone(),
                    assignees: Vec::new(),
                },
                pending: false,
                updated_by_sync: false,
            };
            let order = order(&board);

            insert(board, card, column.as_ref(), order, 0)
        }
    }
}

fn column_of(board: &Board, option: Option<&OptionId>) -> Option<usize> {
    board
        .columns
        .iter()
        .position(|c| c.option_id.as_ref() == option)
}

fn column_of_card(board: &Board, item_id: &ItemId) -> Option<usize> {
    board
        .columns
        .iter()
        .position(|c| c.cards.iter().any(|card| &card.item_id == item_id))
}

/// The board's cards in project order.
fn order(board: &Board) -> Vec<ItemId> {
    let mut cards: Vec<&Card> = board.columns.iter().flat_map(|c| &c.cards).collect();

    cards.sort_by_key(|c| c.position);

    cards.into_iter().map(|c| c.item_id.clone()).collect()
}

fn order_without(mut order: Vec<ItemId>, item_id: &ItemId) -> Vec<ItemId> {
    order.retain(|id| id != item_id);

    order
}

/// Removes a card from its column.
fn take(board: &mut Board, item_id: &ItemId) -> Option<Card> {
    let column = column_of_card(board, item_id)?;
    let cards = &mut board.columns[column].cards;
    let index = cards.iter().position(|c| &c.item_id == item_id)?;

    Some(cards.remove(index))
}

/// Puts `card` in the column of `option` at `rank` of `order`, which leaves the card out.
/// An option the board has no column for leaves the board unchanged.
fn insert(
    mut board: Board,
    card: Card,
    option: Option<&OptionId>,
    mut order: Vec<ItemId>,
    rank: usize,
) -> Board {
    let to = match column_of(&board, option) {
        Some(to) => to,
        None if option.is_some() => return board,
        None => {
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
        }
    };

    order.insert(rank.min(order.len()), card.item_id.clone());
    board.columns[to].cards.push(card);

    finish(board, order)
}

/// Ranks every card by `order`, and sorts each column by rank.
fn finish(mut board: Board, order: Vec<ItemId>) -> Board {
    let ranks: HashMap<ItemId, u32> = order.into_iter().zip(0..).collect();

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

/// The mutations that carry out `intent`. `board` is the displayed board, with the queue
/// replayed: it gives a card's content ID, and a draft's whole list of assignees.
pub fn to_operations(intent: &Intent, board: &Board) -> Result<Vec<Operation>> {
    Ok(match intent {
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
                Placement::Keep => return Ok(vec![set]),
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
        Intent::SetAssignees {
            item_id,
            add,
            remove,
            ..
        } => {
            let ids = |users: &[User]| users.iter().map(|u| u.id.clone()).collect::<Vec<_>>();
            let card = board
                .columns
                .iter()
                .flat_map(|c| &c.cards)
                .find(|c| &c.item_id == item_id)
                .ok_or_else(|| Error::CardNotFound(item_id.to_string()))?;

            match &card.content {
                ItemContent::Draft { id, assignees, .. } => vec![Operation::SetDraftAssignees {
                    draft_issue_id: id.clone(),
                    assignee_ids: ids(assignees),
                }],
                ItemContent::Issue { id, .. } | ItemContent::PullRequest { id, .. } => {
                    let mut operations = Vec::new();

                    if !add.is_empty() {
                        operations.push(Operation::AddAssignees {
                            assignable_id: id.clone(),
                            assignee_ids: ids(add),
                        });
                    }

                    if !remove.is_empty() {
                        operations.push(Operation::RemoveAssignees {
                            assignable_id: id.clone(),
                            assignee_ids: ids(remove),
                        });
                    }

                    operations
                }
                ItemContent::Redacted => return Err(Error::CardNotFound(item_id.to_string())),
            }
        }
        Intent::Archive {
            project_id,
            item_id,
        } => vec![Operation::ArchiveItem {
            project_id: project_id.clone(),
            item_id: item_id.clone(),
        }],
        Intent::Unarchive {
            project_id,
            item_id,
            ..
        } => vec![Operation::UnarchiveItem {
            project_id: project_id.clone(),
            item_id: item_id.clone(),
        }],
        Intent::CreateDraft {
            project_id, title, ..
        } => vec![Operation::AddDraftIssue {
            project_id: project_id.clone(),
            title: title.clone(),
        }],
    })
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
#[path = "intent.test.rs"]
mod tests;
