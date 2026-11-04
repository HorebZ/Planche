use std::cell::Cell;
use std::os::unix::fs::symlink;

use super::*;

#[test]
fn migration_verifies_before_removing_the_legacy_token() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    fs::write(&path, " legacy-token\n").unwrap();
    let stored = Cell::new(false);
    let reads = Cell::new(0);

    let token = read_from(
        &path,
        || {
            reads.set(reads.get() + 1);
            assert!(path.exists());

            if stored.get() {
                Ok("legacy-token".into())
            } else {
                Err(Error::NotSignedIn)
            }
        },
        |token| {
            assert_eq!(token, "legacy-token");
            assert!(path.exists());
            stored.set(true);

            Ok(())
        },
    )
    .unwrap();

    assert_eq!(token, "legacy-token");
    assert_eq!(reads.get(), 2);
    assert!(!path.exists());
}

#[test]
fn migration_keeps_the_legacy_token_when_storage_or_authentication_fails() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    fs::write(&path, "legacy-token").unwrap();

    for fail_write in [true, false] {
        let reads = Cell::new(0);
        let result = read_from(
            &path,
            || {
                reads.set(reads.get() + 1);

                if reads.get() == 1 {
                    Err(Error::NotSignedIn)
                } else {
                    Err(keychain_error(security_framework::base::Error::from_code(
                        -128,
                    )))
                }
            },
            |_| {
                if fail_write {
                    Err(Error::Credentials("storage unavailable".into()))
                } else {
                    Ok(())
                }
            },
        );

        assert!(matches!(result, Err(Error::Credentials(_))));
        assert_eq!(fs::read_to_string(&path).unwrap(), "legacy-token");
        assert_eq!(reads.get(), if fail_write { 1 } else { 2 });
    }
}

#[test]
fn migration_keeps_the_legacy_token_when_verification_does_not_match() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    fs::write(&path, "legacy-token").unwrap();
    let reads = Cell::new(0);

    let result = read_from(
        &path,
        || {
            reads.set(reads.get() + 1);

            if reads.get() == 1 {
                Err(Error::NotSignedIn)
            } else {
                Ok("unexpected-token".into())
            }
        },
        |_| Ok(()),
    );

    assert!(matches!(result, Err(Error::Credentials(_))));
    assert!(path.exists());
}

#[test]
fn keychain_errors_never_fall_back_to_a_plaintext_session() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    fs::write(&path, "legacy-token").unwrap();

    for code in [-128, -25293, -34018, -25308] {
        let result = read_from(
            &path,
            || {
                Err(keychain_error(security_framework::base::Error::from_code(
                    code,
                )))
            },
            |_| panic!("a refused unlock must not write a credential"),
        );

        assert!(matches!(result, Err(Error::Credentials(_))));
        assert!(path.exists());
    }
}

#[test]
fn an_existing_keychain_session_takes_precedence_over_the_legacy_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    fs::write(&path, "stale-token").unwrap();

    let token = read_from(
        &path,
        || Ok("keychain-token".into()),
        |_| panic!("an existing session must not be replaced"),
    )
    .unwrap();

    assert_eq!(token, "keychain-token");
    assert!(!path.exists());
}

#[test]
fn missing_corrupt_and_redirected_legacy_tokens_are_not_migrated() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");

    assert!(matches!(
        read_from(
            &path,
            || Err(Error::NotSignedIn),
            |_| panic!("missing token")
        ),
        Err(Error::NotSignedIn)
    ));

    for bytes in [&b"  "[..], &b"\xff"[..]] {
        fs::write(&path, bytes).unwrap();

        assert!(
            read_from(
                &path,
                || Err(Error::NotSignedIn),
                |_| panic!("invalid token")
            )
            .is_err()
        );
        assert!(path.exists());
    }

    fs::remove_file(&path).unwrap();
    let target = dir.path().join("unrelated");
    fs::write(&target, "unrelated-secret").unwrap();
    symlink(&target, &path).unwrap();

    assert!(
        read_from(
            &path,
            || Err(Error::NotSignedIn),
            |_| panic!("redirected token")
        )
        .is_err()
    );
    assert_eq!(fs::read_to_string(target).unwrap(), "unrelated-secret");
}

#[test]
fn sign_out_removes_legacy_data_before_deleting_the_keychain_session() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("token");
    fs::write(&path, "legacy-token").unwrap();

    let result = delete_from(&path, || {
        assert!(!path.exists());

        Err(Error::Credentials("Keychain unavailable".into()))
    });

    assert!(result.is_err());
    assert!(!path.exists());
    assert!(delete_from(&path, || Err(Error::NotSignedIn)).is_ok());
    assert!(delete_from(&path, || Ok(())).is_ok());
}

#[test]
fn credential_errors_do_not_include_the_secret() {
    let invalid = decode(b"\xff-secret").unwrap_err();

    assert_eq!(decode(b" token\n").unwrap(), "token");
    assert!(!invalid.to_string().contains("secret"));
    assert!(matches!(
        keychain_error(security_framework::base::Error::from_code(-25300)),
        Error::NotSignedIn
    ));
    assert!(
        keychain_error(security_framework::base::Error::from_code(-128))
            .to_string()
            .contains("Authentication cancelled")
    );
}

#[test]
fn session_lock_is_private_and_excludes_other_file_handles() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("auth/session.lock");
    let lock = lock_at(&path).unwrap();
    let other = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&path)
        .unwrap();

    assert_eq!(
        fs::metadata(path.parent().unwrap())
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o700
    );
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert!(other.try_lock().is_err());

    drop(lock);

    assert!(other.try_lock().is_ok());
}
