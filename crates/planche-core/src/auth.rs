use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use specta::Type;

use crate::domain::{UserId, Viewer};
use crate::error::{Error, Result};
use crate::github::{GithubClient, ops};

mod credentials;

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

    cached(|| match credentials::read() {
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

    credentials::write(token).map_err(|e| Error::Keychain(e.to_string()))?;
    remember(Some(token.to_owned()));

    Ok(viewer)
}

/// Who the stored token signs in as. `login` is `None` without a token.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct AuthStatus {
    /// The viewer's node ID, for "assign me".
    pub id: Option<UserId>,
    pub login: Option<String>,
    pub avatar_url: Option<String>,
    pub missing_scopes: Vec<String>,
}

impl AuthStatus {
    fn signed_in(viewer: Viewer, missing_scopes: Vec<String>) -> Self {
        Self {
            id: Some(viewer.id),
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
    credentials::delete().map_err(|e| Error::Keychain(e.to_string()))?;
    remember(None);

    Ok(())
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

#[cfg(test)]
#[path = "auth.test.rs"]
mod tests;
