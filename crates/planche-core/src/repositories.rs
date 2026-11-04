use crate::cache::Cache;
use crate::domain::{RepositoryPage, RepositorySummary, SelectedRepository, UserId};
use crate::{Error, Result};
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub fn repository_reference(reference: &str) -> Result<(String, String)> {
    let invalid = || {
        Error::InvalidRepository(
            "Enter owner/repository or an https://github.com/owner/repository URL.".into(),
        )
    };
    let reference = reference.trim();
    let path = if reference.contains("://") {
        let url = reqwest::Url::parse(reference).map_err(|_| invalid())?;

        if url.scheme() != "https"
            || url.host_str() != Some("github.com")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
        {
            return Err(invalid());
        }

        url.path().trim_matches('/').to_owned()
    } else {
        reference.trim_end_matches('/').to_owned()
    };
    let (owner, name) = path.split_once('/').ok_or_else(invalid)?;

    if owner.is_empty()
        || name.is_empty()
        || matches!(name, "." | "..")
        || !owner
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(invalid());
    }

    Ok((owner.into(), name.into()))
}

#[derive(Default)]
pub struct Repositories {
    account: Mutex<Option<Arc<UserId>>>,
    selection_revision: AtomicU64,
}

impl Repositories {
    pub fn unlock(&self, account: UserId) {
        *self.account.lock().expect("repository session") = Some(Arc::new(account));
    }
    pub fn lock(&self) {
        *self.account.lock().expect("repository session") = None;
    }

    fn session(&self, account: &UserId) -> Result<Arc<UserId>> {
        self.account
            .lock()
            .expect("repository session")
            .as_ref()
            .filter(|id| id.as_ref() == account)
            .cloned()
            .ok_or(Error::NotSignedIn)
    }

    pub fn cached(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
    ) -> Result<Vec<SelectedRepository>> {
        let current = self.account.lock().expect("repository session");

        if current.as_deref() != Some(account) {
            return Err(Error::NotSignedIn);
        }

        cache
            .lock()
            .expect("cache lock")
            .selected_repositories(account)
    }

    pub async fn catalog(
        &self,
        account: &UserId,
        fetch: impl Future<Output = Result<RepositoryPage>>,
    ) -> Result<RepositoryPage> {
        let session = self.session(account)?;
        let result = fetch.await;
        let current = self.account.lock().expect("repository session");

        if !current.as_ref().is_some_and(|id| Arc::ptr_eq(id, &session)) {
            return Err(Error::NotSignedIn);
        }

        result
    }

    pub async fn select(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        fetch: impl Future<Output = Result<RepositorySummary>>,
    ) -> Result<Vec<SelectedRepository>> {
        let revision = self.selection_revision.load(Ordering::SeqCst);
        let session = self.session(account)?;
        let result = fetch.await;
        let current = self.account.lock().expect("repository session");

        if !current.as_ref().is_some_and(|id| Arc::ptr_eq(id, &session)) {
            return Err(Error::NotSignedIn);
        }

        // An older lookup must not undo a newer removal.
        if self.selection_revision.load(Ordering::SeqCst) != revision {
            return Err(Error::InvalidRepository(
                "Repository selection changed during lookup. Try again.".into(),
            ));
        }

        cache
            .lock()
            .expect("cache lock")
            .select_repository(account, &result?)
    }

    pub fn remove(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        id: &str,
    ) -> Result<Vec<SelectedRepository>> {
        let current = self.account.lock().expect("repository session");

        if current.as_deref() != Some(account) {
            return Err(Error::NotSignedIn);
        }

        let selected = cache
            .lock()
            .expect("cache lock")
            .remove_repository(account, id)?;
        self.selection_revision.fetch_add(1, Ordering::SeqCst);

        Ok(selected)
    }

    pub async fn refresh(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        id: &str,
        fetch: impl Future<Output = Result<Option<RepositorySummary>>>,
    ) -> Result<Option<SelectedRepository>> {
        let (session, revision) = {
            let current = self.account.lock().expect("repository session");
            let session = current
                .as_ref()
                .filter(|id| id.as_ref() == account)
                .ok_or(Error::NotSignedIn)?
                .clone();
            let Some(revision) = cache
                .lock()
                .expect("cache lock")
                .begin_repository_refresh(account, id)?
            else {
                return Ok(None);
            };

            (session, revision)
        };
        let result = fetch.await;
        let current = self.account.lock().expect("repository session");

        if !current.as_ref().is_some_and(|id| Arc::ptr_eq(id, &session)) {
            return Err(Error::NotSignedIn);
        }

        let repository = match result {
            Ok(repository) => repository,
            Err(Error::Http(403 | 404)) => None,
            Err(Error::GitHub(errors))
                if errors.iter().any(|error| {
                    error.is_access_denied() || error.kind.as_deref() == Some("NOT_FOUND")
                }) =>
            {
                None
            }
            Err(error) => return Err(error),
        };

        cache.lock().expect("cache lock").finish_repository_refresh(
            account,
            id,
            revision,
            repository.as_ref(),
        )
    }
}

#[cfg(test)]
#[path = "repositories.test.rs"]
mod tests;

#[path = "repository_issues.rs"]
mod issues;
