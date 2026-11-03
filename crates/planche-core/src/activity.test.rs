use super::*;
use crate::domain::{ActivityEntry, ActivityKind};

fn activity() -> IssueActivity {
    IssueActivity {
        entries: vec![ActivityEntry {
            id: "comment".into(),
            kind: ActivityKind::Comment,
            author: None,
            created_at: "2026-11-03T10:00:00Z".into(),
            body: Some("Private text".into()),
            subject: None,
        }],
        pull_requests: vec![],
        fetched_at: String::new(),
    }
}

#[tokio::test]
async fn activity_survives_restart_and_network_failure_without_crossing_scopes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.sqlite");
    let cache = Mutex::new(Cache::open(&path).unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("issue".into());
    session.unlock(account.clone());

    let saved = session
        .refresh_activity(&cache, &account, &content, async { Ok(Some(activity())) })
        .await
        .unwrap()
        .unwrap();

    assert!(!saved.fetched_at.is_empty());
    assert!(matches!(
        session
            .refresh_activity(&cache, &account, &content, async {
                Err(Error::Network("page 2 failed".into()))
            })
            .await,
        Err(Error::Network(_))
    ));
    assert_eq!(
        session.cached_activity(&cache, &account, &content).unwrap(),
        Some(saved.clone())
    );
    drop(cache);

    let cache = Mutex::new(Cache::open(&path).unwrap());

    assert_eq!(
        session.cached_activity(&cache, &account, &content).unwrap(),
        Some(saved)
    );
    assert!(
        session
            .cached_activity(&cache, &account, &ContentId("other".into()))
            .unwrap()
            .is_none()
    );
    assert!(
        session
            .cached_activity(&cache, &UserId("B".into()), &content)
            .is_err()
    );
    assert!(
        cache
            .lock()
            .unwrap()
            .issue_activity("other.host", &account, &content)
            .unwrap()
            .is_none()
    );
    session.unlock(UserId("B".into()));

    assert!(
        session
            .cached_activity(&cache, &UserId("B".into()), &content)
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn access_denial_purges_all_issue_content_and_supersedes_a_late_activity_response() {
    for error in [Error::Unauthorized, Error::Http(403), Error::Http(404)] {
        let cache = Mutex::new(Cache::open(":memory:").unwrap());
        let session = Descriptions::default();
        let account = UserId("A".into());
        let content = ContentId("I_standalone".into());
        session.unlock(account.clone());
        session
            .refresh_issue(&cache, &account, &content, async {
                Ok(Some((
                    crate::fixtures::issue_record(),
                    "Private body".into(),
                )))
            })
            .await
            .unwrap();
        session
            .refresh_activity(&cache, &account, &content, async { Ok(Some(activity())) })
            .await
            .unwrap();
        let (release, waiting) = tokio::sync::oneshot::channel();
        let late = session.refresh_activity(&cache, &account, &content, async {
            waiting.await.unwrap();
            Ok(Some(activity()))
        });
        tokio::pin!(late);

        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(1), &mut late)
                .await
                .is_err()
        );
        assert!(
            session
                .refresh_activity(&cache, &account, &content, async { Err(error) })
                .await
                .unwrap()
                .is_none()
        );
        release.send(()).unwrap();

        assert!(late.await.unwrap().is_none());
        assert!(
            session
                .cached_activity(&cache, &account, &content)
                .unwrap()
                .is_none()
        );
        assert!(
            session
                .cached(&cache, &account, &content)
                .unwrap()
                .is_none()
        );
        assert!(
            session
                .cached_issue(&cache, &account, &content)
                .unwrap()
                .is_none()
        );
    }
}

#[tokio::test]
async fn description_or_issue_refusal_also_prevents_activity_from_returning() {
    for description in [true, false] {
        let cache = Mutex::new(Cache::open(":memory:").unwrap());
        let session = Descriptions::default();
        let account = UserId("A".into());
        let content = ContentId("issue".into());
        session.unlock(account.clone());
        session
            .refresh_activity(&cache, &account, &content, async { Ok(Some(activity())) })
            .await
            .unwrap();
        let (release, waiting) = tokio::sync::oneshot::channel();
        let late = session.refresh_activity(&cache, &account, &content, async {
            waiting.await.unwrap();
            Ok(Some(activity()))
        });
        tokio::pin!(late);

        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(1), &mut late)
                .await
                .is_err()
        );
        if description {
            session
                .refresh(&cache, &account, &content, async { Ok(None) })
                .await
                .unwrap();
        } else {
            session
                .refresh_issue(&cache, &account, &content, async { Ok(None) })
                .await
                .unwrap();
        }
        release.send(()).unwrap();

        assert!(late.await.unwrap().is_none());
        assert!(
            session
                .cached_activity(&cache, &account, &content)
                .unwrap()
                .is_none()
        );
    }
}

#[tokio::test]
async fn an_old_session_cannot_save_activity_even_after_signing_back_into_the_same_account() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("issue".into());
    session.unlock(account.clone());

    let result = session
        .refresh_activity(&cache, &account, &content, async {
            session.lock();
            session.unlock(account.clone());
            Ok(Some(activity()))
        })
        .await;

    assert!(matches!(result, Err(Error::NotSignedIn)));
    assert!(
        session
            .cached_activity(&cache, &account, &content)
            .unwrap()
            .is_none()
    );
}
