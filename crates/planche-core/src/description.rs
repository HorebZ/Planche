use std::future::Future;
use std::sync::{Arc, Mutex};

use crate::cache::Cache;
use crate::domain::{ContentId, IssueDescription, UserId};
use crate::{Error, Result};

pub const HOST: &str = "github.com";

#[derive(Default)]
pub struct Descriptions {
    account: Mutex<Option<Arc<UserId>>>,
}

impl Descriptions {
    pub fn unlock(&self, account: UserId) {
        *self.account.lock().expect("description session") = Some(Arc::new(account));
    }

    pub fn lock(&self) {
        *self.account.lock().expect("description session") = None;
    }

    pub fn cached(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        content: &ContentId,
    ) -> Result<Option<IssueDescription>> {
        let current = self.account.lock().expect("description session");

        if current.as_deref() != Some(account) {
            return Err(Error::NotSignedIn);
        }

        cache
            .lock()
            .expect("cache lock")
            .issue_description(HOST, account, content)
    }

    pub async fn refresh(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        content: &ContentId,
        fetch: impl Future<Output = Result<Option<String>>>,
    ) -> Result<Option<IssueDescription>> {
        let (session, revision) = {
            let current = self.account.lock().expect("description session");
            let session = current
                .as_ref()
                .filter(|id| id.as_ref() == account)
                .ok_or(Error::NotSignedIn)?;
            let revision = cache
                .lock()
                .expect("cache lock")
                .begin_description(HOST, account, content)?;

            (session.clone(), revision)
        };
        let result = fetch.await;
        let current = self.account.lock().expect("description session");

        if !current.as_ref().is_some_and(|id| Arc::ptr_eq(id, &session)) {
            return Err(Error::NotSignedIn);
        }

        let body = match result {
            Ok(body) => body,
            Err(error) if access_denied(&error) => None,
            Err(error) => return Err(error),
        };

        cache.lock().expect("cache lock").finish_description(
            HOST,
            account,
            content,
            revision,
            body.as_deref(),
        )
    }
}

fn access_denied(error: &Error) -> bool {
    match error {
        Error::Unauthorized | Error::Http(403 | 404) => true,
        Error::GitHub(errors) => errors
            .iter()
            .any(|error| error.is_access_denied() || error.kind.as_deref() == Some("NOT_FOUND")),
        _ => false,
    }
}

#[cfg(test)]
#[path = "description.test.rs"]
mod tests;
