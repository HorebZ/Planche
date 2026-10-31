use super::*;
use crate::error::GraphqlError;

fn cache(name: &str) -> Mutex<Cache> {
    let path = std::env::temp_dir().join(format!(
        "planche-description-{}-{name}.sqlite",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);

    Mutex::new(Cache::open(path).unwrap())
}

#[tokio::test]
async fn cached_description_survives_offline_but_not_an_access_refusal() {
    let cache = cache("access");
    let service = Descriptions::default();
    let account = UserId("account".into());
    let content = ContentId("issue".into());

    assert!(service.cached(&cache, &account, &content).is_err());
    service.unlock(account.clone());
    assert!(
        service
            .cached(&cache, &account, &content)
            .unwrap()
            .is_none()
    );

    let saved = service
        .refresh(&cache, &account, &content, async {
            Ok(Some("private body".into()))
        })
        .await
        .unwrap()
        .unwrap();

    assert_eq!(saved.body, "private body");
    assert!(!saved.fetched_at.is_empty());
    assert!(
        service
            .refresh(&cache, &account, &content, async {
                Err(Error::Network("offline".into()))
            })
            .await
            .is_err()
    );
    assert_eq!(
        service.cached(&cache, &account, &content).unwrap(),
        Some(saved)
    );

    for error in [
        Error::Unauthorized,
        Error::Http(403),
        Error::Http(404),
        Error::GitHub(vec![GraphqlError {
            kind: Some("NOT_FOUND".into()),
            message: "removed".into(),
        }]),
    ] {
        service
            .refresh(&cache, &account, &content, async {
                Ok(Some("body".into()))
            })
            .await
            .unwrap();
        let result = service
            .refresh(&cache, &account, &content, async { Err(error) })
            .await
            .unwrap();

        assert!(result.is_none());
        assert!(
            service
                .cached(&cache, &account, &content)
                .unwrap()
                .is_none()
        );
    }
}

#[tokio::test]
async fn an_old_success_cannot_restore_content_after_a_newer_refusal() {
    let cache = cache("race");
    let service = Descriptions::default();
    let account = UserId("account".into());
    let content = ContentId("issue".into());
    service.unlock(account.clone());
    let (release, waiting) = tokio::sync::oneshot::channel();
    let old = service.refresh(&cache, &account, &content, async {
        waiting.await.unwrap();
        Ok(Some("old private body".into()))
    });

    tokio::pin!(old);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1), &mut old)
            .await
            .is_err()
    );
    assert!(
        service
            .refresh(&cache, &account, &content, async { Ok(None) })
            .await
            .unwrap()
            .is_none()
    );
    release.send(()).unwrap();

    assert!(old.await.unwrap().is_none());
    assert!(
        service
            .cached(&cache, &account, &content)
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn logout_and_account_switch_reject_late_responses_and_other_accounts_cache() {
    let cache = cache("session");
    let service = Descriptions::default();
    let account = UserId("account".into());
    let other = UserId("other".into());
    let content = ContentId("issue".into());
    service.unlock(account.clone());

    let late = service
        .refresh(&cache, &account, &content, async {
            service.lock();
            service.unlock(other.clone());

            Ok(Some("old session".into()))
        })
        .await;

    assert!(matches!(late, Err(Error::NotSignedIn)));
    assert!(service.cached(&cache, &account, &content).is_err());
    assert!(service.cached(&cache, &other, &content).unwrap().is_none());
    service.unlock(account.clone());
    assert!(
        service
            .cached(&cache, &account, &content)
            .unwrap()
            .is_none()
    );
}
