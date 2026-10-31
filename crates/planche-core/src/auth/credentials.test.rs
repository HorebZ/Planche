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
