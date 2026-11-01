use super::*;
use crate::cache::Cache;
use crate::description::{Descriptions, HOST};
use crate::domain::{IssueLoad, UserId};
use crate::fixtures::{issue_record, user};
use crate::{Error, sync};
use std::sync::Mutex;

#[tokio::test]
async fn a_standalone_issue_reuses_the_description_cache_and_remains_available_offline() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    session.unlock(account.clone());

    let loaded = session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Shared description".into())))
        })
        .await
        .unwrap();

    let IssueLoad::Ready { issue } = loaded else {
        panic!("ready issue");
    };

    assert_eq!(issue.content, issue_record().content);
    assert!(!issue.fetched_at.is_empty());
    assert_eq!(
        session
            .cached(&cache, &account, &content)
            .unwrap()
            .unwrap()
            .body,
        "Shared description"
    );

    let offline = session
        .refresh_issue(&cache, &account, &content, async {
            Err(Error::Network("offline".into()))
        })
        .await
        .unwrap();

    assert_eq!(offline, IssueLoad::Offline { issue: Some(issue) });
    assert!(cache.lock().unwrap().projects().unwrap().owners.is_empty());
}

#[tokio::test]
async fn access_refusal_purges_issue_description_and_pending_actions() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    session.unlock(account.clone());
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Private description".into())))
        })
        .await
        .unwrap();
    let intent = IssueIntent::SetAssignees {
        content_id: content.clone(),
        add: vec![user("lea")],
        remove: vec![],
    };
    session.enqueue_issue(&cache, &account, &intent).unwrap();

    let result = session
        .refresh_issue(&cache, &account, &content, async { Err(Error::Http(403)) })
        .await
        .unwrap();

    assert_eq!(result, IssueLoad::Unavailable);
    assert!(
        session
            .cached_issue(&cache, &account, &content)
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
        cache
            .lock()
            .unwrap()
            .issue_intents(&account)
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn account_switch_and_late_successes_cannot_restore_private_content() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let other = UserId("B".into());
    let content = ContentId("I_standalone".into());
    session.unlock(account.clone());
    let (release, waiting) = tokio::sync::oneshot::channel();
    let late = session.refresh_issue(&cache, &account, &content, async {
        waiting.await.unwrap();
        Ok(Some((issue_record(), "Private".into())))
    });
    tokio::pin!(late);

    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1), &mut late)
            .await
            .is_err()
    );
    session
        .refresh(&cache, &account, &content, async { Ok(None) })
        .await
        .unwrap();
    release.send(()).unwrap();

    assert_eq!(late.await.unwrap(), IssueLoad::Unavailable);

    let switched = session
        .refresh_issue(&cache, &account, &content, async {
            session.lock();
            session.unlock(other.clone());
            Ok(Some((issue_record(), "Old account".into())))
        })
        .await;

    assert!(matches!(switched, Err(Error::NotSignedIn)));
    assert!(session.cached_issue(&cache, &account, &content).is_err());
    assert!(
        session
            .cached_issue(&cache, &other, &content)
            .unwrap()
            .is_none()
    );
}

#[test]
fn issue_assignment_is_idempotent_and_does_not_require_a_card() {
    let mut issue = issue_record();
    let intent = IssueIntent::SetAssignees {
        content_id: ContentId("I_standalone".into()),
        add: vec![user("lea")],
        remove: vec![],
    };

    intent.apply(&mut issue.content);
    let once = issue.clone();
    intent.apply(&mut issue.content);

    assert_eq!(issue, once);
    assert_eq!(
        intent.to_operations(),
        [Operation::AddAssignees {
            assignable_id: ContentId("I_standalone".into()),
            assignee_ids: vec![UserId("U_lea".into())],
        }]
    );

    let mut unrelated = crate::fixtures::issue("other", 1, "other/repo", "Other").content;
    let unchanged = unrelated.clone();
    intent.apply(&mut unrelated);

    assert_eq!(unrelated, unchanged);
}

#[tokio::test]
async fn issue_queue_survives_restart_and_never_claims_another_accounts_actions() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.sqlite");
    let account = UserId("A".into());
    let other = UserId("B".into());
    let intent = IssueIntent::SetAssignees {
        content_id: ContentId("I_standalone".into()),
        add: vec![user("lea")],
        remove: vec![],
    };
    let mut cache = Cache::open(&path).unwrap();
    let seq = cache.enqueue_issue(&account, &intent).unwrap();
    drop(cache);

    let mut cache = Cache::open(&path).unwrap();

    assert!(cache.claim_issue(&other).unwrap().is_none());
    assert_eq!(cache.claim_issue(&account).unwrap().unwrap().seq, seq);
    cache.reset_in_flight().unwrap();

    let offline = crate::github::fixtures::FakeOffline;

    assert!(
        sync::flush_issues(&mut cache, &offline, &account)
            .await
            .is_err()
    );
    assert_eq!(cache.issue_intents(&account).unwrap(), [intent]);
    assert!(cache.issue_intents(&other).unwrap().is_empty());
    assert_eq!(cache.claim_issue(&account).unwrap().unwrap().seq, seq);
    assert!(cache.projects().unwrap().owners.is_empty());
    assert!(
        cache
            .issue(HOST, &other, &ContentId("I_standalone".into()))
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn issue_sender_acknowledges_success_and_rolls_back_a_definitive_failure() {
    let github = crate::github::fixtures::FakeGithub::new();
    let content = github.edit(|state| {
        let ItemContent::Issue { id, .. } = &state.items[0].content else {
            panic!("issue");
        };

        id.clone()
    });
    let mut cache = Cache::open(":memory:").unwrap();
    let account = UserId("A".into());
    let intent = IssueIntent::SetAssignees {
        content_id: content,
        add: vec![user("lea")],
        remove: vec![],
    };
    cache.enqueue_issue(&account, &intent).unwrap();

    sync::flush_issues(&mut cache, &github, &account)
        .await
        .unwrap();

    assert!(cache.claim_issue(&account).unwrap().is_none());
    assert_eq!(cache.issue_intents(&account).unwrap(), [intent.clone()]);
    assert_eq!(
        github.edit(|state| state.executed.clone()),
        intent.to_operations()
    );
    assert!(cache.projects().unwrap().owners.is_empty());

    cache.enqueue_issue(&account, &intent).unwrap();
    github.edit(|state| state.fail_mutations = true);

    assert!(
        sync::flush_issues(&mut cache, &github, &account)
            .await
            .is_err()
    );
    assert!(cache.claim_issue(&account).unwrap().is_none());
    assert_eq!(cache.issue_intents(&account).unwrap(), [intent]);
}

#[tokio::test]
async fn project_sync_keys_shared_content_by_its_authenticated_viewer() {
    let github = crate::github::fixtures::FakeGithub::new();
    let mut cache = Cache::open(":memory:").unwrap();
    let content = github.edit(|state| {
        let ItemContent::Issue { id, .. } = &state.items[0].content else {
            panic!("issue");
        };

        id.clone()
    });
    cache.set("account_id", "different-local-account").unwrap();

    sync::full_sync(&mut cache, &github, "@me", 2, |_, _, _| {})
        .await
        .unwrap();

    assert!(
        cache
            .issue(HOST, &UserId("U_viewer".into()), &content)
            .unwrap()
            .is_some()
    );
    assert!(
        cache
            .issue(HOST, &UserId("different-local-account".into()), &content)
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn issue_actions_require_the_current_accounts_confirmed_permissions() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    let intent = IssueIntent::SetAssignees {
        content_id: content.clone(),
        add: vec![user("lea")],
        remove: vec![],
    };
    session.unlock(account.clone());
    let mut issue = issue_record();
    issue.permissions.as_mut().unwrap().assign = false;
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
    assert!(matches!(
        session.enqueue_issue(&cache, &UserId("B".into()), &intent),
        Err(Error::NotSignedIn)
    ));
    assert!(
        cache
            .lock()
            .unwrap()
            .issue_intents(&account)
            .unwrap()
            .is_empty()
    );
}
