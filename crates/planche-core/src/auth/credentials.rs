use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

fn path() -> Result<PathBuf> {
    let home =
        std::env::var_os("HOME").ok_or_else(|| Error::Credentials("HOME is not set".into()))?;

    Ok(PathBuf::from(home).join("Library/Application Support/dev.planche.app/auth/token"))
}

pub(super) fn read() -> Result<String> {
    read_from(&path()?)
}

fn read_from(path: &Path) -> Result<String> {
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
    let mut token = String::new();

    file.read_to_string(&mut token).map_err(storage_error)?;

    if token.trim().is_empty() {
        return Err(Error::Credentials(
            "saved token is empty; sign in again".into(),
        ));
    }

    Ok(token.trim().to_owned())
}

pub(super) fn write(token: &str) -> Result<()> {
    write_to(&path()?, token)
}

fn write_to(path: &Path, token: &str) -> Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| Error::Credentials("invalid session path".into()))?;

    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
        .map_err(storage_error)?;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).map_err(storage_error)?;

    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(storage_error)?;

    file.as_file()
        .set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(storage_error)?;
    file.write_all(token.as_bytes()).map_err(storage_error)?;
    file.as_file().sync_all().map_err(storage_error)?;
    file.persist(path)
        .map_err(|error| storage_error(error.error))?;

    Ok(())
}

pub(super) fn delete() -> Result<()> {
    delete_from(&path()?)
}

fn delete_from(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(storage_error(error)),
    }
}

fn storage_error(error: std::io::Error) -> Error {
    Error::Credentials(error.to_string())
}

#[cfg(test)]
#[path = "credentials.test.rs"]
mod tests;
