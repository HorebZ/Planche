use super::*;

#[test]
fn personal_oauth_never_accepts_a_previously_granted_repository_or_org_scope() {
    assert!(restricted_scopes(Some("project")).unwrap().is_empty());
    assert_eq!(restricted_scopes(Some("")).unwrap(), ["project"]);

    for scopes in [
        "repo,project",
        "read:org,project",
        "public_repo,project",
        "admin:org,project",
    ] {
        assert!(matches!(
            restricted_scopes(Some(scopes)),
            Err(Error::OAuth(_))
        ));
    }

    assert!(matches!(
        restricted_scopes(None),
        Err(Error::ClassicTokenRequired)
    ));
}

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
fn github_app_tokens_do_not_require_legacy_oauth_scopes() {
    assert!(token_scopes("ghu_user-token", None).unwrap().is_empty());
    assert!(token_scopes("ghu_user-token", Some("")).unwrap().is_empty());
    assert!(matches!(
        token_scopes("github_pat_fine-grained", None),
        Err(Error::ClassicTokenRequired)
    ));
    assert!(matches!(
        token_scopes("ghs_installation", None),
        Err(Error::ClassicTokenRequired)
    ));
    assert_eq!(
        token_scopes("ghp_classic", Some("repo, read:org")).unwrap(),
        ["project"]
    );
}

#[test]
fn auth_absent_scopes_header_requires_a_classic_token() {
    assert!(matches!(
        missing_scopes(None),
        Err(Error::ClassicTokenRequired)
    ));
}
#[test]
fn cached_identity_belongs_to_the_exact_verified_credential() {
    let path = std::env::temp_dir().join(format!(
        "planche-auth-identity-{}.sqlite",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    let cache = crate::cache::Cache::open(&path).unwrap();
    let first = super::AuthStatus {
        id: Some(crate::domain::UserId("A".into())),
        login: Some("a".into()),
        ..Default::default()
    };
    let second = super::AuthStatus {
        id: Some(crate::domain::UserId("B".into())),
        login: Some("b".into()),
        ..Default::default()
    };
    cache.set("account_id", "unverified-old-account").unwrap();

    assert!(super::cached_status(&cache, "token-a").unwrap().is_none());
    super::remember_status(&cache, "token-a", &first).unwrap();
    super::remember_status(&cache, "token-b", &second).unwrap();

    assert_eq!(
        super::cached_status(&cache, " token-a ").unwrap(),
        Some(first)
    );
    assert_eq!(
        super::cached_status(&cache, "token-b").unwrap(),
        Some(second)
    );
    assert!(
        super::cached_status(&cache, "unknown-token")
            .unwrap()
            .is_none()
    );
}
