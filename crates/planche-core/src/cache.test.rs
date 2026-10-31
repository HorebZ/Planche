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
