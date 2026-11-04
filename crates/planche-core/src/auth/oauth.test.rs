use super::*;

fn token_data(token: &str, expires_in: Option<u64>) -> TokenData {
    TokenData {
        access_token: token.into(),
        expires_in,
        refresh_token: None,
        refresh_token_expires_in: None,
    }
}

fn session() -> Session {
    Session::new(
        "client".into(),
        false,
        CodeReply {
            device_code: "private-device-code".into(),
            user_code: "ABCD-EFGH".into(),
            expires_in: 900,
            interval: 5,
        },
    )
    .unwrap()
}

#[tokio::test]
async fn network_replies_cannot_commit_after_cancellation_or_a_replacement_flow() {
    let flow = DeviceFlow::default();
    *flow.session.lock().await = Some(session());
    let old_device = "private-device-code";

    flow.cancel("ABCD-EFGH").await;
    assert!(current_session(&mut *flow.session.lock().await, "ABCD-EFGH", old_device).is_err());
    let mut replacement = session();
    replacement.code.device_code = "replacement-private-code".into();
    *flow.session.lock().await = Some(replacement);
    assert!(current_session(&mut *flow.session.lock().await, "ABCD-EFGH", old_device).is_err());
    assert!(
        current_session(
            &mut *flow.session.lock().await,
            "ABCD-EFGH",
            "replacement-private-code"
        )
        .is_ok()
    );

    flow.cancel_all().await;
    assert!(flow.session.lock().await.is_none());
}

#[tokio::test(start_paused = true)]
async fn polling_waits_and_slows_down_until_authorized() {
    let mut session = session();

    assert!(session.next_poll > Instant::now());
    assert!(
        session
            .accept(TokenReply::Error {
                error: "authorization_pending".into(),
                interval: None
            })
            .unwrap()
            .is_none()
    );
    assert_eq!(session.code.interval, 5);
    assert!(
        session
            .accept(TokenReply::Error {
                error: "slow_down".into(),
                interval: Some(12)
            })
            .unwrap()
            .is_none()
    );
    assert_eq!(session.code.interval, 12);
    assert_eq!(session.next_poll, Instant::now() + Duration::from_secs(12));
    assert_eq!(
        session
            .accept(TokenReply::Token(token_data("token", None)))
            .unwrap()
            .unwrap()
            .token,
        "token"
    );
}

#[tokio::test(start_paused = true)]
async fn cancellation_expiry_and_stale_polls_never_complete_sign_in() {
    let flow = DeviceFlow::default();
    *flow.session.lock().await = Some(session());

    assert!(flow.poll("stale-code").await.is_err());
    assert!(flow.copy_code("stale-code").await.is_err());
    flow.cancel("stale-code").await;
    assert!(flow.session.lock().await.is_some());
    assert!(flow.poll("ABCD-EFGH").await.unwrap().is_none());
    flow.cancel("ABCD-EFGH").await;
    assert!(flow.poll("ABCD-EFGH").await.is_err());
    assert!(flow.copy_code("ABCD-EFGH").await.is_err());

    *flow.session.lock().await = Some(session());
    tokio::time::advance(Duration::from_secs(900)).await;

    assert!(flow.copy_code("ABCD-EFGH").await.is_err());

    assert!(
        flow.poll("ABCD-EFGH")
            .await
            .err()
            .unwrap()
            .to_string()
            .contains("expired")
    );
    assert!(flow.session.lock().await.is_none());
}

#[tokio::test]
async fn refused_expiring_and_empty_tokens_are_not_accepted() {
    let mut session = session();

    for error in ["access_denied", "expired_token", "unexpected-secret-value"] {
        let message = session
            .accept(TokenReply::Error {
                error: error.into(),
                interval: None,
            })
            .err()
            .unwrap()
            .to_string();

        assert!(!message.contains("unexpected-secret-value"));
    }

    assert!(
        session
            .accept(TokenReply::Token(token_data("token", Some(28800))))
            .is_err()
    );
    assert!(
        session
            .accept(TokenReply::Token(token_data("", None)))
            .is_err()
    );
}

#[tokio::test]
async fn wire_responses_keep_device_secrets_out_of_the_public_code() {
    let CodeResponse::Code(reply) = serde_json::from_str::<CodeResponse>(
        r#"{
        "device_code":"private-device-code","user_code":"ABCD-EFGH",
        "verification_uri":"https://github.com/login/device","expires_in":900,"interval":5
    }"#,
    )
    .unwrap() else {
        panic!("expected device authorization")
    };
    let session = Session::new("client".into(), false, reply).unwrap();
    let public = serde_json::to_string(&DeviceCode {
        user_code: session.code.user_code,
        interval: session.code.interval,
    })
    .unwrap();

    assert!(!public.contains("private-device-code"));
    assert!(public.contains("ABCD-EFGH"));
    assert!(matches!(
        serde_json::from_str::<CodeResponse>(r#"{"error":"device_flow_disabled"}"#).unwrap(),
        CodeResponse::Error { .. }
    ));
    assert!(matches!(
        serde_json::from_str::<TokenReply>(
            r#"{"access_token":"token","token_type":"bearer","scope":"repo,read:org,project"}"#
        )
        .unwrap(),
        TokenReply::Token(TokenData {
            expires_in: None,
            ..
        })
    ));
}

#[test]
fn app_device_flow_requests_rotation_without_legacy_repository_scopes() {
    assert_eq!(
        device_parameters("app", true),
        [
            ("client_id", "app".into()),
            ("scope", "offline_access".into())
        ]
    );
    assert_eq!(device_parameters("legacy", false)[1].1, "project");
}

#[test]
fn app_tokens_require_a_complete_expiring_session_and_keep_refresh_secrets_private() {
    let mut session = session();
    session.github_app = true;
    let valid = || TokenData {
        access_token: "ghu_access".into(),
        expires_in: Some(28800),
        refresh_token: Some("ghr_refresh-secret".into()),
        refresh_token_expires_in: Some(15897600),
    };

    let saved = session.accept(TokenReply::Token(valid())).unwrap().unwrap();
    let tokens = saved.oauth.unwrap();

    assert_eq!(tokens.client_id, "client");
    assert!(!tokens.needs_refresh(tokens.expires_at - 61));
    assert!(tokens.needs_refresh(tokens.expires_at - 60));

    for invalid in [
        token_data("gho_broad-token", Some(28800)),
        token_data("ghu_access", None),
        TokenData {
            expires_in: Some(0),
            ..valid()
        },
        TokenData {
            refresh_token: Some(String::new()),
            ..valid()
        },
        TokenData {
            refresh_token_expires_in: Some(1),
            ..valid()
        },
    ] {
        let error = session
            .accept(TokenReply::Token(invalid))
            .err()
            .unwrap()
            .to_string();

        assert!(!error.contains("ghu_access"));
        assert!(!error.contains("ghr_refresh-secret"));
    }
}

#[tokio::test]
async fn an_expired_refresh_token_requires_sign_in_without_a_network_request() {
    let tokens = Tokens {
        client_id: "app".into(),
        access_token: "ghu_expired".into(),
        refresh_token: "ghr_expired".into(),
        expires_at: 1,
        refresh_expires_at: 2,
    };

    assert!(matches!(refresh(&tokens).await, Err(Error::Unauthorized)));
}
