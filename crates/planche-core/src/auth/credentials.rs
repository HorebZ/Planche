//! Use a user-presence protected item when the app's signing permits it. Ad-hoc
//! development builds retain the legacy keychain, without a second auth dialog.

fn legacy() -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(super::KEYCHAIN_SERVICE, super::KEYCHAIN_ACCOUNT)
}

#[cfg(target_os = "macos")]
fn protected() -> keyring::Result<keyring::Entry> {
    use apple_native_keyring_store::protected::{AccessPolicy, Cred};

    Cred::build(
        super::KEYCHAIN_SERVICE,
        super::KEYCHAIN_ACCOUNT,
        AccessPolicy::RequireUserPresence,
        None,
        false,
    )
    .map(|inner| keyring::Entry { inner })
}

#[cfg(target_os = "macos")]
fn missing_entitlement(error: &keyring::Error) -> bool {
    matches!(error, keyring::Error::PlatformFailure(source)
        if source.downcast_ref::<security_framework::base::Error>()
            .is_some_and(|error| error.code() == -34018))
}

pub(super) fn read() -> keyring::Result<String> {
    #[cfg(target_os = "macos")]
    return read_with(
        || protected()?.get_password(),
        || legacy()?.get_password(),
        |token| match protected()?.set_password(token) {
            Ok(()) => retire_legacy(),
            // Do not rewrite the legacy item: it would ask for permission again.
            Err(error) if missing_entitlement(&error) => Ok(()),
            Err(error) => Err(error),
        },
    );

    #[cfg(not(target_os = "macos"))]
    legacy()?.get_password()
}

#[cfg(target_os = "macos")]
fn read_with(
    read_protected: impl FnOnce() -> keyring::Result<String>,
    read_legacy: impl FnOnce() -> keyring::Result<String>,
    migrate: impl FnOnce(&str) -> keyring::Result<()>,
) -> keyring::Result<String> {
    match read_protected() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => {
            let token = read_legacy()?;

            migrate(&token)?;

            Ok(token)
        }
        Err(error) if missing_entitlement(&error) => read_legacy(),
        // Cancellation must leave the app locked, never fall through to legacy storage.
        Err(error) => Err(error),
    }
}

pub(super) fn write(token: &str) -> keyring::Result<()> {
    #[cfg(target_os = "macos")]
    match protected()?.set_password(token) {
        Ok(()) => return retire_legacy(),
        Err(error) if missing_entitlement(&error) => {}
        Err(error) => return Err(error),
    }

    legacy()?.set_password(token)
}

#[cfg(target_os = "macos")]
fn retire_legacy() -> keyring::Result<()> {
    if let Err(error) = remove_missing_ok(legacy()?.delete_credential()) {
        // Keep the old entry authoritative if migration could not remove it.
        remove_missing_ok(protected()?.delete_credential())?;

        return Err(error);
    }

    Ok(())
}

pub(super) fn delete() -> keyring::Result<()> {
    #[cfg(target_os = "macos")]
    match remove_missing_ok(protected()?.delete_credential()) {
        Ok(()) => {}
        Err(error) if missing_entitlement(&error) => {}
        Err(error) => return Err(error),
    }

    remove_missing_ok(legacy()?.delete_credential())
}

fn remove_missing_ok(result: keyring::Result<()>) -> keyring::Result<()> {
    match result {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    fn platform_error(code: i32) -> keyring::Error {
        keyring::Error::PlatformFailure(Box::new(security_framework::base::Error::from(code)))
    }

    #[test]
    fn only_missing_entitlement_allows_legacy_fallback() {
        assert!(missing_entitlement(&platform_error(-34018)));

        for code in [-128, -25293, -25308, -25291] {
            assert!(!missing_entitlement(&platform_error(code)));
        }

        assert!(!missing_entitlement(&keyring::Error::NoEntry));
    }

    #[test]
    fn protected_read_never_touches_legacy_or_migration() {
        assert_eq!(
            read_with(
                || Ok("protected".into()),
                || panic!("legacy read"),
                |_| panic!("migration")
            )
            .unwrap(),
            "protected"
        );
        assert!(
            read_with(
                || Err(platform_error(-128)),
                || panic!("cancel fell through"),
                |_| panic!("migration")
            )
            .is_err()
        );
    }

    #[test]
    fn development_fallback_reads_once_without_rewriting() {
        assert_eq!(
            read_with(
                || Err(platform_error(-34018)),
                || Ok("legacy".into()),
                |_| panic!("rewrote legacy")
            )
            .unwrap(),
            "legacy"
        );
    }

    #[test]
    fn migration_must_succeed_before_releasing_the_token() {
        use std::cell::Cell;

        let migrated = Cell::new(false);

        assert_eq!(
            read_with(
                || Err(keyring::Error::NoEntry),
                || Ok("legacy".into()),
                |token| {
                    assert_eq!(token, "legacy");
                    migrated.set(true);
                    Ok(())
                }
            )
            .unwrap(),
            "legacy"
        );
        assert!(migrated.get());
        assert!(
            read_with(
                || Err(keyring::Error::NoEntry),
                || Ok("legacy".into()),
                |_| Err(platform_error(-128))
            )
            .is_err()
        );
    }
}
