use super::*;
use crate::description::HOST;
use crate::fixtures::issue_record;

#[tokio::test]
async fn body_edits_require_issue_update_permission_and_preserve_markdown_in_the_queue() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("cache.sqlite");
    let cache = Mutex::new(Cache::open(&path).unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    let intent = IssueIntent::UpdateBody {
        content_id: content.clone(),
        body: "# Title\n\n**Markdown**  \n\n```rust\nlet ready = true;\n```\n".into(),
    };
    session.unlock(account.clone());
    let mut issue = issue_record();
    issue.permissions.as_mut().unwrap().update = false;
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue, "Original".into())))
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

    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Original".into())))
        })
        .await
        .unwrap();
    session.enqueue_issue(&cache, &account, &intent).unwrap();
    let mut projected = issue_record().content;
    intent.apply(&mut projected);

    assert_eq!(projected, issue_record().content);
    let IssueIntent::UpdateBody { body, .. } = &intent else {
        unreachable!()
    };
    assert_eq!(
        intent.to_operations(),
        [Operation::UpdateIssueBody {
            content_id: content.clone(),
            body: body.clone()
        }]
    );
    drop(cache);

    let cache = Cache::open(&path).unwrap();
    let saved = cache
        .issue_description(HOST, &account, &content)
        .unwrap()
        .unwrap();

    assert_eq!(saved.body, *body);
    assert!(saved.pending);
    assert!(
        cache
            .issue_description(HOST, &UserId("B".into()), &content)
            .unwrap()
            .is_none()
    );
    assert_eq!(cache.issue_intents(&account).unwrap(), [intent]);
}

#[tokio::test]
async fn body_edits_survive_stale_reads_and_later_confirmation_retires_superseded_edits() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    let remote = crate::github::fixtures::FakeGithub::new();
    session.unlock(account.clone());
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Original".into())))
        })
        .await
        .unwrap();

    for body in ["First edit", ""] {
        session
            .enqueue_issue(
                &cache,
                &account,
                &IssueIntent::UpdateBody {
                    content_id: content.clone(),
                    body: body.into(),
                },
            )
            .unwrap();
        session
            .flush_issues(&cache, &account, &remote, |_| {})
            .await
            .unwrap();
    }

    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();

    assert_eq!(remote.edit(|state| state.executed.len()), 2);
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Original".into())))
        })
        .await
        .unwrap();

    let saved = session.cached(&cache, &account, &content).unwrap().unwrap();
    assert_eq!(saved.body, "");
    assert!(saved.pending);

    let confirmed = session
        .refresh(&cache, &account, &content, async {
            Ok(Some(String::new()))
        })
        .await
        .unwrap()
        .unwrap();

    assert_eq!(confirmed.body, "");
    assert!(!confirmed.pending);
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
async fn a_failed_body_edit_preserves_markdown_for_manual_retry_and_an_offline_edit_remains_queued()
{
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Descriptions::default();
    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    let remote = crate::github::fixtures::FakeGithub::new();
    session.unlock(account.clone());
    session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Original".into())))
        })
        .await
        .unwrap();
    let intent = IssueIntent::UpdateBody {
        content_id: content.clone(),
        body: "Updated".into(),
    };
    session.enqueue_issue(&cache, &account, &intent).unwrap();

    assert!(
        session
            .flush_issues(
                &cache,
                &account,
                &crate::github::fixtures::FakeOffline,
                |_| {}
            )
            .await
            .is_err()
    );
    assert!(
        session
            .cached(&cache, &account, &content)
            .unwrap()
            .unwrap()
            .pending
    );
    remote.edit(|state| state.fail_mutations = true);
    let mut changes = Vec::new();
    session
        .flush_issues(&cache, &account, &remote, |change| changes.push(change))
        .await
        .unwrap();

    let restored = session.cached(&cache, &account, &content).unwrap().unwrap();
    assert_eq!(restored.body, "Updated");
    assert!(!restored.pending);
    assert!(restored.error.is_some());
    assert!(changes[0].error.is_some());
    assert!(
        cache
            .lock()
            .unwrap()
            .claim_issue(&account)
            .unwrap()
            .is_none()
    );

    remote.edit(|state| state.fail_mutations = false);
    session.enqueue_issue(&cache, &account, &intent).unwrap();
    session
        .flush_issues(&cache, &account, &remote, |_| {})
        .await
        .unwrap();
    let confirmed = session
        .refresh_issue(&cache, &account, &content, async {
            Ok(Some((issue_record(), "Updated".into())))
        })
        .await
        .unwrap();

    assert!(matches!(confirmed, crate::domain::IssueLoad::Ready { .. }));
    assert!(
        session
            .cached(&cache, &account, &content)
            .unwrap()
            .unwrap()
            .error
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
