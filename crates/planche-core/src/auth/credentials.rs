use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use security_framework::passwords::{self, PasswordOptions};

use crate::error::{Error, Result};

const SERVICE: &str = "dev.planche.app.auth.login-keychain.v1";
const ACCOUNT: &str = "github.com";

fn legacy_path() -> Result<PathBuf> {
    let home =
        std::env::var_os("HOME").ok_or_else(|| Error::Credentials("HOME is not set".into()))?;

    Ok(PathBuf::from(home).join("Library/Application Support/dev.planche.app/auth/token"))
}

pub(super) fn lock() -> Result<File> {
    lock_at(&legacy_path()?.with_file_name("session.lock"))
}

fn lock_at(path: &Path) -> Result<File> {
    let dir = path
        .parent()
        .ok_or_else(|| Error::Credentials("invalid session path".into()))?;

    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
        .map_err(storage_error)?;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).map_err(storage_error)?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(storage_error)?;
    file.set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(storage_error)?;
    file.lock().map_err(storage_error)?;

    Ok(file)
}

fn options() -> PasswordOptions {
    let mut options = PasswordOptions::new_generic_password(SERVICE, ACCOUNT);

    options.set_access_synchronized(Some(false));

    options
}

fn read_keychain() -> Result<String> {
    let bytes = passwords::generic_password(options()).map_err(keychain_error)?;

    decode(&bytes)
}

fn write_keychain(token: &str) -> Result<()> {
    let mut options = options();
    options.set_label("Planche GitHub session");

    passwords::set_generic_password_options(token.as_bytes(), options).map_err(keychain_error)
}

pub(super) fn read() -> Result<String> {
    read_from(&legacy_path()?, read_keychain, write_keychain)
}

fn read_from(
    legacy: &Path,
    mut read: impl FnMut() -> Result<String>,
    write: impl FnOnce(&str) -> Result<()>,
) -> Result<String> {
    match read() {
        Ok(token) => {
            delete_legacy(legacy)?;

            Ok(token)
        }
        Err(Error::NotSignedIn) => {
            let token = read_legacy(legacy)?;

            write(&token)?;
            let stored = read()?;

            if stored != token {
                return Err(Error::Credentials(
                    "Keychain migration could not be verified; the saved session was kept".into(),
                ));
            }

            delete_legacy(legacy)?;

            Ok(stored)
        }
        Err(error) => Err(error),
    }
}

pub(super) fn write(token: &str) -> Result<()> {
    let legacy = legacy_path()?;

    write_keychain(token)?;
    delete_legacy(&legacy)
}

pub(super) fn delete() -> Result<()> {
    delete_from(&legacy_path()?, || {
        passwords::delete_generic_password_options(options()).map_err(keychain_error)
    })
}

fn delete_from(legacy: &Path, delete: impl FnOnce() -> Result<()>) -> Result<()> {
    // Remove the old credential first so a partial sign-out cannot migrate it back.
    delete_legacy(legacy)?;

    match delete() {
        Ok(()) | Err(Error::NotSignedIn) => Ok(()),
        Err(error) => Err(error),
    }
}

fn read_legacy(path: &Path) -> Result<String> {
    let mut file = match OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(Error::NotSignedIn);
        }
        Err(error) => return Err(storage_error(error)),
    };
    file.set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(storage_error)?;
    let mut bytes = Vec::new();

    file.read_to_end(&mut bytes).map_err(storage_error)?;

    decode(&bytes)
}

fn decode(bytes: &[u8]) -> Result<String> {
    let token = std::str::from_utf8(bytes)
        .map_err(|_| Error::Credentials("saved token is not valid UTF-8; sign in again".into()))?
        .trim();

    if token.is_empty() {
        return Err(Error::Credentials(
            "saved token is empty; sign in again".into(),
        ));
    }

    Ok(token.to_owned())
}

fn delete_legacy(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(storage_error(error)),
    }
}

fn keychain_error(error: security_framework::base::Error) -> Error {
    match error.code() {
        -25300 => Error::NotSignedIn,
        -128 => Error::Credentials(
            "Authentication cancelled. Retry to unlock your GitHub session.".into(),
        ),
        -25293 => Error::Credentials(
            "Keychain access denied. Unlock your login keychain and retry.".into(),
        ),
        code => Error::Credentials(format!(
            "Could not access macOS Keychain (macOS {code}). Unlock your login keychain and retry."
        )),
    }
}

fn storage_error(error: std::io::Error) -> Error {
    Error::Credentials(error.to_string())
}

#[cfg(test)]
#[path = "credentials.test.rs"]
mod tests;
