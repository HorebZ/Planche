use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path};
use std::process::Command;

use flate2::read::GzDecoder;

use crate::{Error, Result};

pub(super) fn install(bytes: &[u8], version: &str) -> Result<()> {
    let executable = std::env::current_exe().map_err(io)?;
    install_at(bytes, version, &executable)
}

pub(super) fn install_at(bytes: &[u8], version: &str, executable: &Path) -> Result<()> {
    let bundle = executable
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .filter(|path| path.file_name().is_some_and(|name| name == "Planche.app"))
        .ok_or_else(|| Error::Update("install the packaged Planche.app before updating".into()))?;
    let parent = bundle
        .parent()
        .ok_or_else(|| Error::Update("invalid application location".into()))?;
    let staging = tempfile::Builder::new()
        .prefix(".planche-update-")
        .tempdir_in(parent)
        .map_err(|_| {
            Error::Update(
                "cannot write beside Planche.app; install it in a writable Applications folder"
                    .into(),
            )
        })?;

    extract(bytes, staging.path())?;

    let staged = staging.path().join("Planche.app");
    validate(
        &staged,
        version,
        executable.file_name().expect("executable name"),
    )?;
    let verified = Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(&staged)
        .output()
        .map_err(io)?;

    if !verified.status.success() {
        return Err(Error::Update(
            "the downloaded app's macOS signature is invalid".into(),
        ));
    }

    let backup = staging.path().join("previous.app");

    if let Err(error) = replace(bundle, &staged, &backup) {
        if backup.exists() {
            let recovery = staging.keep();

            return Err(Error::Update(format!(
                "installation failed ({error}); the previous app is preserved at {}",
                recovery.display()
            )));
        }

        return Err(io(error));
    }

    Ok(())
}

fn io(error: std::io::Error) -> Error {
    Error::Update(error.to_string())
}

pub(super) fn extract(bytes: &[u8], destination: &Path) -> Result<()> {
    let mut archive = tar::Archive::new(GzDecoder::new(Cursor::new(bytes)));
    let mut expanded = 0u64;
    let mut count = 0;

    for entry in archive.entries().map_err(io)? {
        let mut entry = entry.map_err(io)?;
        let path = entry.path().map_err(io)?;
        let components = path.components().collect::<Vec<_>>();

        if components.first() != Some(&Component::Normal("Planche.app".as_ref()))
            || components
                .iter()
                .any(|part| !matches!(part, Component::Normal(_)))
            || !(entry.header().entry_type().is_file() || entry.header().entry_type().is_dir())
        {
            return Err(Error::Update(
                "update archive contains an unsafe entry".into(),
            ));
        }

        count += 1;
        expanded = expanded
            .checked_add(entry.size())
            .ok_or_else(|| Error::Update("update archive is too large".into()))?;

        if count > 20_000 || expanded > 1024 * 1024 * 1024 {
            return Err(Error::Update(
                "update archive exceeds the extraction limit".into(),
            ));
        }

        if !entry.unpack_in(destination).map_err(io)? {
            return Err(Error::Update(
                "update archive escapes its staging directory".into(),
            ));
        }
    }

    Ok(())
}

pub(super) fn validate(
    bundle: &Path,
    version: &str,
    executable_name: &std::ffi::OsStr,
) -> Result<()> {
    let info = plist::Value::from_file(bundle.join("Contents/Info.plist"))
        .map_err(|error| Error::Update(error.to_string()))?;
    let info = info
        .as_dictionary()
        .ok_or_else(|| Error::Update("invalid application Info.plist".into()))?;

    if info
        .get("CFBundleIdentifier")
        .and_then(plist::Value::as_string)
        != Some("dev.planche.app")
        || info
            .get("CFBundleShortVersionString")
            .and_then(plist::Value::as_string)
            != Some(version)
    {
        return Err(Error::Update(
            "downloaded application identity or version does not match".into(),
        ));
    }

    let binary = bundle.join("Contents/MacOS").join(executable_name);
    let mut header = [0u8; 8];
    fs::File::open(binary)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(io)?;
    let cpu = if cfg!(target_arch = "aarch64") {
        0x0100000cu32
    } else {
        0x01000007u32
    };

    // shortcut: alpha bundles have one architecture; support fat Mach-O before releasing universal builds.
    if u32::from_le_bytes(header[..4].try_into().expect("magic")) != 0xfeedfacf
        || u32::from_le_bytes(header[4..].try_into().expect("CPU")) != cpu
    {
        return Err(Error::Update(
            "downloaded application does not match this Mac's architecture".into(),
        ));
    }

    Ok(())
}

fn replace(target: &Path, staged: &Path, backup: &Path) -> std::io::Result<()> {
    fs::rename(target, backup)?;

    if let Err(error) = fs::rename(staged, target) {
        fs::rename(backup, target)?;

        return Err(error);
    }

    Ok(())
}

#[cfg(test)]
#[path = "install.test.rs"]
mod tests;
