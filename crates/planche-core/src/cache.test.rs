use super::*;

#[test]
fn project_listing_purges_missing_and_denied_projects_with_their_local_state() {
    let mut cache = Cache::open(":memory:").unwrap();
    let meta =
        crate::github::ops::decode_project_meta(crate::github::fixtures::PROJECT_META).unwrap();
    let items = crate::github::ops::decode_project_items(crate::github::fixtures::ITEM_PAGES[0])
        .unwrap()
        .items;
    cache.write_snapshot(&meta, &items, true).unwrap();
    cache
        .enqueue(&Intent::Archive {
            project_id: meta.id.clone(),
            item_id: items[0].id.clone(),
        })
        .unwrap();
    cache.set("last_project", meta.id.as_str()).unwrap();

    for owner in ["allowed", "blocked", "removed-org"] {
        let mut other = meta.clone();
        other.id = ProjectId(owner.into());
        other.owner = owner.into();
        other.owner_is_org = true;
        other.fields.clear();
        other.views.clear();

        cache.write_snapshot(&other, &[], false).unwrap();
    }

    let mut list = cache.projects().unwrap();
    list.owners.retain(|owner| owner.login == "allowed");
    list.sso_blocked.push("blocked".into());

    cache.reconcile_projects(&list).unwrap();

    assert_eq!(cache.projects().unwrap().owners, list.owners);
    assert!(cache.snapshot(&meta.id).unwrap().is_none());
    assert!(cache.project_ref(&meta.id).unwrap().is_none());
    assert!(cache.intents(&meta.id).unwrap().is_empty());
    assert!(cache.get("last_project").unwrap().is_none());
    assert!(cache.get(&changed_key(&meta.id)).unwrap().is_none());

    for table in [
        "item",
        "item_field_value",
        "item_assignee",
        "item_label",
        "field",
        "field_option",
        "view",
    ] {
        let count: u32 = cache
            .conn
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(count, 0, "{table}");
    }

    cache.set("last_project", "allowed").unwrap();
    cache.reconcile_projects(&list).unwrap();

    assert_eq!(
        cache.get("last_project").unwrap().as_deref(),
        Some("allowed")
    );
}

#[test]
fn project_reconciliation_preserves_other_accounts_and_updates_the_offline_list() {
    let mut cache = Cache::open(":memory:").unwrap();
    let meta =
        crate::github::ops::decode_project_meta(crate::github::fixtures::PROJECT_META).unwrap();
    cache.write_snapshot(&meta, &[], true).unwrap();
    let list = cache.projects().unwrap();

    for account in ["A", "B"] {
        cache.set("account_id", account).unwrap();
        cache.reconcile_projects(&list).unwrap();
        cache
            .set(&format!("last_project:{account}"), meta.id.as_str())
            .unwrap();
    }

    let empty = ProjectList {
        owners: Vec::new(),
        sso_blocked: Vec::new(),
    };
    cache.set("account_id", "A").unwrap();

    cache.reconcile_projects(&empty).unwrap();

    assert_eq!(
        cache.get("account_projects:A").unwrap(),
        Some(serde_json::to_string(&empty).unwrap())
    );
    assert!(cache.snapshot(&meta.id).unwrap().is_some());

    cache.set("account_id", "B").unwrap();

    assert_eq!(
        cache.get("account_projects:B").unwrap(),
        Some(serde_json::to_string(&list).unwrap())
    );

    cache.reconcile_projects(&empty).unwrap();

    assert_eq!(
        cache.get("account_projects:B").unwrap(),
        Some(serde_json::to_string(&empty).unwrap())
    );
    assert!(cache.snapshot(&meta.id).unwrap().is_none());
    assert!(cache.get("last_project:A").unwrap().is_none());
    assert!(cache.get("last_project:B").unwrap().is_none());
}

#[test]
fn read_only_projects_remain_readable_and_reject_new_project_writes_without_losing_the_queue() {
    let mut cache = Cache::open(":memory:").unwrap();
    let mut meta =
        crate::github::ops::decode_project_meta(crate::github::fixtures::PROJECT_META).unwrap();
    let intent = Intent::CreateDraft {
        project_id: meta.id.clone(),
        item_id: ItemId("draft-test".into()),
        field_id: meta
            .fields
            .iter()
            .find(|field| field.name == "Status")
            .unwrap()
            .id
            .clone(),
        column: None,
        title: "Draft".into(),
    };
    cache.write_snapshot(&meta, &[], true).unwrap();
    cache.enqueue(&intent).unwrap();
    meta.can_update = false;
    cache.write_snapshot(&meta, &[], true).unwrap();

    assert!(cache.board(&meta.id, None).unwrap().is_some());
    assert!(matches!(
        cache.enqueue(&intent),
        Err(Error::ReadOnlyProject)
    ));
    assert_eq!(cache.pending_count(&meta.id).unwrap(), 1);
}

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
    let mut cache = Cache {
        conn,
        pinned_account: None,
    };
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
    let insert_legacy = |intent: &Intent| {
        cache.conn.execute("INSERT INTO pending_mutation (project_id, item_id, intent, created_at) VALUES (?1, ?2, ?3, 'now')", params![intent.project_id().as_str(), intent.item_id().as_str(), encode_intent(intent)]).unwrap();
        cache.conn.last_insert_rowid()
    };
    let seq = insert_legacy(&intent);
    let deleted = insert_legacy(&Intent::Archive {
        project_id: board.project.id.clone(),
        item_id: board.columns[0].cards[0].item_id.clone(),
    });
    cache.remove(deleted).unwrap();

    migrate(&mut cache.conn).unwrap();
    assert!(!cache.meta(&board.project.id).unwrap().unwrap().can_update);
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
fn issue_completeness_migration_preserves_both_version_four_schemas() {
    for had_complete in [false, true] {
        let conn = Connection::open_in_memory().unwrap();

        for migration in &MIGRATIONS[..4] {
            let sql = if had_complete {
                migration.to_string()
            } else {
                migration.replace("    complete INTEGER NOT NULL DEFAULT 0,\n", "")
            };

            conn.execute_batch(&sql).unwrap();
        }

        conn.pragma_update(None, "user_version", 4).unwrap();
        let mut cache = Cache {
            conn,
            pinned_account: None,
        };
        let account = UserId("A".into());
        let issue = crate::fixtures::issue_record();
        let content = ContentId("I_standalone".into());
        let intent = IssueIntent::SetAssignees {
            content_id: content.clone(),
            add: vec![],
            remove: vec![],
        };

        cache.conn.execute(
            "INSERT INTO issue (host, account_id, content_id, content, permissions, fetched_at, revision) VALUES ('github.com', 'A', ?1, ?2, ?3, 'saved', 42)",
            params![content.as_str(), serde_json::to_string(&issue.content).unwrap(), serde_json::to_string(&issue.permissions).unwrap()],
        ).unwrap();

        if had_complete {
            cache
                .conn
                .execute("UPDATE issue SET complete = 1", [])
                .unwrap();
        }

        let seq = cache.enqueue_issue(&account, &intent).unwrap();

        migrate(&mut cache.conn).unwrap();
        migrate(&mut cache.conn).unwrap();
        let restored = cache
            .issue("github.com", &account, &content)
            .unwrap()
            .unwrap();

        assert_eq!(restored.content, issue.content);
        assert_eq!(restored.permissions, issue.permissions);
        assert_eq!(restored.fetched_at, "saved");
        assert_eq!(restored.complete, had_complete);
        assert_eq!(cache.issue_intents(&account).unwrap(), vec![intent.clone()]);
        assert!(cache.enqueue_issue(&account, &intent).unwrap() > seq);
        assert_eq!(
            cache
                .conn
                .query_row("SELECT revision FROM issue", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            42
        );
        assert_eq!(
            cache
                .conn
                .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
                .unwrap(),
            MIGRATIONS.len() as u32
        );
    }
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

#[test]
fn account_switching_restores_each_project_list_and_last_open_project() {
    let cache = Cache::open(":memory:").unwrap();
    let first = UserId("first".into());
    let second = UserId("second".into());

    cache.activate_account(&first).unwrap();
    let list = ProjectList {
        owners: vec![OwnerProjects {
            login: "first".into(),
            is_org: false,
            projects: Vec::new(),
        }],
        sso_blocked: Vec::new(),
    };
    cache.remember_projects(&list).unwrap();
    cache.set("last_project", "first-project").unwrap();

    cache.activate_account(&second).unwrap();

    assert!(cache.account_projects().unwrap().owners.is_empty());
    assert_eq!(cache.get("last_project").unwrap().as_deref(), Some(""));

    cache.activate_account(&second).unwrap();
    cache.set("last_project", "second-project").unwrap();
    cache.activate_account(&first).unwrap();

    assert_eq!(cache.account_projects().unwrap(), list);
    assert_eq!(
        cache.get("last_project").unwrap().as_deref(),
        Some("first-project")
    );

    cache.activate_account(&second).unwrap();

    assert!(cache.account_projects().unwrap().owners.is_empty());
    assert_eq!(
        cache.get("last_project").unwrap().as_deref(),
        Some("second-project")
    );
}

#[test]
fn pending_project_actions_remain_with_their_account_in_shared_projects() {
    let mut cache = Cache::open(":memory:").unwrap();
    let meta =
        crate::github::ops::decode_project_meta(crate::github::fixtures::PROJECT_META).unwrap();
    cache.write_snapshot(&meta, &[], true).unwrap();
    let first = UserId("first".into());
    let second = UserId("second".into());
    let intent = Intent::MoveCard {
        project_id: meta.id.clone(),
        item_id: ItemId("card".into()),
        field_id: FieldId("status".into()),
        to: None,
        placement: Placement::Top,
    };
    cache.activate_account(&first).unwrap();
    let first_seq = cache.enqueue(&intent).unwrap();

    cache.activate_account(&second).unwrap();

    assert!(cache.intents(intent.project_id()).unwrap().is_empty());
    assert!(cache.claim_next(intent.project_id()).unwrap().is_none());
    let second_seq = cache.enqueue(&intent).unwrap();
    assert_eq!(cache.pending_count(intent.project_id()).unwrap(), 1);
    assert_eq!(
        cache.claim_next(intent.project_id()).unwrap().unwrap().seq,
        second_seq
    );

    cache.bind_account(first);

    assert_eq!(cache.pending_count(intent.project_id()).unwrap(), 1);
    assert_eq!(cache.reset_in_flight().unwrap(), 0);
    assert_eq!(
        cache.claim_next(intent.project_id()).unwrap().unwrap().seq,
        first_seq
    );
    assert!(cache.claim_next(intent.project_id()).unwrap().is_none());
}

#[test]
fn switching_migrates_legacy_pending_actions_to_the_previous_account() {
    let mut cache = Cache::open(":memory:").unwrap();
    let meta =
        crate::github::ops::decode_project_meta(crate::github::fixtures::PROJECT_META).unwrap();
    cache.write_snapshot(&meta, &[], true).unwrap();
    let intent = Intent::Archive {
        project_id: meta.id.clone(),
        item_id: ItemId("card".into()),
    };
    cache.enqueue(&intent).unwrap();
    cache.set("account_id", "first").unwrap();

    cache.activate_account(&UserId("second".into())).unwrap();

    assert!(cache.intents(intent.project_id()).unwrap().is_empty());
    cache.activate_account(&UserId("first".into())).unwrap();
    assert_eq!(cache.intents(intent.project_id()).unwrap(), [intent]);
}

#[test]
fn project_account_migration_preserves_pending_actions_and_comment_receipts() {
    let conn = Cache::open(":memory:").unwrap().conn;
    conn.execute_batch("ALTER TABLE pending_mutation DROP COLUMN project_account_id; ALTER TABLE item DROP COLUMN draft_body").unwrap();
    conn.pragma_update(None, "user_version", 10).unwrap();
    conn.execute(
        "INSERT INTO kv (key, value) VALUES ('account_id', 'legacy-account')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO project (id, owner_login, owner_kind, number, title, url, updated_at) VALUES ('project', 'owner', 'user', 1, 'Project', 'https://github.com', 'now')", []).unwrap();
    conn.execute("INSERT INTO pending_mutation (project_id, item_id, intent, created_at) VALUES ('project', 'card', '{}', 'now')", []).unwrap();
    let project_seq = conn.last_insert_rowid();
    conn.execute("INSERT INTO pending_mutation (account_id, content_id, intent, created_at) VALUES ('legacy-account', 'issue', '{}', 'now')", []).unwrap();
    let issue_seq = conn.last_insert_rowid();
    conn.execute("INSERT INTO issue_comment (account_id, request_id, content_id, seq, body, status) VALUES ('legacy-account', 'request', 'issue', ?1, 'Saved comment', 'queued')", [issue_seq]).unwrap();
    let mut conn = conn;

    migrate(&mut conn).unwrap();

    let project_account: String = conn
        .query_row(
            "SELECT project_account_id FROM pending_mutation WHERE seq = ?1",
            [project_seq],
            |row| row.get(0),
        )
        .unwrap();
    let issue_account: (String, Option<String>) = conn
        .query_row(
            "SELECT account_id, project_account_id FROM pending_mutation WHERE seq = ?1",
            [issue_seq],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    let receipt_seq: i64 = conn
        .query_row("SELECT seq FROM issue_comment", [], |row| row.get(0))
        .unwrap();

    assert_eq!(project_account, "legacy-account");
    assert_eq!(issue_account, ("legacy-account".into(), None));
    assert_eq!(receipt_seq, issue_seq);
}
