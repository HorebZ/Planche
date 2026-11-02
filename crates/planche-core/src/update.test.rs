use super::*;
use serde_json::json;

fn manifest(version: &str, url: &str) -> Manifest {
    serde_json::from_value(json!({
        "version": version,
        "notes": "Alpha release",
        "platforms": { "darwin-aarch64": { "url": url, "signature": "signed" } }
    }))
    .unwrap()
}

#[test]
fn alpha_selection_observes_versions_platforms_and_https() {
    let selected = select_release(
        manifest("0.1.0-alpha.2", "https://github.com/update"),
        "0.1.0-alpha.1",
        "darwin-aarch64",
    )
    .unwrap()
    .unwrap();

    assert_eq!(selected.release.version, "0.1.0-alpha.2");
    assert!(
        select_release(
            manifest("0.1.0-alpha.1", "https://github.com/update"),
            "0.1.0-alpha.2",
            "darwin-aarch64"
        )
        .unwrap()
        .is_none()
    );
    assert!(
        select_release(
            manifest("0.1.0-alpha.2", "http://github.com/update"),
            "0.1.0-alpha.1",
            "darwin-aarch64"
        )
        .is_err()
    );
    assert!(
        select_release(
            manifest("0.1.0-alpha.2", "https://github.com/update"),
            "0.1.0-alpha.1",
            "darwin-x86_64"
        )
        .is_err()
    );
    assert!(
        select_release(
            manifest("invalid", "https://github.com/update"),
            "0.1.0-alpha.1",
            "darwin-aarch64"
        )
        .is_err()
    );
}

#[test]
fn signatures_bind_the_bytes_and_the_announced_version() {
    let bytes = include_bytes!("_fixtures/update.txt");
    let signature = include_str!("_fixtures/update.txt.sig");
    let key = include_str!("_fixtures/update.pub");

    assert!(verify(bytes, signature, key, "0.1.0-alpha.2").is_ok());
    assert!(verify(b"modified", signature, key, "0.1.0-alpha.2").is_err());
    assert!(verify(bytes, signature, key, "0.1.0-alpha.3").is_err());
    assert!(verify(bytes, signature, PUBLIC_KEY, "0.1.0-alpha.2").is_err());
    assert!(verify(bytes, "invalid", key, "0.1.0-alpha.2").is_err());
}

#[test]
fn installation_without_a_verified_download_leaves_the_app_untouched() {
    let updater = Updater::new("0.1.0-alpha.1");

    assert!(updater.install(|_| {}).is_err());
    assert_eq!(updater.status().phase, UpdatePhase::Idle);
}

#[test]
#[ignore = "release script supplies the signed updater archive"]
fn built_release_has_a_valid_signature_and_expected_bundle() {
    let archive = std::env::var("PLANCHE_RELEASE_ARCHIVE").expect("release archive");
    let version = std::env::var("PLANCHE_RELEASE_VERSION").expect("release version");
    let bytes = std::fs::read(&archive).unwrap();
    let signature = std::fs::read_to_string(format!("{archive}.sig")).unwrap();

    verify(&bytes, &signature, PUBLIC_KEY, &version).unwrap();
    let staging = tempfile::tempdir().unwrap();
    install::extract(&bytes, staging.path()).unwrap();
    install::validate(
        &staging.path().join("Planche.app"),
        &version,
        "planche-app".as_ref(),
    )
    .unwrap();

    let data = staging.path().join("Application Support");
    std::fs::create_dir(&data).unwrap();
    std::fs::write(data.join("token"), "private-session-fixture").unwrap();
    std::fs::write(data.join("pending_mutation"), "queued-action").unwrap();
    let info_path = staging.path().join("Planche.app/Contents/Info.plist");
    let mut old_info = plist::Value::from_file(&info_path).unwrap();
    old_info.as_dictionary_mut().unwrap().insert(
        "CFBundleShortVersionString".into(),
        plist::Value::String("0.0.0-alpha.0".into()),
    );
    old_info.to_file_xml(&info_path).unwrap();
    let signed = std::process::Command::new("/usr/bin/codesign")
        .args(["--force", "--sign", "-"])
        .arg(staging.path().join("Planche.app"))
        .output()
        .unwrap();
    assert!(signed.status.success());

    install::install_at(
        &bytes,
        &version,
        &staging
            .path()
            .join("Planche.app/Contents/MacOS/planche-app"),
    )
    .unwrap();

    install::validate(
        &staging.path().join("Planche.app"),
        &version,
        "planche-app".as_ref(),
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(data.join("token")).unwrap(),
        "private-session-fixture"
    );
    assert_eq!(
        std::fs::read_to_string(data.join("pending_mutation")).unwrap(),
        "queued-action"
    );
}
