use std::os::unix::fs::symlink;

use super::*;

#[test]
fn session_survives_reopening_and_replacement_with_private_permissions() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("auth/token");

    assert!(matches!(read_from(&path), Err(Error::NotSignedIn)));
    write_to(&path, "first-token").unwrap();

    assert_eq!(read_from(&path).unwrap(), "first-token");
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

    write_to(&path, "next-token").unwrap();

    assert_eq!(read_from(&path).unwrap(), "next-token");

    delete_from(&path).unwrap();
    delete_from(&path).unwrap();

    assert!(matches!(read_from(&path), Err(Error::NotSignedIn)));
}

#[test]
fn redirects_are_not_read_and_atomic_writes_do_not_overwrite_their_target() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("unrelated");
    let path = dir.path().join("auth/token");
    fs::create_dir(path.parent().unwrap()).unwrap();
    fs::write(&target, "untouched").unwrap();
    symlink(&target, &path).unwrap();

    assert!(read_from(&path).is_err());
    write_to(&path, "token").unwrap();

    assert_eq!(fs::read_to_string(target).unwrap(), "untouched");
    assert_eq!(read_from(&path).unwrap(), "token");
    assert!(!fs::symlink_metadata(path).unwrap().file_type().is_symlink());
}
