use super::*;
use crate::domain::ActivityEntry;
use crate::issue::{CommentStatus, CommentSubmission};

pub(super) fn settle(
    tx: &Transaction,
    account: &UserId,
    content: &ContentId,
    activity: &IssueActivity,
) -> Result<()> {
    let pending: Vec<(String, String, i64)> = tx.prepare_cached("SELECT request_id, entry, unconfirmed_reads FROM issue_comment WHERE account_id = ?1 AND content_id = ?2 AND status = 'sent' AND entry IS NOT NULL")?.query_map(params![account.as_str(), content.as_str()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<rusqlite::Result<_>>()?;

    for (request, json, reads) in pending {
        let entry: ActivityEntry =
            serde_json::from_str(&json).map_err(|error| Error::Cache(error.to_string()))?;
        let settled =
            activity.entries.iter().any(|saved| saved.id == entry.id) || reads + 1 >= ACKED_SYNCS;

        tx.execute("UPDATE issue_comment SET entry = CASE WHEN ?3 THEN NULL ELSE entry END, unconfirmed_reads = unconfirmed_reads + 1 WHERE account_id = ?1 AND request_id = ?2", params![account.as_str(), request, settled])?;
    }

    Ok(())
}

impl Cache {
    pub fn comments(
        &self,
        account: &UserId,
        content: &ContentId,
    ) -> Result<Vec<CommentSubmission>> {
        self.conn.prepare_cached(
            "SELECT request_id, body, status, error, entry FROM issue_comment WHERE account_id = ?1 AND content_id = ?2 ORDER BY seq",
        )?.query_map(params![account.as_str(), content.as_str()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, Option<String>>(4)?))
        })?.map(|row| {
            let (request_id, body, status, error, entry) = row?;

            Ok(CommentSubmission {
                request_id, body,
                status: serde_json::from_value(serde_json::Value::String(status)).map_err(|error| Error::Cache(error.to_string()))?,
                error,
                entry: entry.map(|json| serde_json::from_str(&json)).transpose().map_err(|error| Error::Cache(error.to_string()))?,
            })
        }).collect()
    }

    pub(crate) fn comment_uncertain(&self, account: &UserId, request: &str) -> Result<bool> {
        Ok(self.conn.query_row(
            "SELECT status = 'uncertain' FROM issue_comment WHERE account_id = ?1 AND request_id = ?2",
            params![account.as_str(), request], |row| row.get(0),
        )?)
    }

    pub(crate) fn mark_comment_uncertain(&self, account: &UserId, request: &str) -> Result<()> {
        self.conn.execute("UPDATE issue_comment SET status = 'uncertain' WHERE account_id = ?1 AND request_id = ?2", params![account.as_str(), request])?;

        Ok(())
    }

    pub(crate) fn finish_comment(
        &mut self,
        seq: i64,
        entry: Option<&ActivityEntry>,
        error: Option<&str>,
    ) -> Result<()> {
        let tx = self.write()?;
        let json = entry.map(|entry| serde_json::to_string(entry).expect("comment serializes"));

        tx.execute(
            "UPDATE issue_comment SET status = ?2, entry = ?3, error = ?4 WHERE seq = ?1",
            params![
                seq,
                if entry.is_some() { "sent" } else { "failed" },
                json,
                error
            ],
        )?;
        tx.execute(if entry.is_some() {
            "UPDATE pending_mutation SET status = 'acked', acked_at_sync = 0, last_error = NULL WHERE seq = ?1"
        } else { "DELETE FROM pending_mutation WHERE seq = ?1" }, [seq])?;
        if entry.is_some() {
            tx.execute("INSERT INTO issue_activity (host, account_id, content_id, revision) SELECT 'github.com', account_id, content_id, 1 FROM issue_comment WHERE seq = ?1 ON CONFLICT (host, account_id, content_id) DO UPDATE SET revision = revision + 1", [seq])?;
        }
        tx.commit()?;

        Ok(())
    }

    pub(crate) fn with_confirmed_comments(
        &self,
        account: &UserId,
        content: &ContentId,
        mut activity: Option<IssueActivity>,
    ) -> Result<Option<IssueActivity>> {
        for comment in self.comments(account, content)? {
            if comment.status != CommentStatus::Sent {
                continue;
            }
            let Some(entry) = comment.entry else {
                continue;
            };
            let activity = activity.get_or_insert_with(|| IssueActivity {
                entries: vec![],
                pull_requests: vec![],
                fetched_at: entry.created_at.clone(),
            });

            if !activity.entries.iter().any(|saved| saved.id == entry.id) {
                activity.entries.push(entry);
            }
        }

        if let Some(activity) = &mut activity {
            activity
                .entries
                .sort_by(|first, second| first.created_at.cmp(&second.created_at));
        }

        Ok(activity)
    }
}
