use super::*;

#[test]
fn auth_missing_scopes_names_each_absent_scope() {
    assert_eq!(missing_scopes(Some("repo, read:org")).unwrap(), ["project"]);
    assert_eq!(missing_scopes(Some("gist")).unwrap(), REQUIRED_SCOPES);
    assert!(
        missing_scopes(Some("repo, admin:org, project, workflow"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn auth_token_cache_reads_once_until_cleared() {
    use std::cell::Cell;

    let reads = Cell::new(0);
    let read = |result: Result<String>| {
        reads.set(reads.get() + 1);

        result
    };

    remember(None);

    assert!(matches!(
        cached(|| read(Err(Error::NotSignedIn))),
        Err(Error::NotSignedIn)
    ));
    assert_eq!(cached(|| read(Ok("a".into()))).unwrap(), "a");
    assert_eq!(cached(|| read(Ok("b".into()))).unwrap(), "a");
    assert_eq!(reads.get(), 2);

    remember(Some("c".into()));

    assert_eq!(cached(|| read(Ok("d".into()))).unwrap(), "c");

    remember(None);

    assert_eq!(cached(|| read(Ok("e".into()))).unwrap(), "e");
    assert_eq!(reads.get(), 3);

    remember(None);
}

#[test]
fn auth_absent_scopes_header_requires_a_classic_token() {
    assert!(matches!(
        missing_scopes(None),
        Err(Error::ClassicTokenRequired)
    ));
}
