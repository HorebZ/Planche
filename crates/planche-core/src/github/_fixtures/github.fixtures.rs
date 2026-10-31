use std::future::{Future, ready};
use std::sync::{Arc, Mutex};

use crate::domain::{ContentId, Item, ItemContent, ItemId, ProjectId, ProjectMeta, RateUsage};
use crate::error::{Error, GraphqlError, Result};
use crate::github::ops::{ItemsPage, decode_project_items, decode_project_meta};
use crate::intent::Operation;
use crate::sync::Remote;

use super::{ITEM_PAGES, PROJECT_META};

const PAGE: usize = 6;

pub(crate) struct State {
    pub(crate) meta: ProjectMeta,
    pub(crate) items: Vec<Item>,
    pub(crate) fail_page: Option<u32>,
    pub(crate) fail_mutations: bool,
    /// False makes GitHub read stale right after a mutation.
    pub(crate) apply_mutations: bool,
    pub(crate) executed: Vec<Operation>,
    pub(crate) fetches: u32,
    pub(crate) cost: u32,
}

#[derive(Clone)]
pub(crate) struct FakeGithub(Arc<Mutex<State>>);

impl FakeGithub {
    pub(crate) fn new() -> Self {
        let items = ITEM_PAGES
            .iter()
            .flat_map(|page| decode_project_items(page).unwrap().items)
            .collect();

        Self(Arc::new(Mutex::new(State {
            meta: decode_project_meta(PROJECT_META).unwrap(),
            items,
            fail_page: None,
            fail_mutations: false,
            apply_mutations: true,
            executed: Vec::new(),
            fetches: 0,
            cost: 0,
        })))
    }

    pub(crate) fn edit<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        f(&mut self.0.lock().unwrap())
    }

    fn page(&self, n: u32) -> Result<ItemsPage> {
        self.edit(|s| {
            s.cost += 3;

            if s.fail_page == Some(n) {
                return Err(Error::Network(format!("page {n} timed out")));
            }

            let start = (n as usize - 1) * PAGE;
            let end = (start + PAGE).min(s.items.len());

            Ok(ItemsPage {
                items: s.items[start..end].to_vec(),
                next_cursor: (end < s.items.len()).then(|| (n + 1).to_string()),
                total_count: s.items.len() as u32,
            })
        })
    }

    pub(crate) fn server_apply(state: &mut State, operation: &Operation) {
        let index = |items: &[Item], id: &ItemId| items.iter().position(|i| &i.id == id).unwrap();

        match operation {
            Operation::SetSingleSelect {
                item_id,
                field_id,
                option_id,
                ..
            } => {
                let i = index(&state.items, item_id);
                let selects = &mut state.items[i].single_selects;

                selects.retain(|(f, _)| f != field_id);
                selects.push((field_id.clone(), option_id.clone()));
            }
            Operation::ClearFieldValue {
                item_id, field_id, ..
            } => {
                let i = index(&state.items, item_id);

                state.items[i].single_selects.retain(|(f, _)| f != field_id);
            }
            Operation::MoveItemPosition {
                item_id, after_id, ..
            } => {
                let item = state.items.remove(index(&state.items, item_id));
                let at = after_id
                    .as_ref()
                    .map_or(0, |after| index(&state.items, after) + 1);

                state.items.insert(at, item);
            }
            Operation::AddDraftIssue { title, .. } => state.items.push(Item {
                id: ItemId(format!("PVTI_draft_{}", state.items.len())),
                archived: false,
                updated_at: "2026-10-16T00:00:00Z".into(),
                single_selects: Vec::new(),
                content: ItemContent::Draft {
                    id: ContentId(format!("DI_{}", state.items.len())),
                    title: title.clone(),
                    assignees: Vec::new(),
                },
            }),
            Operation::ArchiveItem { item_id, .. } => {
                let i = index(&state.items, item_id);

                state.items[i].archived = true;
            }
            _ => {}
        }
    }
}

impl Remote for FakeGithub {
    fn board_page(
        &self,
        _owner: &str,
        _number: u32,
    ) -> impl Future<Output = Result<(ProjectMeta, ItemsPage)>> + Send {
        self.edit(|s| s.fetches += 1);

        let meta = self.edit(|s| s.meta.clone());

        ready(self.page(1).map(|page| (meta, page)))
    }

    fn items_page(
        &self,
        _project: &ProjectId,
        cursor: &str,
    ) -> impl Future<Output = Result<ItemsPage>> + Send {
        ready(self.page(cursor.parse().unwrap()))
    }

    fn execute(
        &self,
        operation: &Operation,
    ) -> impl Future<Output = Result<Option<ItemId>>> + Send {
        ready(self.edit(|s| {
            if s.fail_mutations {
                return Err(Error::GitHub(vec![GraphqlError {
                    kind: Some("NOT_FOUND".into()),
                    message: "Could not resolve to a node".into(),
                }]));
            }

            s.executed.push(operation.clone());

            if s.apply_mutations {
                Self::server_apply(s, operation);
            }

            Ok(matches!(operation, Operation::AddDraftIssue { .. })
                .then(|| s.items.last().unwrap().id.clone()))
        }))
    }

    fn usage(&self) -> RateUsage {
        RateUsage {
            cost_total: self.edit(|s| s.cost),
            remaining: Some(4900),
            limit: Some(5000),
            reset_at: None,
        }
    }
}

/// GitHub unreachable.
pub(crate) struct FakeOffline;

impl Remote for FakeOffline {
    fn board_page(
        &self,
        _owner: &str,
        _number: u32,
    ) -> impl Future<Output = Result<(ProjectMeta, ItemsPage)>> + Send {
        ready(Err(Error::Network("offline".into())))
    }

    fn items_page(
        &self,
        _project: &ProjectId,
        _cursor: &str,
    ) -> impl Future<Output = Result<ItemsPage>> + Send {
        ready(Err(Error::Network("offline".into())))
    }

    fn execute(
        &self,
        _operation: &Operation,
    ) -> impl Future<Output = Result<Option<ItemId>>> + Send {
        ready(Err(Error::Network("offline".into())))
    }

    fn usage(&self) -> RateUsage {
        RateUsage::default()
    }
}
