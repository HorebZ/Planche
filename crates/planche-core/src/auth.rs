use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::cache::Cache;
use crate::domain::{UserId, Viewer};
use crate::error::{Error, Result};
use crate::github::{GithubClient, ops};

mod credentials;
pub mod oauth;
pub(crate) mod session;

use session::Session;

pub const REQUIRED_SCOPES: [&str; 3] = ["repo", "read:org", "project"];
pub const OAUTH_SCOPES: [&str; 1] = ["project"];

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    #[default]
    Pat,
    Oauth,
    GithubApp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SavedAccount {
    pub id: UserId,
    pub login: String,
    pub avatar_url: Option<String>,
    pub mode: AuthMode,
    pub active: bool,
}

pub fn accounts() -> Vec<SavedAccount> {
    if environment_token() {
        return Vec::new();
    }

    session::accounts()
}

fn environment_token() -> bool {
    std::env::var("PLANCHE_TOKEN").is_ok_and(|value| !value.trim().is_empty())
}

pub fn remember_session(token: &str, status: &AuthStatus) -> Result<()> {
    if environment_token() {
        return Ok(());
    }

    session::remember(token, status)
}

pub fn switch_account(id: &UserId) -> Result<AuthStatus> {
    if environment_token() {
        return Err(Error::Credentials(
            "PLANCHE_TOKEN overrides sign-in; unset it and restart to change accounts".into(),
        ));
    }
    let status = session::switch(id)?;

    Ok(connection_status(status, &load_token()?))
}

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
        .map(|json| {
            serde_json::from_str(&json)
                .map(|status| connection_status(status, token))
                .map_err(|error| Error::Cache(error.to_string()))
        })
        .transpose()
}

pub fn remember_status(cache: &Cache, token: &str, status: &AuthStatus) -> Result<()> {
    let json = serde_json::to_string(status).map_err(|error| Error::Cache(error.to_string()))?;

    cache.set(&identity_key(token), &json)
}

/// The token from `PLANCHE_TOKEN`, else from macOS Keychain, read once per process.
pub fn load_token() -> Result<String> {
    if let Some(token) = std::env::var("PLANCHE_TOKEN")
        .ok()
        .filter(|t| !t.trim().is_empty())
    {
        return Ok(token.trim().to_owned());
    }

    session::load(credentials::read)
}

/// Checks GitHub identity and scopes before saving and activating this account.
pub async fn login(token: &str) -> Result<Viewer> {
    if token.trim().starts_with("ghu_") {
        return Err(Error::ClassicTokenRequired);
    }
    login_session(Session::plain(token.trim().to_owned()), None).await
}

async fn login_session(session: Session, attach_to: Option<String>) -> Result<Viewer> {
    let (session, viewer) = verify_session(session).await?;
    persist_session(session, attach_to).await?;

    Ok(viewer)
}

async fn verify_session(mut session: Session) -> Result<(Session, Viewer)> {
    let token = session.token.as_str();

    if std::env::var("PLANCHE_TOKEN").is_ok_and(|value| !value.trim().is_empty()) {
        return Err(Error::Credentials(
            "PLANCHE_TOKEN overrides sign-in; unset it and restart to change accounts".into(),
        ));
    }

    let client = GithubClient::new(token)?;
    let (viewer, scopes) = ops::viewer(&client).await?;

    if token.starts_with("github_pat_") {
        return Err(Error::ClassicTokenRequired);
    }

    let missing = if session.restricted_oauth {
        restricted_scopes(scopes.as_deref())?
    } else {
        token_scopes(token, scopes.as_deref())?
    };

    if !missing.is_empty() {
        return Err(Error::MissingScopes(missing));
    }

    session.identity(&viewer);

    Ok((session, viewer))
}

async fn persist_session(session: Session, attach_to: Option<String>) -> Result<()> {
    tokio::task::spawn_blocking(move || match attach_to {
        Some(anchor) => session::attach(&anchor, session),
        None => session::save(session),
    })
    .await
    .map_err(|_| Error::Credentials("could not save the GitHub session; try again".into()))??;

    Ok(())
}

/// Who the stored token signs in as. `login` is `None` without a token.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AuthStatus {
    /// The viewer's node ID, for "assign me".
    pub id: Option<UserId>,
    pub login: Option<String>,
    pub avatar_url: Option<String>,
    pub missing_scopes: Vec<String>,
    #[serde(default)]
    pub mode: AuthMode,
    #[serde(default)]
    pub organizations_connected: bool,
    #[serde(default)]
    pub organizations_available: bool,
}

impl AuthStatus {
    fn signed_in(viewer: Viewer, missing_scopes: Vec<String>) -> Self {
        Self {
            id: Some(viewer.id),
            login: Some(viewer.login),
            avatar_url: Some(viewer.avatar_url),
            missing_scopes,
            ..Default::default()
        }
    }
}

/// Checks the stored token against GitHub. No token is not an error.
pub async fn status() -> Result<AuthStatus> {
    let token = tokio::task::spawn_blocking(load_token)
        .await
        .map_err(|_| Error::Credentials("could not unlock the GitHub session; try again".into()))?;
    let token = match token {
        Ok(token) => token,
        Err(Error::NotSignedIn) => return Ok(AuthStatus::default()),
        Err(e) => return Err(e),
    };
    let (viewer, scopes) = ops::viewer(&GithubClient::new(&token)?).await?;

    let missing = if session::connection(&token).is_some_and(|(restricted, _)| restricted) {
        restricted_scopes(scopes.as_deref())?
    } else {
        token_scopes(&token, scopes.as_deref())?
    };
    Ok(connection_status(
        AuthStatus::signed_in(viewer, missing),
        &token,
    ))
}

/// Like `login`, for the onboarding: the status of the token it just stored.
pub async fn set_token(token: &str) -> Result<AuthStatus> {
    Ok(connection_status(
        AuthStatus::signed_in(login(token).await?, Vec::new()),
        token.trim(),
    ))
}

fn connection_status(mut status: AuthStatus, token: &str) -> AuthStatus {
    let (restricted, app) = session::connection(token).unwrap_or_default();
    status.mode = if restricted {
        AuthMode::Oauth
    } else if token.starts_with("ghu_") {
        AuthMode::GithubApp
    } else {
        AuthMode::Pat
    };
    status.organizations_connected = app.is_some() || status.mode == AuthMode::GithubApp;
    status.organizations_available = oauth::app_client_id().is_some();

    status
}

fn restricted_scopes(header: Option<&str>) -> Result<Vec<String>> {
    let scopes = header.ok_or(Error::ClassicTokenRequired)?;
    if scopes
        .split(',')
        .map(str::trim)
        .any(|scope| !scope.is_empty() && !OAUTH_SCOPES.contains(&scope))
    {
        return Err(Error::OAuth("Your existing OAuth authorization has broader permissions. Revoke Planche under GitHub Settings → Applications → Authorized OAuth Apps, then reconnect with project access only. Existing tokens are not narrowed automatically.".into()));
    }

    Ok(OAUTH_SCOPES
        .iter()
        .filter(|required| !scopes.split(',').any(|scope| scope.trim() == **required))
        .map(|scope| (*scope).into())
        .collect())
}

/// Deletes the stored token. Deleting a missing token succeeds.
pub fn sign_out() -> Result<()> {
    session::clear()
}

fn token_scopes(token: &str, header: Option<&str>) -> Result<Vec<String>> {
    if token.starts_with("ghu_") {
        return Ok(Vec::new());
    }

    missing_scopes(header)
}

/// Missing legacy OAuth/classic PAT scopes. GitHub App user tokens are checked separately.
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
