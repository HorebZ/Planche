use std::cell::Cell;

use super::*;

fn app_session() -> Session {
    Session::github_app(oauth::Tokens {
        client_id: "app-client".into(),
        access_token: "ghu_verified".into(),
        refresh_token: "ghr_initial".into(),
        expires_at: 28800,
        refresh_expires_at: 15897600,
    })
}

fn personal_session() -> Session {
    let mut session = Session::plain("gho_personal".into());
    session.restricted_oauth = true;
    session.user_id = Some(UserId("account-a".into()));

    session
}

#[tokio::test]
async fn detached_clients_cannot_reuse_a_managed_token_after_sign_out() {
    assert!(matches!(
        request_token("test-stale-managed-token", true).await,
        Err(Error::Unauthorized)
    ));
    assert_eq!(
        request_token("test-explicit-dev-token", false)
            .await
            .unwrap(),
        "test-explicit-dev-token"
    );
}

#[test]
fn attaching_organizations_preserves_personal_oauth_and_requires_the_same_account_and_session() {
    let mut personal = personal_session();
    let mut app = app_session();
    app.user_id = personal.user_id.clone();
    attach_to(&mut personal, "gho_personal", app.clone()).unwrap();
    let restored = Session::decode(&personal.encode().unwrap()).unwrap();

    assert_eq!(restored.token, "gho_personal");
    assert!(restored.restricted_oauth);
    assert_eq!(restored.app.unwrap().token, "ghu_verified");

    app.user_id = Some(UserId("account-b".into()));
    assert!(attach_to(&mut personal, "gho_personal", app).is_err());
    let mut app = app_session();
    app.user_id = personal.user_id.clone();
    assert!(attach_to(&mut personal, "old-session", app).is_err());
    assert_eq!(
        personal.app.unwrap().user_id,
        Some(UserId("account-a".into()))
    );
}

#[test]
fn organization_rotation_persists_both_credentials_without_replacing_the_primary_anchor() {
    let mut personal = personal_session();
    let mut app = app_session();
    app.user_id = personal.user_id.clone();
    let mut tokens = app.oauth.clone().unwrap();
    tokens.access_token = "ghu_new".into();
    tokens.refresh_token = "ghr_new".into();
    attach_to(&mut personal, "gho_personal", app).unwrap();
    let cache = Mutex::new(Some(personal));

    let result = persist_rotation(&cache, "ghu_verified", Some(tokens), |value| {
        let stored = Session::decode(value).unwrap();
        assert_eq!(stored.token, "gho_personal");
        assert_eq!(stored.app.as_ref().unwrap().token, "ghu_verified");
        assert_eq!(stored.app.unwrap().oauth.unwrap().refresh_token, "ghr_new");

        Ok(())
    })
    .unwrap();

    assert_eq!(result, "ghu_new");
    assert!(!cache.lock().unwrap().as_ref().unwrap().dirty());
}

#[test]
fn mismatched_companion_accounts_and_late_companion_refreshes_are_rejected() {
    let mut personal = personal_session();
    let mut app = app_session();
    app.user_id = Some(UserId("account-b".into()));
    personal.app = Some(Box::new(app));
    assert!(Session::decode(&personal.encode().unwrap()).is_err());

    for root in [
        None,
        Some(personal_session()),
        Some(Session::plain("pat-replacement".into())),
    ] {
        let cache = Mutex::new(root);
        assert!(matches!(
            persist_rotation(&cache, "ghu_verified", app_session().oauth, |_| panic!(
                "stale rotation"
            )),
            Err(Error::Unauthorized)
        ));
    }
}

#[test]
fn token_cache_reads_once_and_does_not_cache_failures() {
    let cache = Mutex::new(None);
    let reads = Cell::new(0);
    let read = |result: Result<String>| {
        reads.set(reads.get() + 1);

        result
    };

    assert!(matches!(
        cached(&cache, || read(Err(Error::NotSignedIn))),
        Err(Error::NotSignedIn)
    ));
    assert_eq!(cached(&cache, || read(Ok("a".into()))).unwrap(), "a");
    assert_eq!(cached(&cache, || read(Ok("b".into()))).unwrap(), "a");
    assert_eq!(reads.get(), 2);

    *cache.lock().unwrap() = None;

    assert_eq!(cached(&cache, || read(Ok("c".into()))).unwrap(), "c");
    assert_eq!(reads.get(), 3);
}

#[test]
fn sessions_preserve_legacy_tokens_and_reject_corrupt_oauth_data_without_leaking_secrets() {
    let session = app_session();
    let encoded = session.encode().unwrap();
    let decoded = Session::decode(&encoded).unwrap();

    assert_eq!(
        Session::decode("ghp_legacy").unwrap().encode().unwrap(),
        "ghp_legacy"
    );
    assert_eq!(decoded.token, "ghu_verified");
    assert_eq!(decoded.oauth.unwrap().refresh_token, "ghr_initial");

    for invalid in ["{secret", "{}", "{\"token\":\"secret\",\"oauth\":null}"] {
        let error = Session::decode(invalid).err().unwrap().to_string();

        assert!(!error.contains("secret"));
    }
}

#[test]
fn rotating_a_session_keeps_the_identity_anchor_and_saves_the_whole_pair() {
    let session = app_session();
    let mut rotated = session.oauth.as_ref().unwrap().clone();
    rotated.access_token = "ghu_rotated".into();
    rotated.refresh_token = "ghr_rotated".into();
    let cache = Mutex::new(Some(session));

    let token = persist_rotation(&cache, "ghu_verified", Some(rotated), |encoded| {
        let saved = Session::decode(encoded).unwrap();
        let tokens = saved.oauth.unwrap();

        assert_eq!(saved.token, "ghu_verified");
        assert_eq!(tokens.access_token, "ghu_rotated");
        assert_eq!(tokens.refresh_token, "ghr_rotated");

        Ok(())
    })
    .unwrap();

    assert_eq!(token, "ghu_rotated");
    assert!(!cache.lock().unwrap().as_ref().unwrap().dirty);
    assert_eq!(
        cached(&cache, || panic!("already loaded")).unwrap(),
        "ghu_verified"
    );
}

#[test]
fn a_failed_keychain_write_keeps_the_rotated_pair_for_retry() {
    let session = app_session();
    let mut rotated = session.oauth.as_ref().unwrap().clone();
    rotated.access_token = "ghu_rotated".into();
    rotated.refresh_token = "ghr_rotated".into();
    let cache = Mutex::new(Some(session));

    let result = persist_rotation(&cache, "ghu_verified", Some(rotated), |_| {
        Err(Error::Credentials("Keychain unavailable".into()))
    });

    assert!(result.is_err());
    assert!(cache.lock().unwrap().as_ref().unwrap().dirty);

    let token = persist_rotation(&cache, "ghu_verified", None, |encoded| {
        let saved = Session::decode(encoded).unwrap();

        assert_eq!(saved.oauth.unwrap().refresh_token, "ghr_rotated");

        Ok(())
    })
    .unwrap();

    assert_eq!(token, "ghu_rotated");
    assert!(!cache.lock().unwrap().as_ref().unwrap().dirty);
}

#[test]
fn logout_and_account_switch_prevent_a_late_refresh_from_restoring_a_session() {
    let rotated = app_session().oauth.unwrap();

    for session in [None, Some(Session::plain("other-account".into()))] {
        let cache = Mutex::new(session);

        let result = persist_rotation(&cache, "ghu_verified", Some(rotated.clone()), |_| {
            panic!("a stale refresh must not write credentials")
        });

        assert!(matches!(result, Err(Error::Unauthorized)));
    }
}

#[test]
fn refresh_failures_never_discard_pending_mutations() {
    for error in [
        Error::Credentials("locked".into()),
        Error::OAuth("invalid refresh reply".into()),
        Error::Unauthorized,
        Error::Network("offline".into()),
        Error::Http(503),
    ] {
        assert!(refresh_error(error).is_transient());
    }
}
