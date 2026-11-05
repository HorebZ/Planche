use super::*;

#[test]
fn repository_migration_preserves_existing_account_data_and_issue_actions() {
    let conn = Connection::open_in_memory().unwrap();
    for (index, migration) in MIGRATIONS[..8].iter().enumerate() {
        // Schema 4 already includes complete; schema 5 only covers its older variant.
        if index != 4 {
            conn.execute_batch(migration).unwrap();
        }
    }
    conn.pragma_update(None, "user_version", 8).unwrap();
    let mut cache = Cache {
        conn,
        pinned_account: None,
    };
    let account = UserId("A".into());
    cache.set("account_id", "A").unwrap();
    let intent = IssueIntent::SetAssignees {
        content_id: ContentId("I_1".into()),
        add: vec![],
        remove: vec![],
    };
    let seq = cache.enqueue_issue(&account, &intent).unwrap();

    migrate(&mut cache.conn).unwrap();
    migrate(&mut cache.conn).unwrap();

    assert_eq!(cache.get("account_id").unwrap().as_deref(), Some("A"));
    assert!(cache.selected_repositories(&account).unwrap().is_empty());
    assert_eq!(cache.claim_issue(&account).unwrap().unwrap().seq, seq);
    assert_eq!(cache.issue_intents(&account).unwrap(), [intent]);
}
