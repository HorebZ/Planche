use super::*;
use crate::domain::RepositoryIssueState;
use crate::fixtures::{issue_record, repository};

#[test]
fn pages_shortcuts_and_accounts_survive_restart_and_refusals_invalidate_late_pages() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("issues.sqlite");
    let mut cache = Cache::open(&path).unwrap();
    let account = UserId("A".into());
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::All,
        milestone: Some(7),
        labels: vec!["bug".into(), "help".into()],
    };
    cache.select_repository(&account, &repository()).unwrap();
    let key = filter_key(&filter);
    let first = RepositoryIssues {
        columns: vec![],
        issues: vec![issue_record().content],
        next_cursor: Some("page2".into()),
        complete: false,
        fetched_at: String::new(),
    };
    let revision = cache
        .begin_repository_data(&account, "R_planche", &key)
        .unwrap();

    let data = cache
        .finish_repository_issues(
            &account,
            "R_planche",
            &filter,
            (revision, 0),
            None,
            first.clone(),
        )
        .unwrap()
        .unwrap();
    assert!(!data.complete);
    assert!(!data.fetched_at.is_empty());
    assert!(
        cache
            .repository_issues(&UserId("B".into()), "R_planche", &filter)
            .unwrap()
            .is_none()
    );
    let saved = cache
        .save_repository_issue_shortcut(&account, "R_planche", &filter)
        .unwrap();
    let saved = cache
        .rename_repository_issue_shortcut(&account, "R_planche", &saved[0].id, "  Bugs  ")
        .unwrap();
    assert_eq!(saved[0].name, "Bugs");
    cache
        .rename_repository_issue_shortcut(&account, "R_planche", &saved[0].id, "bugs")
        .unwrap();
    drop(cache);

    let cache = Cache::open(&path).unwrap();
    assert_eq!(
        cache
            .repository_issue_shortcuts(&account, "R_planche")
            .unwrap()
            .len(),
        1
    );
    assert!(
        cache
            .repository_issue_shortcuts(&UserId("B".into()), "R_planche")
            .unwrap()
            .is_empty()
    );
    assert!(
        !cache
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .unwrap()
            .complete
    );
    let old = cache
        .begin_repository_data(&account, "R_planche", &key)
        .unwrap();
    let newer = cache
        .begin_repository_data(&account, "R_planche", &key)
        .unwrap();
    let final_page = RepositoryIssues {
        next_cursor: None,
        complete: true,
        ..first.clone()
    };
    let result = cache
        .finish_repository_issues(
            &account,
            "R_planche",
            &filter,
            (newer, 0),
            Some("page2"),
            final_page.clone(),
        )
        .unwrap()
        .unwrap();
    assert!(result.complete);
    assert_eq!(result.issues.len(), 1);
    cache
        .finish_repository_issues(&account, "R_planche", &filter, (old, 0), None, first)
        .unwrap();
    assert!(
        cache
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .unwrap()
            .complete
    );

    let pending = cache
        .begin_repository_data(&account, "R_planche", &key)
        .unwrap();
    cache.clear_repository_data(&account, "R_planche").unwrap();
    assert!(
        cache
            .finish_repository_issues(
                &account,
                "R_planche",
                &filter,
                (pending, 0),
                None,
                final_page
            )
            .unwrap()
            .is_none()
    );
    assert_eq!(
        cache
            .repository_issue_shortcuts(&account, "R_planche")
            .unwrap()
            .len(),
        1
    );
    assert!(
        cache
            .delete_repository_issue_shortcut(&UserId("B".into()), "R_planche", &saved[0].id)
            .unwrap()
            .is_empty()
    );
    assert!(
        cache
            .delete_repository_issue_shortcut(&account, "R_planche", &saved[0].id)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn migration_from_favorites_keeps_selection_and_shared_issue_refusal_redacts_repository_snapshots()
{
    let conn = Connection::open_in_memory().unwrap();
    for (index, migration) in MIGRATIONS[..9].iter().enumerate() {
        if index != 4 {
            conn.execute_batch(migration).unwrap();
        }
    }
    conn.pragma_update(None, "user_version", 9).unwrap();
    let mut cache = Cache {
        conn,
        pinned_account: None,
    };
    let account = UserId("A".into());
    cache.select_repository(&account, &repository()).unwrap();
    migrate(&mut cache.conn).unwrap();
    assert_eq!(cache.selected_repositories(&account).unwrap().len(), 1);

    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::All,
        milestone: None,
        labels: vec![],
    };
    let key = filter_key(&filter);
    let record = issue_record();
    let content = match &record.content {
        ItemContent::Issue { id, .. } => id.clone(),
        _ => unreachable!(),
    };
    let page = RepositoryIssues {
        columns: vec![],
        issues: vec![record.content.clone()],
        next_cursor: None,
        complete: true,
        fetched_at: String::new(),
    };
    for account in [&account, &UserId("B".into())] {
        let revision = cache
            .begin_repository_data(account, "R_planche", &key)
            .unwrap();
        cache
            .finish_repository_issues(
                account,
                "R_planche",
                &filter,
                (revision, 0),
                None,
                page.clone(),
            )
            .unwrap();
    }
    let old_revision = cache
        .begin_repository_data(&account, "R_planche", &key)
        .unwrap();
    let issue_revision = cache.begin_issue("github.com", &account, &content).unwrap();
    cache
        .finish_issue("github.com", &account, &content, issue_revision, None)
        .unwrap();

    assert!(
        cache
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .is_none()
    );
    assert!(
        cache
            .finish_repository_issues(
                &account,
                "R_planche",
                &filter,
                (old_revision, 0),
                None,
                page
            )
            .unwrap()
            .is_none()
    );
    assert!(
        cache
            .repository_issues(&UserId("B".into()), "R_planche", &filter)
            .unwrap()
            .is_some()
    );
}

#[test]
fn kanban_rebuilds_legacy_snapshots_after_pending_assignments_and_newer_issue_details() {
    use crate::domain::RepositoryIssueStatus;
    use crate::fixtures::user;

    let mut cache = Cache::open(":memory:").unwrap();
    let account = UserId("A".into());
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::All,
        milestone: None,
        labels: vec![],
    };
    let record = issue_record();
    let ItemContent::Issue { id, .. } = &record.content else {
        unreachable!()
    };
    let legacy = serde_json::json!({
        "issues": [record.content],
        "next_cursor": null,
        "complete": true,
        "fetched_at": "2026-01-01T00:00:00Z",
    });
    cache.select_repository(&account, &repository()).unwrap();
    let revision = cache
        .begin_repository_data(&account, "R_planche", &filter_key(&filter))
        .unwrap();
    cache
        .finish_repository_data(
            &account,
            "R_planche",
            &filter_key(&filter),
            revision,
            &legacy,
        )
        .unwrap();
    let read_status = |cache: &Cache| {
        cache
            .repository_issues(&account, "R_planche", &filter)
            .unwrap()
            .unwrap()
            .columns
            .into_iter()
            .find(|column| !column.items.is_empty())
            .unwrap()
            .status
    };
    assert_eq!(read_status(&cache), RepositoryIssueStatus::Ready);

    cache
        .enqueue_issue(
            &account,
            &IssueIntent::SetAssignees {
                content_id: id.clone(),
                add: vec![user("dev")],
                remove: vec![],
            },
        )
        .unwrap();

    assert_eq!(read_status(&cache), RepositoryIssueStatus::InProgress);

    let mut closed = record.clone();
    let ItemContent::Issue { state, .. } = &mut closed.content else {
        unreachable!()
    };
    *state = crate::domain::IssueState::Closed;
    let revision = cache.begin_issue("github.com", &account, id).unwrap();
    cache
        .finish_issue("github.com", &account, id, revision, Some((&closed, "")))
        .unwrap();

    assert_eq!(read_status(&cache), RepositoryIssueStatus::Done);
}

#[test]
fn bookmarks_get_unique_names_and_rename_never_overwrites_another_filter() {
    let cache = Cache::open(":memory:").unwrap();
    let account = UserId("A".into());
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::Open,
        milestone: Some(7),
        labels: vec!["bug".into()],
    };
    let first = cache
        .save_repository_issue_shortcut(&account, "repo", &filter)
        .unwrap();
    assert_eq!(first[0].name, "Filtre 1");
    let copy = cache
        .save_repository_issue_shortcut(&account, "repo", &first[0].filter)
        .unwrap();
    assert_eq!(copy[1].name, "Filtre 2");
    assert_ne!(copy[0].id, copy[1].id);
    assert_eq!(copy[0].filter, copy[1].filter);

    let renamed = cache
        .rename_repository_issue_shortcut(&account, "repo", &first[0].id, " Filtre 3 ")
        .unwrap();
    let created = cache
        .save_repository_issue_shortcut(&account, "repo", &filter)
        .unwrap();

    assert_eq!(renamed[0].id, first[0].id);
    assert_eq!(renamed[0].name, "Filtre 3");
    assert_eq!(created[2].name, "Filtre 4");
    assert_eq!(created[0].filter, filter);
    for (owner, repository, id, name) in [
        (&account, "repo", copy[1].id.as_str(), "filtre 3"),
        (&account, "repo", copy[1].id.as_str(), "  "),
        (&account, "repo", "missing", "Triage"),
        (&UserId("B".into()), "repo", copy[1].id.as_str(), "Triage"),
        (&account, "other", copy[1].id.as_str(), "Triage"),
    ] {
        assert!(
            cache
                .rename_repository_issue_shortcut(owner, repository, id, name)
                .is_err()
        );
    }
    assert_eq!(
        cache.repository_issue_shortcuts(&account, "repo").unwrap(),
        created
    );

    for (owner, repository) in [(&UserId("B".into()), "repo"), (&account, "other")] {
        assert_eq!(
            cache
                .save_repository_issue_shortcut(owner, repository, &filter)
                .unwrap()[0]
                .name,
            "Filtre 1"
        );
    }
}
