use crate::domain::{
    Board, BoardField, BoardProject, BoardView, Card, Column, Field, Item, ProjectMeta, View,
    ViewLayout,
};
use crate::error::{Error, Result};
use crate::intent::{self, Intent};

/// The board as displayed: the server snapshot with the pending intents replayed in order.
pub fn project(
    meta: &ProjectMeta,
    view: Option<u32>,
    items: &[Item],
    pending: &[Intent],
) -> Result<Board> {
    Ok(pending
        .iter()
        .fold(project_board(meta, view, items)?, intent::apply))
}

/// Builds the board the way github.com shows it.
///
/// Columns come from the board view's column field: the view numbered `view`, or the
/// board view with the lowest number, or the single select field named "Status" when
/// the project has no board view. `view.filter` is ignored in v1.
pub fn project_board(meta: &ProjectMeta, view: Option<u32>, items: &[Item]) -> Result<Board> {
    let view = pick_view(meta, view)?;
    let field = column_field(meta, view)?;
    let options = field
        .options
        .as_ref()
        .ok_or_else(|| Error::UnsupportedColumnField(field.name.clone()))?;

    let mut columns: Vec<Column> = options
        .iter()
        .map(|o| Column {
            option_id: Some(o.id.clone()),
            name: o.name.clone(),
            color: Some(o.color.clone()),
            cards: Vec::new(),
        })
        .collect();
    let mut no_value = Vec::new();

    for (position, item) in (0..).zip(items.iter().filter(|i| !i.archived)) {
        let card = Card {
            item_id: item.id.clone(),
            position,
            content: item.content.clone(),
            pending: false,
            updated_by_sync: false,
        };
        let column = item.option_for(&field.id).and_then(|option| {
            columns
                .iter_mut()
                .find(|c| c.option_id.as_ref() == Some(option))
        });

        match column {
            Some(column) => column.cards.push(card),
            None => no_value.push(card),
        }
    }

    if !no_value.is_empty() {
        columns.insert(
            0,
            Column {
                option_id: None,
                name: format!("No {}", field.name),
                color: None,
                cards: no_value,
            },
        );
    }

    Ok(Board {
        project: BoardProject {
            id: meta.id.clone(),
            number: meta.number,
            title: meta.title.clone(),
            url: meta.url.clone(),
        },
        view: view.map(|v| BoardView {
            number: v.number,
            name: v.name.clone(),
            manual_order: v.manual_order,
        }),
        field: BoardField {
            id: field.id.clone(),
            name: field.name.clone(),
        },
        columns,
        pending_count: 0,
        synced_at: None,
    })
}

fn pick_view(meta: &ProjectMeta, number: Option<u32>) -> Result<Option<&View>> {
    match number {
        Some(n) => {
            let view = meta
                .views
                .iter()
                .find(|v| v.number == n)
                .ok_or(Error::ViewNotFound(n))?;

            if view.layout != ViewLayout::Board {
                return Err(Error::ViewNotBoard(n));
            }

            Ok(Some(view))
        }
        None => Ok(meta
            .views
            .iter()
            .filter(|v| v.layout == ViewLayout::Board)
            .min_by_key(|v| v.number)),
    }
}

fn column_field<'a>(meta: &'a ProjectMeta, view: Option<&View>) -> Result<&'a Field> {
    match view.and_then(|v| v.group_by.as_ref()) {
        Some(id) => meta
            .fields
            .iter()
            .find(|f| &f.id == id)
            .ok_or_else(|| Error::Decode(format!("view groups by unknown field {id}"))),
        None => meta
            .fields
            .iter()
            .find(|f| f.name == "Status" && f.options.is_some())
            .ok_or(Error::NoStatusField),
    }
}

#[cfg(test)]
#[path = "board.integration.test.rs"]
mod integration_tests;
