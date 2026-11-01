use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::cache::Cache;
use crate::domain::{UserId, Viewer};
use crate::error::{Error, Result};
use crate::github::{GithubClient, ops};

mod credentials;
pub mod oauth;

static TOKEN: Mutex<Option<String>> = Mutex::new(None);

pub const REQUIRED_SCOPES: [&str; 3] = ["repo", "read:org", "project"];

fn identity_key(token: &str) -> String {
    let digest: String = Sha256::digest(token.trim().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();

    format!("account_identity:github.com:{digest}")
}

pub fn cached_status(cache: &Cache, token: &str) -> Result<Option<AuthStatus>> {
    cache
        .get(&identity_key(token))?
        .map(|json| serde_json::from_str(&json).map_err(|error| Error::Cache(error.to_string())))
        .transpose()
}

pub fn remember_status(cache: &Cache, token: &str, status: &AuthStatus) -> Result<()> {
    let json = serde_json::to_string(status).map_err(|error| Error::Cache(error.to_string()))?;

    cache.set(&identity_key(token), &json)
}

/// The token from `PLANCHE_TOKEN`, else from the private session file, read once per process.
pub fn load_token() -> Result<String> {
    if let Some(token) = std::env::var("PLANCHE_TOKEN")
        .ok()
        .filter(|t| !t.trim().is_empty())
    {
        return Ok(token.trim().to_owned());
    }

    cached(credentials::read)
}

/// The cached token, else the token `read` returns. Only a success is cached. The lock
/// is held during `read` so concurrent first calls share one disk read.
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

/// Checks the token against GitHub and its scopes before replacing the saved session.
pub async fn login(token: &str) -> Result<Viewer> {
    let token = token.trim();

    if std::env::var("PLANCHE_TOKEN")
        .is_ok_and(|value| !value.trim().is_empty() && value.trim() != token)
    {
        return Err(Error::Credentials(
            "PLANCHE_TOKEN overrides sign-in; unset it and restart to change accounts".into(),
        ));
    }

    let client = GithubClient::new(token)?;
    let (viewer, scopes) = ops::viewer(&client).await?;

    if token.starts_with("github_pat_") {
        return Err(Error::ClassicTokenRequired);
    }

    let missing = missing_scopes(scopes.as_deref())?;

    if !missing.is_empty() {
        return Err(Error::MissingScopes(missing));
    }

    credentials::write(token)?;
    remember(Some(token.to_owned()));

    Ok(viewer)
}

/// Who the stored token signs in as. `login` is `None` without a token.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
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
    credentials::delete()?;
    remember(None);

    Ok(())
}

/// Required scopes absent from an `x-oauth-scopes` header. A missing header means a
/// fine-grained token, which Planche refuses. OAuth tokens use the same scopes as classic PATs.
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
