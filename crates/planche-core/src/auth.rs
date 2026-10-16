use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use specta::Type;

use crate::domain::Viewer;
use crate::error::{Error, Result};
use crate::github::{GithubClient, ops};

const KEYCHAIN_SERVICE: &str = "dev.planche.app";
const KEYCHAIN_ACCOUNT: &str = "github-token";

// Each dev rebuild changes the binary's ad-hoc signature, so macOS forgets "Always allow"
// and prompts on every keychain read. One read per process keeps that to one prompt.
static TOKEN: Mutex<Option<String>> = Mutex::new(None);

pub const REQUIRED_SCOPES: [&str; 3] = ["repo", "read:org", "project"];

/// The token from `PLANCHE_TOKEN`, else from the macOS keychain, read once per process.
pub fn load_token() -> Result<String> {
    if let Some(token) = std::env::var("PLANCHE_TOKEN")
        .ok()
        .filter(|t| !t.trim().is_empty())
    {
        return Ok(token.trim().to_owned());
    }
    cached(|| match entry()?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err(Error::NotSignedIn),
        Err(e) => Err(Error::Keychain(e.to_string())),
    })
}

/// The cached token, else the token `read` returns. Only a success is cached. The lock
/// is held during `read` so concurrent first calls share one keychain prompt.
fn cached(read: impl FnOnce() -> Result<String>) -> Result<String> {
    let mut cache = TOKEN.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(token) = cache.as_ref() {
        return Ok(token.clone());
    }
    let token = read()?;
    *cache = Some(token.clone());
    Ok(token)
}

fn remember(token: Option<String>) {
    *TOKEN.lock().unwrap_or_else(PoisonError::into_inner) = token;
}

/// Checks the token against GitHub and its scopes, then stores it in the keychain.
/// The keychain is left untouched when any check fails.
pub async fn login(token: &str) -> Result<Viewer> {
    let token = token.trim();
    let client = GithubClient::new(token)?;
    let (viewer, scopes) = ops::viewer(&client).await?;
    if token.starts_with("github_pat_") {
        return Err(Error::ClassicTokenRequired);
    }
    let missing = missing_scopes(scopes.as_deref())?;
    if !missing.is_empty() {
        return Err(Error::MissingScopes(missing));
    }
    entry()?
        .set_password(token)
        .map_err(|e| Error::Keychain(e.to_string()))?;
    remember(Some(token.to_owned()));
    Ok(viewer)
}

/// Who the stored token signs in as. `login` is `None` without a token.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct AuthStatus {
    pub login: Option<String>,
    pub avatar_url: Option<String>,
    pub missing_scopes: Vec<String>,
}

impl AuthStatus {
    fn signed_in(viewer: Viewer, missing_scopes: Vec<String>) -> Self {
        Self {
            login: Some(viewer.login),
            avatar_url: Some(viewer.avatar_url),
            missing_scopes,
        }
    }
}

/// Checks the stored token against GitHub. No token is not an error.
pub async fn status() -> Result<AuthStatus> {
    let token = match load_token() {
        Ok(token) => token,
        Err(Error::NotSignedIn) => return Ok(AuthStatus::default()),
        Err(e) => return Err(e),
    };
    let (viewer, scopes) = ops::viewer(&GithubClient::new(token)?).await?;
    Ok(AuthStatus::signed_in(
        viewer,
        missing_scopes(scopes.as_deref())?,
    ))
}

/// Like `login`, for the onboarding: the status of the token it just stored.
pub async fn set_token(token: &str) -> Result<AuthStatus> {
    Ok(AuthStatus::signed_in(login(token).await?, Vec::new()))
}

/// Deletes the stored token. Deleting a missing token succeeds.
pub fn sign_out() -> Result<()> {
    remember(None);
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(Error::Keychain(e.to_string())),
    }
}

/// Required scopes absent from an `x-oauth-scopes` header. A missing header means a
/// fine-grained token, which Planche refuses.
pub fn missing_scopes(header: Option<&str>) -> Result<Vec<String>> {
    let header = header.ok_or(Error::ClassicTokenRequired)?;
    let granted: Vec<&str> = header
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let covers = |required: &str| {
        granted.iter().any(|&scope| match required {
            "read:org" => matches!(scope, "read:org" | "write:org" | "admin:org"),
            other => scope == other,
        })
    };
    Ok(REQUIRED_SCOPES
        .iter()
        .filter(|required| !covers(required))
        .map(|s| (*s).to_owned())
        .collect())
}

fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|e| Error::Keychain(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_missing_scopes_names_each_absent_scope() {
        assert_eq!(missing_scopes(Some("repo, read:org")).unwrap(), ["project"]);
        assert_eq!(missing_scopes(Some("gist")).unwrap(), REQUIRED_SCOPES);
        assert!(
            missing_scopes(Some("repo, admin:org, project, workflow"))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn auth_token_cache_reads_once_until_cleared() {
        use std::cell::Cell;
        let reads = Cell::new(0);
        let read = |result: Result<String>| {
            reads.set(reads.get() + 1);
            result
        };

        remember(None);
        assert!(matches!(
            cached(|| read(Err(Error::NotSignedIn))),
            Err(Error::NotSignedIn)
        ));
        assert_eq!(cached(|| read(Ok("a".into()))).unwrap(), "a");
        assert_eq!(cached(|| read(Ok("b".into()))).unwrap(), "a");
        assert_eq!(reads.get(), 2);

        remember(Some("c".into()));
        assert_eq!(cached(|| read(Ok("d".into()))).unwrap(), "c");
        remember(None);
        assert_eq!(cached(|| read(Ok("e".into()))).unwrap(), "e");
        assert_eq!(reads.get(), 3);
        remember(None);
    }

    #[test]
    fn auth_absent_scopes_header_requires_a_classic_token() {
        assert!(matches!(
            missing_scopes(None),
            Err(Error::ClassicTokenRequired)
        ));
    }
}
