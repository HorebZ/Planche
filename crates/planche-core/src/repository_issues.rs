use super::*;
use crate::domain::{
    RepositoryIssueFilter, RepositoryIssueOptions, RepositoryIssues, RepositoryIssuesLoad,
};

fn denied(error: &Error) -> bool {
    matches!(error, Error::Http(403 | 404))
        || matches!(error, Error::GitHub(errors) if errors.iter().any(|error| error.is_access_denied() || error.kind.as_deref() == Some("NOT_FOUND")))
}

impl Repositories {
    pub fn read_repository<T>(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        repository: &str,
        read: impl FnOnce(&Cache) -> Result<T>,
    ) -> Result<T> {
        let current = self.account.lock().expect("repository session");
        if current.as_deref() != Some(account) {
            return Err(Error::NotSignedIn);
        }
        let cache = cache.lock().expect("cache lock");
        if cache.selected_repository(account, repository)?.is_none() {
            return Err(Error::InvalidRepository(
                "Repository is no longer in the sidebar.".into(),
            ));
        }
        read(&cache)
    }

    pub async fn refresh_issues(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        repository: &str,
        filter: &RepositoryIssueFilter,
        after: Option<&str>,
        fetch: impl Future<Output = Result<Option<RepositoryIssues>>>,
    ) -> Result<RepositoryIssuesLoad> {
        let session = self.session(account)?;
        let selection = self.selection_revision.load(Ordering::SeqCst);
        let (revision, issue_revision) =
            self.read_repository(cache, account, repository, |cache| {
                if let Some(after) = after
                    && cache
                        .repository_issues(account, repository, filter)?
                        .is_none_or(|data| data.next_cursor.as_deref() != Some(after))
                {
                    return Err(Error::InvalidRepository(
                        "This page is no longer current. Refresh the issues.".into(),
                    ));
                }
                Ok((
                    cache.begin_repository_data(
                        account,
                        repository,
                        &serde_json::to_string(&filter.normalized()).expect("filter serializes"),
                    )?,
                    cache.issue_revision()?,
                ))
            })?;
        let result = fetch.await;
        let current = self.account.lock().expect("repository session");
        if !current.as_ref().is_some_and(|id| Arc::ptr_eq(id, &session)) {
            return Err(Error::NotSignedIn);
        }
        if selection != self.selection_revision.load(Ordering::SeqCst) {
            return Err(Error::InvalidRepository(
                "Repository selection changed. Refresh the issues.".into(),
            ));
        }
        let cache = cache.lock().expect("cache lock");
        if !cache.repository_data_is_current(
            account,
            repository,
            &serde_json::to_string(&filter.normalized()).expect("filter serializes"),
            revision,
        )? {
            return Ok(
                match cache.repository_issues(account, repository, filter)? {
                    Some(data) => RepositoryIssuesLoad::Ready { data },
                    None => RepositoryIssuesLoad::Unavailable,
                },
            );
        }

        match result {
            Ok(Some(page)) => Ok(
                match cache.finish_repository_issues(
                    account,
                    repository,
                    filter,
                    (revision, issue_revision),
                    after,
                    page,
                )? {
                    Some(data) => RepositoryIssuesLoad::Ready { data },
                    None => RepositoryIssuesLoad::Unavailable,
                },
            ),
            Ok(None) => {
                cache.clear_repository_data(account, repository)?;
                Ok(RepositoryIssuesLoad::Unavailable)
            }
            Err(error) if denied(&error) => {
                cache.clear_repository_data(account, repository)?;
                Ok(RepositoryIssuesLoad::Unavailable)
            }
            Err(Error::Network(_)) => Ok(RepositoryIssuesLoad::Offline {
                data: cache.repository_issues(account, repository, filter)?,
            }),
            Err(error) => Err(error),
        }
    }

    pub async fn refresh_issue_options(
        &self,
        cache: &Mutex<Cache>,
        account: &UserId,
        repository: &str,
        fetch: impl Future<Output = Result<Option<RepositoryIssueOptions>>>,
    ) -> Result<Option<RepositoryIssueOptions>> {
        let session = self.session(account)?;
        let selection = self.selection_revision.load(Ordering::SeqCst);
        let revision = self.read_repository(cache, account, repository, |cache| {
            cache.begin_repository_data(account, repository, "options")
        })?;
        let result = fetch.await;
        let current = self.account.lock().expect("repository session");
        if !current.as_ref().is_some_and(|id| Arc::ptr_eq(id, &session)) {
            return Err(Error::NotSignedIn);
        }
        if selection != self.selection_revision.load(Ordering::SeqCst) {
            return Err(Error::InvalidRepository(
                "Repository selection changed. Refresh the issues.".into(),
            ));
        }
        let cache = cache.lock().expect("cache lock");
        if !cache.repository_data_is_current(account, repository, "options", revision)? {
            return cache.repository_issue_options(account, repository);
        }

        match result {
            Ok(Some(options)) => {
                cache.finish_repository_data(account, repository, "options", revision, &options)?;
                cache.repository_issue_options(account, repository)
            }
            Ok(None) => {
                cache.clear_repository_data(account, repository)?;
                Ok(None)
            }
            Err(error) if denied(&error) => {
                cache.clear_repository_data(account, repository)?;
                Ok(None)
            }
            Err(error @ Error::Network(_)) => cache
                .repository_issue_options(account, repository)?
                .map(Some)
                .ok_or(error),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
#[path = "repository_issues.test.rs"]
mod tests;
