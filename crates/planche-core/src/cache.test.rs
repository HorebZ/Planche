use super::*;

#[test]
fn card_details_migration_preserves_existing_cache_data() {
    let mut conn = Connection::open_in_memory().unwrap();

    conn.execute_batch(MIGRATIONS[0]).unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();
    conn.execute(
        "INSERT INTO kv (key, value) VALUES ('viewer_login', 'camille')",
        [],
    )
    .unwrap();
    migrate(&mut conn).unwrap();

    let login: String = conn
        .query_row("SELECT value FROM kv WHERE key = 'viewer_login'", [], |r| {
            r.get(0)
        })
        .unwrap();

    assert_eq!(login, "camille");

    conn.prepare("SELECT details FROM item").unwrap();

    let details: crate::domain::CardDetails = serde_json::from_str("{}").unwrap();

    assert_eq!(details, Default::default());
    conn.prepare("SELECT host, account_id, content_id, body FROM issue_description")
        .unwrap();
}

#[test]
fn descriptions_are_scoped_by_host_account_and_content_and_survive_reopening() {
    let path = std::env::temp_dir().join(format!(
        "planche-body-isolation-{}.sqlite",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    let cache = Cache::open(&path).unwrap();
    let account = UserId("A".into());
    let issue = ContentId("issue".into());
    let revision = cache
        .begin_description("github.com", &account, &issue)
        .unwrap();

    cache
        .finish_description("github.com", &account, &issue, revision, Some("private"))
        .unwrap();
    drop(cache);
    let cache = Cache::open(&path).unwrap();

    assert_eq!(
        cache
            .issue_description("github.com", &account, &issue)
            .unwrap()
            .unwrap()
            .body,
        "private"
    );
    assert!(
        cache
            .issue_description("other.host", &account, &issue)
            .unwrap()
            .is_none()
    );
    assert!(
        cache
            .issue_description("github.com", &UserId("B".into()), &issue)
            .unwrap()
            .is_none()
    );
    assert!(
        cache
            .issue_description("github.com", &account, &ContentId("other".into()))
            .unwrap()
            .is_none()
    );
}

#[test]
fn issue_migration_preserves_legacy_intents_and_the_queue_sequence() {
    let conn = Connection::open_in_memory().unwrap();

    for migration in &MIGRATIONS[..3] {
        conn.execute_batch(migration).unwrap();
    }

    conn.pragma_update(None, "user_version", 3).unwrap();
    conn.execute("INSERT INTO project (id, owner_login, owner_kind, number, title, url, updated_at) VALUES ('PVT_1', 'HorebZ', 'user', 2, 'Planche', 'https://github.com', 'now')", []).unwrap();
    let mut cache = Cache { conn };
    let mut board = crate::fixtures::board();
    board.columns[0].cards.push(crate::fixtures::issue(
        "legacy",
        1,
        "HorebZ/Planche",
        "Legacy",
    ));
    board
        .columns
        .push(crate::fixtures::column("done", "Done", vec![]));
    let intent = Intent::move_card(
        &board,
        &board.columns[0].cards[0].item_id,
        Some(&board.columns[1]),
        Placement::Keep,
    );
    let seq = cache.enqueue(&intent).unwrap();
    let deleted = cache
        .enqueue(&Intent::Archive {
            project_id: board.project.id.clone(),
            item_id: board.columns[0].cards[0].item_id.clone(),
        })
        .unwrap();
    cache.remove(deleted).unwrap();

    migrate(&mut cache.conn).unwrap();
    let mutation = cache.claim_next(&board.project.id).unwrap().unwrap();

    assert_eq!(
        mutation,
        Mutation {
            seq,
            intent: intent.clone()
        }
    );
    let replayed = intent::apply(board, &mutation.intent);

    assert_eq!(
        replayed.columns[1].cards[0].item_id,
        ItemId("legacy".into())
    );
    let issue_seq = cache
        .enqueue_issue(
            &UserId("A".into()),
            &IssueIntent::SetAssignees {
                content_id: ContentId("I_standalone".into()),
                add: vec![],
                remove: vec![],
            },
        )
        .unwrap();

    assert!(issue_seq > deleted);
    assert!(cache.claim_next(intent.project_id()).unwrap().is_none());
}

#[test]
fn shared_content_keeps_each_projects_status_and_replays_global_actions_in_both() {
    use crate::fixtures::{issue_record, user};
    use crate::github::{
        fixtures::{ITEM_PAGES, PROJECT_META},
        ops::{decode_project_items, decode_project_meta},
    };

    let account = UserId("A".into());
    let content = ContentId("I_standalone".into());
    let mut cache = Cache::open(":memory:").unwrap();
    cache.set("account_id", account.as_str()).unwrap();
    let mut meta = decode_project_meta(PROJECT_META).unwrap();
    let mut field = meta
        .fields
        .iter()
        .find(|field| field.name == "Status")
        .unwrap()
        .clone();
    let first_option = field.options.as_ref().unwrap()[0].id.clone();
    let second_option = field.options.as_ref().unwrap()[1].id.clone();
    meta.fields = vec![field.clone()];
    meta.views.clear();
    let mut item = decode_project_items(ITEM_PAGES[0]).unwrap().items.remove(0);
    item.content = issue_record().content;
    item.single_selects = vec![(field.id.clone(), first_option.clone())];
    cache.write_snapshot(&meta, &[item.clone()], true).unwrap();
    let first_project = meta.id.clone();
    meta.id = ProjectId("PVT_other".into());
    meta.number += 1;
    field.id = FieldId("F_other".into());
    meta.fields = vec![field.clone()];
    item.id = ItemId("PVTI_other".into());
    item.single_selects = vec![(field.id, second_option.clone())];
    cache.write_snapshot(&meta, &[item], false).unwrap();

    let mut updated = issue_record();
    if let ItemContent::Issue { title, labels, .. } = &mut updated.content {
        *title = "Shared updated title".into();
        labels.push(Label {
            name: "shared".into(),
            color: "ffffff".into(),
        });
    }

    let revision = cache
        .begin_issue(crate::description::HOST, &account, &content)
        .unwrap();
    cache
        .finish_issue(
            crate::description::HOST,
            &account,
            &content,
            revision,
            Some((&updated, "Shared body")),
        )
        .unwrap();
    let seq = cache
        .enqueue_issue(
            &account,
            &IssueIntent::SetAssignees {
                content_id: content.clone(),
                add: vec![user("lea")],
                remove: vec![],
            },
        )
        .unwrap();

    for (project, option) in [(&first_project, &first_option), (&meta.id, &second_option)] {
        let board = cache.board(project, None).unwrap().unwrap();
        let column = board
            .columns
            .iter()
            .find(|column| !column.cards.is_empty())
            .unwrap();
        let card = &column.cards[0];
        let mut expected = updated.content.clone();
        cache.issue_intents(&account).unwrap()[0].apply(&mut expected);

        assert_eq!(column.option_id.as_ref(), Some(option));
        assert_eq!(card.content, expected);
        assert!(card.pending);
        assert_eq!(board.pending_count, 1);
    }

    cache.ack(seq).unwrap();
    cache.issue_intents(&account).unwrap()[0].apply(&mut updated.content);
    let revision = cache
        .begin_issue(crate::description::HOST, &account, &content)
        .unwrap();
    cache
        .finish_issue(
            crate::description::HOST,
            &account,
            &content,
            revision,
            Some((&updated, "Confirmed")),
        )
        .unwrap();

    assert!(cache.issue_intents(&account).unwrap().is_empty());
    assert_eq!(
        cache
            .board(&first_project, None)
            .unwrap()
            .unwrap()
            .pending_count,
        0
    );
    assert_eq!(
        cache
            .issue_description(crate::description::HOST, &account, &content)
            .unwrap()
            .unwrap()
            .body,
        "Confirmed"
    );
}

#[test]
fn only_a_project_fetch_started_after_a_refusal_can_restore_an_issue() {
    use crate::github::{
        fixtures::{ITEM_PAGES, PROJECT_META},
        ops::{decode_project_items, decode_project_meta},
    };

    let mut cache = Cache::open(":memory:").unwrap();
    let account = UserId("A".into());
    cache.set("account_id", account.as_str()).unwrap();
    let meta = decode_project_meta(PROJECT_META).unwrap();
    let items = decode_project_items(ITEM_PAGES[0]).unwrap().items;
    let ItemContent::Issue { id, .. } = &items[0].content else {
        panic!("issue");
    };
    cache.write_snapshot(&meta, &items, true).unwrap();
    let old_fetch = cache.issue_revision().unwrap();
    let revision = cache
        .begin_issue(crate::description::HOST, &account, id)
        .unwrap();
    let pending_fetch = cache.issue_revision().unwrap();

    cache
        .finish_issue(crate::description::HOST, &account, id, revision, None)
        .unwrap();

    for revision in [old_fetch, pending_fetch] {
        cache
            .write_snapshot_at(&meta, &items, true, revision, Some(&account))
            .unwrap();

        assert!(
            cache
                .issue(crate::description::HOST, &account, id)
                .unwrap()
                .is_none()
        );
        assert_eq!(
            cache.snapshot(&meta.id).unwrap().unwrap().1[0].content,
            ItemContent::Redacted
        );
    }

    cache.write_snapshot(&meta, &items, true).unwrap();

    let issue = cache
        .issue(crate::description::HOST, &account, id)
        .unwrap()
        .unwrap();

    assert_eq!(issue.content, items[0].content);
    assert!(!issue.complete);
    assert!(issue.permissions.is_none());
}
