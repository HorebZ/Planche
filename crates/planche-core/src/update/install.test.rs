use super::*;
use flate2::{Compression, write::GzEncoder};

#[test]
fn extraction_rejects_links_and_unexpected_roots() {
    for (path, kind) in [
        ("Other.app/file", tar::EntryType::Regular),
        ("Planche.app/link", tar::EntryType::Symlink),
    ] {
        let mut archive = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
        let mut header = tar::Header::new_gnu();
        header.set_size(0);
        header.set_mode(0o644);
        header.set_entry_type(kind);

        if kind == tar::EntryType::Symlink {
            header.set_link_name("/tmp").unwrap();
        }

        archive.append_data(&mut header, path, &[][..]).unwrap();
        let bytes = archive.into_inner().unwrap().finish().unwrap();
        let staging = tempfile::tempdir().unwrap();

        assert!(extract(&bytes, staging.path()).is_err());
        assert!(!staging.path().join("Other.app").exists());
    }
}

#[test]
fn extraction_preserves_files_inside_the_app() {
    let mut archive = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
    let mut header = tar::Header::new_gnu();
    header.set_size(3);
    header.set_mode(0o755);
    archive
        .append_data(
            &mut header,
            "Planche.app/Contents/MacOS/planche-app",
            &b"app"[..],
        )
        .unwrap();
    let bytes = archive.into_inner().unwrap().finish().unwrap();
    let staging = tempfile::tempdir().unwrap();

    extract(&bytes, staging.path()).unwrap();

    assert_eq!(
        fs::read(
            staging
                .path()
                .join("Planche.app/Contents/MacOS/planche-app")
        )
        .unwrap(),
        b"app"
    );
    assert!(extract(b"interrupted archive", staging.path()).is_err());
}

#[test]
fn a_failed_replacement_restores_the_previous_app() {
    let root = tempfile::tempdir().unwrap();
    let target = root.path().join("Planche.app");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("version"), "old").unwrap();

    assert!(
        replace(
            &target,
            &root.path().join("missing"),
            &root.path().join("backup")
        )
        .is_err()
    );
    assert_eq!(fs::read_to_string(target.join("version")).unwrap(), "old");
    assert!(!root.path().join("backup").exists());
}

#[test]
fn successful_replacement_keeps_the_backup_until_the_caller_finishes() {
    let root = tempfile::tempdir().unwrap();
    let target = root.path().join("Planche.app");
    let staged = root.path().join("staged.app");
    let backup = root.path().join("previous.app");
    fs::create_dir(&target).unwrap();
    fs::create_dir(&staged).unwrap();
    fs::write(target.join("version"), "old").unwrap();
    fs::write(staged.join("version"), "new").unwrap();

    replace(&target, &staged, &backup).unwrap();

    assert_eq!(fs::read_to_string(target.join("version")).unwrap(), "new");
    assert_eq!(fs::read_to_string(backup.join("version")).unwrap(), "old");
}
