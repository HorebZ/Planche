use super::*;
use crate::domain::{RepositorySummary, SelectedRepository};

fn next_revision(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("INSERT INTO kv (key, value) VALUES ('repository_revision', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING CAST(value AS INTEGER)", [], |row| row.get(0))?)
}

impl Cache {
    pub fn selected_repositories(&self, account: &UserId) -> Result<Vec<SelectedRepository>> {
        self.conn.prepare_cached("SELECT data, unavailable FROM selected_repository WHERE account_id = ?1 ORDER BY rowid")?.query_map([account.as_str()], |row| Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?)))?.map(|row| {
            let (data, unavailable) = row?;

            Ok(SelectedRepository { repository: serde_json::from_str(&data).map_err(|error| Error::Cache(error.to_string()))?, unavailable })
        }).collect()
    }

    pub fn selected_repository(
        &self,
        account: &UserId,
        id: &str,
    ) -> Result<Option<SelectedRepository>> {
        let row: Option<(String, bool)> = self.conn.query_row("SELECT data, unavailable FROM selected_repository WHERE account_id = ?1 AND repository_id = ?2", params![account.as_str(), id], |row| Ok((row.get(0)?, row.get(1)?))).optional()?;

        row.map(|(data, unavailable)| {
            Ok(SelectedRepository {
                repository: serde_json::from_str(&data)
                    .map_err(|error| Error::Cache(error.to_string()))?,
                unavailable,
            })
        })
        .transpose()
    }

    pub fn select_repository(
        &mut self,
        account: &UserId,
        repository: &RepositorySummary,
    ) -> Result<Vec<SelectedRepository>> {
        if !repository.has_issues {
            return Err(Error::InvalidRepository(format!(
                "Issues are disabled for {}.",
                repository.full_name
            )));
        }

        let tx = self.write()?;
        let revision = next_revision(&tx)?;
        tx.execute("INSERT INTO selected_repository (account_id, repository_id, data, revision) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (account_id, repository_id) DO UPDATE SET data = excluded.data, unavailable = 0, revision = excluded.revision", params![account.as_str(), repository.id, serde_json::to_string(repository).expect("repository serializes"), revision])?;
        tx.commit()?;

        self.selected_repositories(account)
    }

    pub fn remove_repository(
        &mut self,
        account: &UserId,
        id: &str,
    ) -> Result<Vec<SelectedRepository>> {
        self.conn.execute(
            "DELETE FROM selected_repository WHERE account_id = ?1 AND repository_id = ?2",
            params![account.as_str(), id],
        )?;

        self.selected_repositories(account)
    }

    pub(crate) fn begin_repository_refresh(
        &mut self,
        account: &UserId,
        id: &str,
    ) -> Result<Option<i64>> {
        let tx = self.write()?;
        let revision = next_revision(&tx)?;
        let updated = tx.execute("UPDATE selected_repository SET revision = ?3 WHERE account_id = ?1 AND repository_id = ?2", params![account.as_str(), id, revision])?;

        tx.commit()?;

        Ok((updated == 1).then_some(revision))
    }

    pub(crate) fn finish_repository_refresh(
        &self,
        account: &UserId,
        id: &str,
        revision: i64,
        repository: Option<&RepositorySummary>,
    ) -> Result<Option<SelectedRepository>> {
        if repository.is_some_and(|repository| repository.id != id) {
            return Err(Error::Decode(
                "repository identity does not match the request".into(),
            ));
        }

        let data = repository
            .map(|repository| serde_json::to_string(repository).expect("repository serializes"));
        self.conn.execute("UPDATE selected_repository SET data = COALESCE(?4, data), unavailable = ?5 WHERE account_id = ?1 AND repository_id = ?2 AND revision = ?3", params![account.as_str(), id, revision, data, repository.is_none()])?;

        self.selected_repository(account, id)
    }
}

#[cfg(test)]
#[path = "repositories.test.rs"]
mod tests;
