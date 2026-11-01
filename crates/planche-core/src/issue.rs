//! Issue actions address GitHub content directly; Project intents keep their original format.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::cache::Cache;
use crate::domain::{ContentId, ItemContent, User, UserId};
use crate::github::{GithubClient, ops};
use crate::intent::Operation;
use crate::{Error, Result, sync};

pub async fn flush(cache: &mut Cache, client: &GithubClient, account: &UserId) -> Result<()> {
    let (viewer, _) = ops::viewer(client).await?;

    if viewer.id != *account {
        return Err(Error::Unauthorized);
    }

    sync::flush_issues(cache, client, account).await
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IssueIntent {
    SetAssignees {
        content_id: ContentId,
        add: Vec<User>,
        remove: Vec<User>,
    },
}

impl IssueIntent {
    pub fn content_id(&self) -> &ContentId {
        match self {
            Self::SetAssignees { content_id, .. } => content_id,
        }
    }

    pub fn apply(&self, content: &mut ItemContent) {
        let ItemContent::Issue { id, assignees, .. } = content else {
            return;
        };

        if id != self.content_id() {
            return;
        }

        match self {
            Self::SetAssignees { add, remove, .. } => {
                for user in add {
                    if !assignees.iter().any(|assigned| assigned.id == user.id) {
                        assignees.push(user.clone());
                    }
                }

                assignees.retain(|user| !remove.iter().any(|removed| removed.id == user.id));
            }
        }
    }

    pub fn to_operations(&self) -> Vec<Operation> {
        let Self::SetAssignees {
            content_id,
            add,
            remove,
        } = self;
        let mut operations = Vec::new();

        if !add.is_empty() {
            operations.push(Operation::AddAssignees {
                assignable_id: content_id.clone(),
                assignee_ids: add.iter().map(|user| user.id.clone()).collect(),
            });
        }

        if !remove.is_empty() {
            operations.push(Operation::RemoveAssignees {
                assignable_id: content_id.clone(),
                assignee_ids: remove.iter().map(|user| user.id.clone()).collect(),
            });
        }

        operations
    }
}

#[cfg(test)]
#[path = "issue.test.rs"]
mod tests;
