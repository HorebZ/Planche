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
}
