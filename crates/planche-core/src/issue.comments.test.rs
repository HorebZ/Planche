use super::*;
use crate::description::HOST;
use crate::domain::IssueActivity;
use crate::fixtures::{CommentRemote, comment_session};

#[tokio::test]
async fn comments_survive_offline_restart_and_a_lost_reply_without_posting_twice() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("comments.sqlite");
    let (cache, session, account, content) = comment_session(Cache::open(&path).unwrap()).await;
    let intent = IssueIntent::AddComment {
        content_id: content.clone(),
        request_id: "request-1".into(),
        body: "Ready for **review**.\n".into(),
    };
    let remote = CommentRemote::default();
    remote.0.lock().unwrap().offline = true;

    let seq = session.enqueue_issue(&cache, &account, &intent).unwrap();
    assert_eq!(
        session.enqueue_issue(&cache, &account, &intent).unwrap(),
        seq
    );
    assert!(
        session
            .flush_issues(&cache, &account, &remote, |_| {})
            .await
            .is_err()
    );
    assert_eq!(remote.0.lock().unwrap().posts, 0);
    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].status,
        CommentStatus::Queued
    );
    drop(cache);

    let cache = Mutex::new(Cache::open(&path).unwrap());
    remote.0.lock().unwrap().offline = false;
    remote.0.lock().unwrap().lost_reply = true;

    assert!(
        session
            .flush_issues(&cache, &account, &remote, |_| {})
            .await
            .is_err()
    );
    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].status,
        CommentStatus::Uncertain
    );
    assert_eq!(remote.0.lock().unwrap().posts, 1);
    drop(cache);

    let cache = Mutex::new(Cache::open(&path).unwrap());
    cache
        .lock()
        .unwrap()
        .reset_issue_in_flight(&account)
        .unwrap();
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();

    assert_eq!(remote.0.lock().unwrap().posts, 1);
    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].status,
        CommentStatus::Sent
    );
    assert_eq!(
        session.enqueue_issue(&cache, &account, &intent).unwrap(),
        seq
    );
    let confirmed = session
        .cached_activity(&cache, &account, &content)
        .unwrap()
        .unwrap();
    assert_eq!(confirmed.entries.len(), 1);
    assert!(
        confirmed.entries[0]
            .body
            .as_ref()
            .unwrap()
            .starts_with("Ready for **review**.\n")
    );
    assert_eq!(
        intent.to_operations(),
        [Operation::AddComment {
            content_id: content.clone(),
            request_id: "request-1".into(),
            body: "Ready for **review**.\n".into()
        }]
    );

    let activity = IssueActivity {
        entries: remote.0.lock().unwrap().comments.clone(),
        pull_requests: vec![],
        fetched_at: String::new(),
    };
    session
        .refresh_activity(&cache, &account, &content, async { Ok(Some(activity)) })
        .await
        .unwrap();

    assert_eq!(
        session
            .cached_activity(&cache, &account, &content)
            .unwrap()
            .unwrap()
            .entries
            .len(),
        1
    );

    session
        .refresh_activity(&cache, &account, &content, async {
            Ok(Some(IssueActivity {
                entries: vec![],
                pull_requests: vec![],
                fetched_at: String::new(),
            }))
        })
        .await
        .unwrap();

    assert!(
        session
            .cached_activity(&cache, &account, &content)
            .unwrap()
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        cache
            .lock()
            .unwrap()
            .comments(&UserId("B".into()), &content)
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        session.comments(&cache, &UserId("B".into()), &content),
        Err(Error::NotSignedIn)
    ));
}

#[tokio::test]
async fn uncertain_absence_needs_an_explicit_retry_and_keeps_the_original_text() {
    let (cache, session, account, content) =
        comment_session(Cache::open(":memory:").unwrap()).await;
    let intent = IssueIntent::AddComment {
        content_id: content.clone(),
        request_id: "request-2".into(),
        body: "Do not lose this text".into(),
    };
    let remote = CommentRemote::default();
    remote.0.lock().unwrap().uncertain_without_post = true;
    session.enqueue_issue(&cache, &account, &intent).unwrap();

    assert!(
        session
            .flush_issues(&cache, &account, &remote, |_| {})
            .await
            .is_err()
    );
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();

    assert_eq!(remote.0.lock().unwrap().posts, 1);
    let saved = &session.comments(&cache, &account, &content).unwrap()[0];
    assert_eq!(saved.status, CommentStatus::Failed);
    assert_eq!(saved.body, "Do not lose this text");
    assert!(saved.error.as_ref().unwrap().contains("Check GitHub"));

    remote.0.lock().unwrap().uncertain_without_post = false;
    session.enqueue_issue(&cache, &account, &intent).unwrap();
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();

    assert_eq!(remote.0.lock().unwrap().posts, 2);
    assert_eq!(remote.0.lock().unwrap().comments.len(), 1);
    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].status,
        CommentStatus::Sent
    );
}

#[tokio::test]
async fn comment_validation_permissions_and_access_refusal_preserve_text_without_leaking_activity()
{
    let (cache, session, account, content) =
        comment_session(Cache::open(":memory:").unwrap()).await;
    let mut intent = IssueIntent::AddComment {
        content_id: content.clone(),
        request_id: "request-3".into(),
        body: "  \n".into(),
    };

    assert!(matches!(
        session.enqueue_issue(&cache, &account, &intent),
        Err(Error::InvalidComment(_))
    ));
    let IssueIntent::AddComment { body, .. } = &mut intent else {
        unreachable!()
    };
    *body = "Keep my draft".into();
    let mut issue = crate::fixtures::issue_record();
    issue.permissions.as_mut().unwrap().comment = false;
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue, String::new())))
        })
        .await
        .unwrap();

    assert!(matches!(
        session.enqueue_issue(&cache, &account, &intent),
        Err(Error::Http(403))
    ));
    assert!(
        session
            .comments(&cache, &account, &content)
            .unwrap()
            .is_empty()
    );

    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((crate::fixtures::issue_record(), String::new())))
        })
        .await
        .unwrap();
    session.enqueue_issue(&cache, &account, &intent).unwrap();
    let remote = CommentRemote::default();
    remote.0.lock().unwrap().refused = true;
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();

    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].status,
        CommentStatus::Failed
    );
    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].body,
        "Keep my draft"
    );

    remote.0.lock().unwrap().refused = false;
    session.enqueue_issue(&cache, &account, &intent).unwrap();
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();
    session
        .refresh_issue(&cache, &account, &content, async { Ok(None) })
        .await
        .unwrap();

    assert!(
        session
            .cached_activity(&cache, &account, &content)
            .unwrap()
            .is_none()
    );
    assert!(
        cache
            .lock()
            .unwrap()
            .issue_activity(HOST, &account, &content)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        session.comments(&cache, &account, &content).unwrap()[0].body,
        "Keep my draft"
    );
}
