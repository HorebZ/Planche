use super::*;
use crate::domain::RepositoryIssueState;
use crate::fixtures::{issue_record, repository};

#[tokio::test]
async fn offline_preserves_partial_pages_and_old_sessions_or_removals_cannot_write() {
    let session = Repositories::default();
    let account = UserId("A".into());
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    session.unlock(account.clone());
    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::Open,
        milestone: None,
        labels: vec![],
    };
    let page = RepositoryIssues {
        issues: vec![issue_record().content],
        next_cursor: Some("next".into()),
        complete: false,
        fetched_at: String::new(),
    };
    session
        .refresh_issues(&cache, &account, "R_planche", &filter, None, async {
            Ok(Some(page.clone()))
        })
        .await
        .unwrap();

    let offline = session
        .refresh_issues(
            &cache,
            &account,
            "R_planche",
            &filter,
            Some("next"),
            async { Err(Error::Network("offline".into())) },
        )
        .await
        .unwrap();
    assert!(matches!(
        offline,
        RepositoryIssuesLoad::Offline {
            data: Some(RepositoryIssues {
                complete: false,
                ..
            })
        }
    ));
    let old = session
        .refresh_issues(&cache, &account, "R_planche", &filter, None, async {
            session.lock();
            session.unlock(account.clone());
            Ok(Some(RepositoryIssues {
                complete: true,
                next_cursor: None,
                ..page.clone()
            }))
        })
        .await;
    assert!(matches!(old, Err(Error::NotSignedIn)));
    let removed = session
        .refresh_issues(&cache, &account, "R_planche", &filter, None, async {
            session.remove(&cache, &account, "R_planche").unwrap();
            Ok(Some(page.clone()))
        })
        .await;
    assert!(removed.is_err());
    assert!(
        !cache
            .lock()
            .unwrap()
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .unwrap()
            .complete
    );

    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();
    let denied = session
        .refresh_issues(&cache, &account, "R_planche", &filter, None, async {
            Err(Error::Http(403))
        })
        .await
        .unwrap();
    assert_eq!(denied, RepositoryIssuesLoad::Unavailable);
    assert!(
        cache
            .lock()
            .unwrap()
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn an_old_refusal_cannot_purge_a_newer_successful_refresh() {
    let session = Repositories::default();
    let account = UserId("A".into());
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    session.unlock(account.clone());
    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::All,
        milestone: None,
        labels: vec![],
    };
    let page = RepositoryIssues {
        issues: vec![issue_record().content],
        next_cursor: None,
        complete: true,
        fetched_at: String::new(),
    };

    let result = session
        .refresh_issues(&cache, &account, "R_planche", &filter, None, async {
            session
                .refresh_issues(&cache, &account, "R_planche", &filter, None, async {
                    Ok(Some(page))
                })
                .await
                .unwrap();
            Err(Error::Http(403))
        })
        .await
        .unwrap();

    assert!(matches!(
        result,
        RepositoryIssuesLoad::Ready {
            data: RepositoryIssues { complete: true, .. }
        }
    ));
    assert!(
        cache
            .lock()
            .unwrap()
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .is_some()
    );
}
