use crate::domain::{
    ActivityEntry, ActivityKind, ContentId, ItemId, ProjectId, ProjectMeta, RateUsage, UserId,
};
use crate::github::ops::ItemsPage;
use crate::intent::Operation;
use crate::issue::comment_marker;
use crate::sync::Remote;
use crate::{Error, Result};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub(crate) struct CommentState {
    pub comments: Vec<ActivityEntry>,
    pub posts: usize,
    pub offline: bool,
    pub lost_reply: bool,
    pub uncertain_without_post: bool,
    pub refused: bool,
}

#[derive(Clone, Default)]
pub(crate) struct CommentRemote(pub Arc<Mutex<CommentState>>);

pub(crate) async fn comment_session(
    cache: crate::cache::Cache,
) -> (
    Mutex<crate::cache::Cache>,
    crate::description::Descriptions,
    UserId,
    ContentId,
) {
    let cache = Mutex::new(cache);
    let session = crate::description::Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    session.unlock(account.clone());
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((super::issue_record(), String::new())))
        })
        .await
        .unwrap();

    (cache, session, account, content)
}

impl Remote for CommentRemote {
    async fn board_page(&self, _: &str, _: u32) -> Result<(ProjectMeta, ItemsPage)> {
        panic!("comments do not fetch Projects")
    }
    async fn items_page(&self, _: &ProjectId, _: &str) -> Result<ItemsPage> {
        panic!("comments do not fetch Projects")
    }
    async fn execute(&self, _: &Operation) -> Result<Option<ItemId>> {
        panic!("comments use their reconciliation path")
    }
    fn usage(&self) -> RateUsage {
        RateUsage::default()
    }

    async fn find_comment(
        &self,
        _: &UserId,
        _: &ContentId,
        request: &str,
    ) -> Result<Option<ActivityEntry>> {
        let state = self.0.lock().unwrap();

        if state.offline {
            return Err(Error::Network("offline".into()));
        }

        Ok(state
            .comments
            .iter()
            .find(|comment| {
                comment
                    .body
                    .as_ref()
                    .is_some_and(|body| body.ends_with(&comment_marker(request)))
            })
            .cloned())
    }

    async fn post_comment(
        &self,
        _: &ContentId,
        request: &str,
        body: &str,
    ) -> Result<ActivityEntry> {
        let mut state = self.0.lock().unwrap();
        state.posts += 1;

        if state.refused {
            return Err(Error::Http(403));
        }
        if state.uncertain_without_post {
            return Err(Error::Network("reply lost before any confirmation".into()));
        }

        let entry = ActivityEntry {
            id: format!("IC_{request}"),
            kind: ActivityKind::Comment,
            author: Some("lea".into()),
            created_at: "2026-11-04T12:00:00Z".into(),
            body: Some(format!("{body}\n\n{}", comment_marker(request))),
            subject: None,
        };
        state.comments.push(entry.clone());

        if state.lost_reply {
            return Err(Error::Network("reply lost after publication".into()));
        }

        Ok(entry)
    }
}
