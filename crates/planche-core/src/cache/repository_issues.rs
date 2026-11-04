use super::*;
use crate::domain::{
    RepositoryIssueFilter, RepositoryIssueOptions, RepositoryIssueShortcut, RepositoryIssues,
};
use serde::{Serialize, de::DeserializeOwned};

pub(crate) fn filter_key(filter: &RepositoryIssueFilter) -> String {
    serde_json::to_string(&filter.normalized()).expect("repository filter serializes")
}

impl Cache {
    pub(crate) fn repository_data<T: DeserializeOwned>(
        &self,
        account: &UserId,
        repository: &str,
        filter: &str,
    ) -> Result<Option<T>> {
        let data: Option<String> = self.conn.query_row("SELECT data FROM repository_issue_cache WHERE account_id = ?1 AND repository_id = ?2 AND filter = ?3", params![account.as_str(), repository, filter], |row| row.get(0)).optional()?.flatten();
        data.map(|data| {
            serde_json::from_str(&data).map_err(|error| Error::Cache(error.to_string()))
        })
        .transpose()
    }

    pub fn repository_issues(
        &self,
        account: &UserId,
        repository: &str,
        filter: &RepositoryIssueFilter,
    ) -> Result<Option<RepositoryIssues>> {
        let mut data =
            self.repository_data::<RepositoryIssues>(account, repository, &filter_key(filter))?;
        // The shared record owns newer issue details and pending issue intents across every context.
        if let Some(data) = &mut data {
            let intents = self.issue_intents(account)?;
            for content in &mut data.issues {
                if let ItemContent::Issue { id, .. } = content
                    && let Some(issue) = self.issue("github.com", account, id)?
                    && issue.fetched_at >= data.fetched_at
                {
                    *content = issue.content;
                }
                for intent in &intents {
                    intent.apply(content);
                }
            }
        }
        Ok(data)
    }

    pub fn repository_issue_options(
        &self,
        account: &UserId,
        repository: &str,
    ) -> Result<Option<RepositoryIssueOptions>> {
        self.repository_data(account, repository, "options")
    }

    pub(crate) fn begin_repository_data(
        &self,
        account: &UserId,
        repository: &str,
        filter: &str,
    ) -> Result<i64> {
        let revision: i64 = self.conn.query_row("INSERT INTO kv (key, value) VALUES ('repository_issue_revision', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING CAST(value AS INTEGER)", [], |row| row.get(0))?;
        self.conn.execute("INSERT INTO repository_issue_cache (account_id, repository_id, filter, revision) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (account_id, repository_id, filter) DO UPDATE SET revision = excluded.revision", params![account.as_str(), repository, filter, revision])?;
        Ok(revision)
    }

    pub(crate) fn repository_data_is_current(
        &self,
        account: &UserId,
        repository: &str,
        filter: &str,
        revision: i64,
    ) -> Result<bool> {
        Ok(self.conn.query_row("SELECT EXISTS(SELECT 1 FROM repository_issue_cache WHERE account_id = ?1 AND repository_id = ?2 AND filter = ?3 AND revision = ?4)", params![account.as_str(), repository, filter, revision], |row| row.get(0))?)
    }

    pub(crate) fn finish_repository_data<T: Serialize>(
        &self,
        account: &UserId,
        repository: &str,
        filter: &str,
        revision: i64,
        data: &T,
    ) -> Result<bool> {
        Ok(self.conn.execute("UPDATE repository_issue_cache SET data = ?5 WHERE account_id = ?1 AND repository_id = ?2 AND filter = ?3 AND revision = ?4", params![account.as_str(), repository, filter, revision, serde_json::to_string(data).expect("repository data serializes")])? == 1)
    }

    pub(crate) fn finish_repository_issues(
        &self,
        account: &UserId,
        repository: &str,
        filter: &RepositoryIssueFilter,
        (revision, issue_revision): (i64, i64),
        after: Option<&str>,
        mut page: RepositoryIssues,
    ) -> Result<Option<RepositoryIssues>> {
        for content in &page.issues {
            if let ItemContent::Issue { id, .. } = content {
                let denied: bool = self.conn.query_row("SELECT EXISTS(SELECT 1 FROM issue WHERE host = 'github.com' AND account_id = ?1 AND content_id = ?2 AND content IS NULL AND revision > ?3)", params![account.as_str(), id.as_str(), issue_revision], |row| row.get(0))?;
                if denied {
                    return self.repository_issues(account, repository, filter);
                }
            }
        }
        if let Some(after) = after {
            let Some(previous) = self
                .repository_issues(account, repository, filter)?
                .filter(|data| data.next_cursor.as_deref() == Some(after))
            else {
                return self.repository_issues(account, repository, filter);
            };
            let incoming: std::collections::HashSet<_> = page
                .issues
                .iter()
                .filter_map(|content| match content {
                    ItemContent::Issue { id, .. } => Some(id.clone()),
                    _ => None,
                })
                .collect();
            page.issues.splice(0..0, previous.issues.into_iter().filter(|content| matches!(content, ItemContent::Issue { id, .. } if !incoming.contains(id))));
        }
        page.issues.sort_by_key(|content| match content {
            ItemContent::Issue { number, .. } => std::cmp::Reverse(*number),
            _ => std::cmp::Reverse(0),
        });
        page.fetched_at = self
            .conn
            .query_row(&format!("SELECT {NOW}"), [], |row| row.get(0))?;
        self.finish_repository_data(account, repository, &filter_key(filter), revision, &page)?;
        self.repository_issues(account, repository, filter)
    }

    pub(crate) fn clear_repository_data(&self, account: &UserId, repository: &str) -> Result<()> {
        let rows = self.conn.prepare("SELECT data FROM repository_issue_cache WHERE account_id = ?1 AND repository_id = ?2 AND filter != 'options' AND data IS NOT NULL")?.query_map(params![account.as_str(), repository], |row| row.get::<_, String>(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
        // Invalidate every in-flight page and options response as well as the saved content.
        self.conn.execute(
            "DELETE FROM repository_issue_cache WHERE account_id = ?1 AND repository_id = ?2",
            params![account.as_str(), repository],
        )?;
        let mut ids = std::collections::HashSet::new();
        for row in rows {
            let data: RepositoryIssues =
                serde_json::from_str(&row).map_err(|error| Error::Cache(error.to_string()))?;
            ids.extend(data.issues.into_iter().filter_map(|content| match content {
                ItemContent::Issue { id, .. } => Some(id),
                _ => None,
            }));
        }
        if let Some(selected) = self.selected_repository(account, repository)? {
            let shared = self.conn.prepare("SELECT content_id FROM issue WHERE host = 'github.com' AND account_id = ?1 AND json_extract(content, '$.repo') = ?2")?.query_map(params![account.as_str(), selected.repository.full_name], |row| row.get::<_, String>(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
            ids.extend(shared.into_iter().map(ContentId));
        }
        for id in ids {
            self.invalidate_issue("github.com", account, &id)?;
            self.conn.execute("UPDATE issue_description SET body = NULL, fetched_at = NULL, revision = revision + 1 WHERE host = 'github.com' AND account_id = ?1 AND content_id = ?2", params![account.as_str(), id.as_str()])?;
        }
        Ok(())
    }

    pub fn repository_issue_shortcuts(
        &self,
        account: &UserId,
        repository: &str,
    ) -> Result<Vec<RepositoryIssueShortcut>> {
        self.conn.prepare_cached("SELECT CAST(id AS TEXT), name, filter FROM repository_issue_shortcut WHERE account_id = ?1 AND repository_id = ?2 ORDER BY id")?.query_map(params![account.as_str(), repository], |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, String>(2)?)))?.map(|row| {
            let (id, name, filter) = row?;
            Ok(RepositoryIssueShortcut { id, name, filter: serde_json::from_str(&filter).map_err(|error| Error::Cache(error.to_string()))? })
        }).collect()
    }

    pub fn save_repository_issue_shortcut(
        &self,
        account: &UserId,
        repository: &str,
        name: &str,
        filter: &RepositoryIssueFilter,
    ) -> Result<Vec<RepositoryIssueShortcut>> {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::InvalidRepository("Enter a filter name.".into()));
        }
        self.conn.execute("INSERT INTO repository_issue_shortcut (account_id, repository_id, name, filter) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (account_id, repository_id, name) DO UPDATE SET name = excluded.name, filter = excluded.filter", params![account.as_str(), repository, name, filter_key(filter)])?;
        self.repository_issue_shortcuts(account, repository)
    }

    pub fn delete_repository_issue_shortcut(
        &self,
        account: &UserId,
        repository: &str,
        id: &str,
    ) -> Result<Vec<RepositoryIssueShortcut>> {
        self.conn.execute("DELETE FROM repository_issue_shortcut WHERE account_id = ?1 AND repository_id = ?2 AND CAST(id AS TEXT) = ?3", params![account.as_str(), repository, id])?;
        self.repository_issue_shortcuts(account, repository)
    }
}

pub(super) fn redact_issue(conn: &Connection, account: &UserId, content: &ContentId) -> Result<()> {
    conn.execute("DELETE FROM repository_issue_cache WHERE account_id = ?1 AND filter != 'options' AND EXISTS(SELECT 1 FROM json_each(repository_issue_cache.data, '$.issues') WHERE json_extract(value, '$.id') = ?2)", params![account.as_str(), content.as_str()])?;
    Ok(())
}

#[cfg(test)]
#[path = "repository_issues.test.rs"]
mod tests;
