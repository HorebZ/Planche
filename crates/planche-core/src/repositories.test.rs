use super::*;
use crate::fixtures::repository;

#[test]
fn references_accept_github_repository_urls_and_reject_other_hosts_and_ambiguous_paths() {
    for reference in [
        "HorebZ/Planche",
        " HorebZ/Planche/ ",
        "https://github.com/HorebZ/Planche/",
        "https://github.com/HorebZ/Planche?tab=readme#intro",
    ] {
        assert_eq!(
            repository_reference(reference).unwrap(),
            ("HorebZ".into(), "Planche".into())
        );
    }
    for reference in [
        "",
        "Planche",
        "HorebZ/Planche/issues",
        "https://example.com/HorebZ/Planche",
        "http://github.com/HorebZ/Planche",
        "https://user@github.com/HorebZ/Planche",
        "HorebZ/..",
        "HorebZ/%2F",
        "HorebZ/",
        "../Planche",
    ] {
        assert!(repository_reference(reference).is_err(), "{reference}");
    }
}

#[tokio::test]
async fn favorites_survive_restart_and_follow_renames_by_id_without_duplicates_or_crossing_accounts()
 {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("repositories.sqlite");
    let cache = Mutex::new(Cache::open(&path).unwrap());
    let session = Repositories::default();
    let account = UserId("A".into());
    session.unlock(account.clone());

    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();
    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();

    assert_eq!(session.cached(&cache, &account).unwrap().len(), 1);
    drop(cache);
    let cache = Mutex::new(Cache::open(&path).unwrap());
    let renamed = RepositorySummary {
        full_name: "new-owner/new-name".into(),
        url: "https://github.com/new-owner/new-name".into(),
        owner_is_org: true,
        ..repository()
    };
    let refreshed = session
        .refresh(&cache, &account, "R_planche", async {
            Ok(Some(renamed.clone()))
        })
        .await
        .unwrap()
        .unwrap();

    assert_eq!(refreshed.repository, renamed);
    assert!(!refreshed.unavailable);
    assert_eq!(session.cached(&cache, &account).unwrap().len(), 1);
    assert!(
        cache
            .lock()
            .unwrap()
            .selected_repositories(&UserId("B".into()))
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        session.cached(&cache, &UserId("B".into())),
        Err(Error::NotSignedIn)
    ));
    assert!(cache.lock().unwrap().projects().unwrap().owners.is_empty());
}

#[tokio::test]
async fn offline_and_refused_repositories_keep_the_favorite_and_disabled_issues_cannot_be_added() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Repositories::default();
    let account = UserId("A".into());
    session.unlock(account.clone());

    assert!(matches!(
        session
            .select(&cache, &account, async {
                Ok(RepositorySummary {
                    has_issues: false,
                    ..repository()
                })
            })
            .await,
        Err(Error::InvalidRepository(_))
    ));
    assert!(session.cached(&cache, &account).unwrap().is_empty());
    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();
    assert!(
        session
            .refresh(&cache, &account, "R_planche", async {
                Err(Error::Network("offline".into()))
            })
            .await
            .is_err()
    );
    assert!(!session.cached(&cache, &account).unwrap()[0].unavailable);

    assert!(
        session
            .refresh(&cache, &account, "R_planche", async {
                Ok(Some(RepositorySummary {
                    id: "R_wrong".into(),
                    ..repository()
                }))
            })
            .await
            .is_err()
    );
    assert_eq!(
        session.cached(&cache, &account).unwrap()[0].repository,
        repository()
    );

    let refused = session
        .refresh(&cache, &account, "R_planche", async {
            Err(Error::Http(403))
        })
        .await
        .unwrap()
        .unwrap();
    assert!(refused.unavailable);
    assert_eq!(refused.repository, repository());
    let disabled = session
        .refresh(&cache, &account, "R_planche", async {
            Ok(Some(RepositorySummary {
                has_issues: false,
                archived: true,
                ..repository()
            }))
        })
        .await
        .unwrap()
        .unwrap();

    assert!(!disabled.unavailable);
    assert!(!disabled.repository.has_issues);
    assert!(disabled.repository.archived);
    assert!(
        session
            .remove(&cache, &account, "R_planche")
            .unwrap()
            .is_empty()
    );
    assert!(
        session
            .refresh(&cache, &account, "R_planche", async {
                panic!("a removed favorite must not refresh")
            })
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn removing_or_readding_a_favorite_prevents_a_late_refresh_from_restoring_old_data() {
    for readd in [false, true] {
        let cache = Mutex::new(Cache::open(":memory:").unwrap());
        let session = Repositories::default();
        let account = UserId("A".into());
        session.unlock(account.clone());
        session
            .select(&cache, &account, async { Ok(repository()) })
            .await
            .unwrap();
        let (release, waiting) = tokio::sync::oneshot::channel();
        let late = session.refresh(&cache, &account, "R_planche", async {
            waiting.await.unwrap();
            Ok(Some(repository()))
        });
        tokio::pin!(late);

        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(1), &mut late)
                .await
                .is_err()
        );
        session.remove(&cache, &account, "R_planche").unwrap();
        let renamed = RepositorySummary {
            full_name: "new-owner/new-name".into(),
            ..repository()
        };
        if readd {
            session
                .select(&cache, &account, async { Ok(renamed.clone()) })
                .await
                .unwrap();
        }
        release.send(()).unwrap();
        let result = late.await.unwrap();

        if readd {
            assert_eq!(result.unwrap().repository, renamed);
        } else {
            assert!(result.is_none());
        }
    }
}

#[tokio::test]
async fn logout_or_reauthentication_discards_a_late_selection_even_for_the_same_account() {
    for same_account in [false, true] {
        let cache = Mutex::new(Cache::open(":memory:").unwrap());
        let session = Repositories::default();
        let account = UserId("A".into());
        session.unlock(account.clone());
        let (release, waiting) = tokio::sync::oneshot::channel();
        let late = session.select(&cache, &account, async {
            waiting.await.unwrap();
            Ok(repository())
        });
        tokio::pin!(late);

        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(1), &mut late)
                .await
                .is_err()
        );
        session.lock();
        if same_account {
            session.unlock(account.clone());
        }
        release.send(()).unwrap();

        assert!(matches!(late.await, Err(Error::NotSignedIn)));
        assert!(
            cache
                .lock()
                .unwrap()
                .selected_repositories(&account)
                .unwrap()
                .is_empty()
        );
    }
}

#[tokio::test]
async fn removing_a_favorite_cancels_an_older_duplicate_add_lookup() {
    let cache = Mutex::new(Cache::open(":memory:").unwrap());
    let session = Repositories::default();
    let account = UserId("A".into());
    session.unlock(account.clone());
    session
        .select(&cache, &account, async { Ok(repository()) })
        .await
        .unwrap();
    let (release, waiting) = tokio::sync::oneshot::channel();
    let late = session.select(&cache, &account, async {
        waiting.await.unwrap();
        Ok(repository())
    });
    tokio::pin!(late);

    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1), &mut late)
            .await
            .is_err()
    );
    session.remove(&cache, &account, "R_planche").unwrap();
    release.send(()).unwrap();

    assert!(matches!(late.await, Err(Error::InvalidRepository(_))));
    assert!(session.cached(&cache, &account).unwrap().is_empty());
}
