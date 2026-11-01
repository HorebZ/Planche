use super::*;

fn session() -> Session {
    Session::new(
        "client".into(),
        CodeReply {
            device_code: "private-device-code".into(),
            user_code: "ABCD-EFGH".into(),
            expires_in: 900,
            interval: 5,
        },
    )
    .unwrap()
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
            .accept(TokenReply::Token {
                access_token: "token".into(),
                expires_in: None
            })
            .unwrap(),
        Some("token".into())
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
            .unwrap_err()
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
            .unwrap_err()
            .to_string();

        assert!(!message.contains("unexpected-secret-value"));
    }

    assert!(
        session
            .accept(TokenReply::Token {
                access_token: "token".into(),
                expires_in: Some(28800)
            })
            .is_err()
    );
    assert!(
        session
            .accept(TokenReply::Token {
                access_token: "".into(),
                expires_in: None
            })
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
    let session = Session::new("client".into(), reply).unwrap();
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
        TokenReply::Token {
            expires_in: None,
            ..
        }
    ));
}
