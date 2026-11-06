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
        columns: vec![],
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
        columns: vec![],
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

#[test]
fn kanban_columns_follow_issue_state_with_closed_and_blocked_taking_precedence() {
    use crate::domain::{ContentId, LinkedPullRequest, PullRequestState, RepositoryIssueStatus};
    use crate::fixtures::user;
    use RepositoryIssueStatus::*;

    for (closed, blocked, draft, prs, assigned, expected) in [
        (true, true, true, 2, true, Done),
        (false, true, false, 1, true, Backlog),
        (false, true, true, 1, true, Backlog),
        (false, false, true, 2, true, InProgress),
        (false, false, true, 2, false, InProgress),
        (false, false, true, 1, false, InProgress),
        (false, false, false, 1, true, Review),
        (false, false, false, 1, false, Review),
        (false, false, false, 0, true, InProgress),
        (false, false, false, 0, false, Ready),
    ] {
        let mut content = issue_record().content;
        let ItemContent::Issue {
            id,
            state,
            details,
            assignees,
            ..
        } = &mut content
        else {
            unreachable!();
        };
        *id = ContentId("issue".into());
        *state = if closed {
            IssueState::Closed
        } else {
            IssueState::Open
        };
        details.blocked_by = u32::from(blocked);
        details.has_draft_pull_request = draft && prs > 1;
        details.pull_request = (draft && prs == 1).then(|| LinkedPullRequest {
            number: 42,
            title: "Work in progress".into(),
            state: PullRequestState::Open,
            is_draft: true,
        });
        details.pull_request_count = prs;
        if assigned {
            assignees.push(user("dev"));
        }
        let mut data = RepositoryIssues {
            issues: vec![content],
            columns: vec![],
            next_cursor: None,
            complete: true,
            fetched_at: String::new(),
        };

        data.group_columns();

        assert_eq!(
            data.columns
                .iter()
                .map(|column| column.status)
                .collect::<Vec<_>>(),
            [Backlog, Ready, InProgress, Review, Done]
        );
        assert_eq!(
            data.columns
                .iter()
                .map(|column| column.items.len())
                .sum::<usize>(),
            1
        );
        assert_eq!(
            data.columns
                .iter()
                .find(|column| column.status == expected)
                .unwrap()
                .items,
            [ContentId("issue".into())]
        );
    }
}
