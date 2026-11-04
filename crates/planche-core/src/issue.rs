//! Issue actions address GitHub content directly; Project intents keep their original format.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{Notify, oneshot};
use tokio::task::JoinHandle;

use crate::Error;
use crate::cache::Cache;
use crate::description::Descriptions;
use crate::domain::{ContentId, ItemContent, User, UserId};
use crate::intent::Operation;
use crate::sync::Remote;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct IssueChange {
    pub account: UserId,
    pub content: ContentId,
    pub error: Option<String>,
}

pub struct IssueSender {
    wake: Arc<Notify>,
    stop: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}

impl IssueSender {
    pub fn wake(&self) {
        self.wake.notify_one();
    }

    /// An update waits for the current send before replacing the application.
    pub async fn shutdown(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }

        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
    }
}

impl Drop for IssueSender {
    fn drop(&mut self) {
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}

/// The shell supplies the authenticated account's remote; no Project needs to be open.
pub fn spawn(
    cache: Arc<Mutex<Cache>>,
    session: Arc<Descriptions>,
    account: UserId,
    remote: impl Remote,
    mut changed: impl FnMut(IssueChange) + Send + 'static,
) -> IssueSender {
    let wake = Arc::new(Notify::new());
    let notified = wake.clone();
    let (stop, mut stopping) = oneshot::channel();
    let task = tokio::spawn(async move {
        let mut failures = 0u32;
        let mut delay = Duration::ZERO;

        loop {
            tokio::select! {
                biased;
                _ = &mut stopping => return,
                _ = tokio::time::sleep(delay) => {},
                _ = notified.notified(), if failures == 0 => {},
            }

            match session
                .flush_issues(&cache, &account, &remote, &mut changed)
                .await
            {
                Ok(()) => {
                    failures = 0;
                    delay = Duration::from_secs(1);
                }
                Err(Error::NotSignedIn) => return,
                Err(error) => {
                    failures += 1;
                    delay = Duration::from_secs(1 << failures.min(6));

                    if let Error::RateLimited { retry_after_secs } = error {
                        delay = delay.max(Duration::from_secs(retry_after_secs));
                    }
                }
            }
        }
    });

    IssueSender {
        wake,
        stop: Some(stop),
        task: Some(task),
    }
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
