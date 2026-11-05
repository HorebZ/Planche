use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};

use super::{AuthMode, AuthStatus, SavedAccount, credentials, oauth};
use crate::domain::UserId;
use crate::error::{Error, Result};

static SESSION: Mutex<Option<Session>> = Mutex::new(None);
static REFRESH: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Session {
    // Keep the verified identity key stable when GitHub rotates the bearer token.
    pub token: String,
    pub oauth: Option<oauth::Tokens>,
    #[serde(default)]
    pub restricted_oauth: bool,
    #[serde(default)]
    pub user_id: Option<UserId>,
    #[serde(default)]
    pub app: Option<Box<Session>>,
    #[serde(default)]
    login: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    saved_accounts: Vec<Session>,
    #[serde(skip)]
    dirty: bool,
}

impl Session {
    pub fn plain(token: String) -> Self {
        Self {
            token,
            oauth: None,
            restricted_oauth: false,
            user_id: None,
            app: None,
            login: None,
            avatar_url: None,
            saved_accounts: Vec::new(),
            dirty: false,
        }
    }

    pub fn github_app(tokens: oauth::Tokens) -> Self {
        Self {
            token: tokens.access_token.clone(),
            oauth: Some(tokens),
            restricted_oauth: false,
            user_id: None,
            app: None,
            login: None,
            avatar_url: None,
            saved_accounts: Vec::new(),
            dirty: false,
        }
    }

    pub fn identity(&mut self, viewer: &crate::domain::Viewer) {
        self.user_id = Some(viewer.id.clone());
        self.login = Some(viewer.login.clone());
        self.avatar_url = Some(viewer.avatar_url.clone());
    }

    fn decode(value: &str) -> Result<Self> {
        if !value.starts_with('{') {
            return Ok(Self::plain(value.to_owned()));
        }

        let session: Self = serde_json::from_str(value).map_err(|_| {
            Error::Credentials("saved GitHub session is invalid; reconnect GitHub".into())
        })?;
        if !session.valid() {
            return Err(Error::Credentials(
                "saved GitHub session is invalid; reconnect GitHub".into(),
            ));
        }

        Ok(session)
    }

    fn encode(&self) -> Result<String> {
        if self.user_id.is_none()
            && self.oauth.is_none()
            && !self.restricted_oauth
            && self.app.is_none()
            && self.saved_accounts.is_empty()
        {
            return Ok(self.token.clone());
        }

        serde_json::to_string(self)
            .map_err(|_| Error::Credentials("could not encode the GitHub session".into()))
    }

    fn valid(&self) -> bool {
        let primary = if self.restricted_oauth {
            !self.token.trim().is_empty() && self.oauth.is_none() && self.user_id.is_some()
        } else if self.token.starts_with("ghu_") {
            self.oauth.as_ref().is_some_and(oauth::Tokens::valid)
        } else {
            !self.token.trim().is_empty() && self.oauth.is_none() && self.user_id.is_some()
        };
        primary
            && self
                .saved_accounts
                .iter()
                .all(|account| account.saved_accounts.is_empty() && account.valid())
            && self.app.as_ref().is_none_or(|app| {
                self.restricted_oauth
                    && !app.restricted_oauth
                    && app.app.is_none()
                    && app.saved_accounts.is_empty()
                    && app.valid()
                    && app.user_id == self.user_id
            })
    }

    fn target(&self, token: &str) -> Option<&Session> {
        if self.token == token {
            Some(self)
        } else {
            self.app.as_deref().filter(|app| app.token == token)
        }
    }

    fn target_mut(&mut self, token: &str) -> Option<&mut Session> {
        if self.token == token {
            Some(self)
        } else {
            self.app.as_deref_mut().filter(|app| app.token == token)
        }
    }

    fn dirty(&self) -> bool {
        self.dirty || self.app.as_ref().is_some_and(|app| app.dirty)
    }
}

pub(crate) fn connection(token: &str) -> Option<(bool, Option<String>)> {
    SESSION
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        .and_then(|root| root.target(token))
        .map(|session| {
            (
                session.restricted_oauth,
                session.app.as_ref().map(|app| app.token.clone()),
            )
        })
}

pub(super) fn attach(anchor: &str, app: Session) -> Result<()> {
    let _lock = credentials::lock()?;
    let mut root = read_saved()?;
    let mut cache = SESSION.lock().unwrap_or_else(PoisonError::into_inner);

    attach_to(&mut root, anchor, app)?;
    credentials::write(&root.encode()?)?;
    *cache = Some(root);

    Ok(())
}

fn attach_to(root: &mut Session, anchor: &str, app: Session) -> Result<()> {
    if root.token != anchor
        || !root.restricted_oauth
        || root.user_id != app.user_id
        || app.user_id.is_none()
    {
        return Err(Error::OAuth(
            "Connect organizations with the same GitHub account as your personal connection".into(),
        ));
    }
    root.app = Some(Box::new(app));

    Ok(())
}

pub(super) fn load(read: impl FnOnce() -> Result<String>) -> Result<String> {
    let _lock = credentials::lock()?;

    cached(&SESSION, read)
}

fn cached(cache: &Mutex<Option<Session>>, read: impl FnOnce() -> Result<String>) -> Result<String> {
    let mut cache = cache.lock().unwrap_or_else(PoisonError::into_inner);

    if let Some(session) = cache.as_ref() {
        return Ok(session.token.clone());
    }

    let session = Session::decode(&read()?)?;
    let token = session.token.clone();

    *cache = Some(session);

    Ok(token)
}

fn read_saved() -> Result<Session> {
    let saved = Session::decode(&credentials::read()?)?;
    let cache = SESSION.lock().unwrap_or_else(PoisonError::into_inner);

    // A failed Keychain write after rotation leaves the only valid refresh token in memory.
    Ok(cache
        .as_ref()
        .filter(|current| current.token == saved.token && current.dirty())
        .cloned()
        .unwrap_or(saved))
}

pub(super) fn save(mut session: Session) -> Result<()> {
    let _lock = credentials::lock()?;
    let previous = match read_saved() {
        Ok(previous) => Some(previous),
        Err(Error::NotSignedIn) => None,
        Err(error) => return Err(error),
    };

    if let Some(previous) = previous {
        retain_accounts(&mut session, previous);
    }
    if !session.valid() {
        return Err(Error::Credentials(
            "Reconnect the saved GitHub account before adding another account".into(),
        ));
    }
    credentials::write(&session.encode()?)?;
    *SESSION.lock().unwrap_or_else(PoisonError::into_inner) = Some(session);

    Ok(())
}

fn retain_accounts(session: &mut Session, mut previous: Session) {
    session.saved_accounts = std::mem::take(&mut previous.saved_accounts);
    session.saved_accounts.push(previous);
    if session.restricted_oauth && session.app.is_none() {
        session.app = session
            .saved_accounts
            .iter()
            .find(|saved| saved.user_id == session.user_id && saved.restricted_oauth)
            .and_then(|saved| saved.app.clone());
    }
    session
        .saved_accounts
        .retain(|saved| saved.user_id != session.user_id && saved.token != session.token);
}

pub(super) fn remember(token: &str, status: &AuthStatus) -> Result<()> {
    let _lock = credentials::lock()?;
    let mut root = read_saved()?;
    if root.token != token {
        return Err(Error::Unauthorized);
    }
    if root.user_id == status.id
        && root.login == status.login
        && root.avatar_url == status.avatar_url
    {
        return Ok(());
    }
    root.user_id = status.id.clone();
    root.login = status.login.clone();
    root.avatar_url = status.avatar_url.clone();
    credentials::write(&root.encode()?)?;
    *SESSION.lock().unwrap_or_else(PoisonError::into_inner) = Some(root);

    Ok(())
}

pub(super) fn accounts() -> Vec<SavedAccount> {
    let cache = SESSION.lock().unwrap_or_else(PoisonError::into_inner);
    let Some(root) = cache.as_ref() else {
        return Vec::new();
    };

    std::iter::once(root)
        .chain(&root.saved_accounts)
        .filter_map(|session| {
            Some(SavedAccount {
                id: session.user_id.clone()?,
                login: session.login.clone()?,
                avatar_url: session.avatar_url.clone(),
                mode: if session.restricted_oauth {
                    AuthMode::Oauth
                } else if session.oauth.is_some() {
                    AuthMode::GithubApp
                } else {
                    AuthMode::Pat
                },
                active: session.token == root.token,
            })
        })
        .collect()
}

fn select(root: &mut Session, id: &UserId) -> Result<()> {
    if root.user_id.as_ref() == Some(id) {
        return Ok(());
    }
    let index = root
        .saved_accounts
        .iter()
        .position(|account| account.user_id.as_ref() == Some(id))
        .ok_or(Error::NotSignedIn)?;
    let mut next = root.saved_accounts.remove(index);
    next.saved_accounts = std::mem::take(&mut root.saved_accounts);
    std::mem::swap(root, &mut next);
    root.saved_accounts.push(next);

    Ok(())
}

pub(super) fn switch(id: &UserId) -> Result<AuthStatus> {
    let _lock = credentials::lock()?;
    let mut root = read_saved()?;
    select(&mut root, id)?;
    let status = AuthStatus {
        id: root.user_id.clone(),
        login: root.login.clone(),
        avatar_url: root.avatar_url.clone(),
        ..Default::default()
    };

    credentials::write(&root.encode()?)?;
    *SESSION.lock().unwrap_or_else(PoisonError::into_inner) = Some(root);

    Ok(status)
}

fn remove_active(mut root: Session) -> Option<Session> {
    if root.saved_accounts.is_empty() {
        return None;
    }
    let mut next = root.saved_accounts.remove(0);
    next.saved_accounts = root.saved_accounts;

    Some(next)
}

pub(super) fn clear() -> Result<()> {
    let _lock = credentials::lock()?;
    let next = match read_saved() {
        Ok(root) => remove_active(root),
        Err(Error::NotSignedIn) => None,
        Err(error) => return Err(error),
    };
    match &next {
        Some(session) => credentials::write(&session.encode()?)?,
        None => credentials::delete()?,
    }
    *SESSION.lock().unwrap_or_else(PoisonError::into_inner) = next;

    Ok(())
}

fn snapshot(token: &str) -> Option<Session> {
    SESSION
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        .and_then(|session| session.target(token))
        .cloned()
}

pub(crate) async fn request_token(token: &str, managed: bool) -> Result<String> {
    let Some(session) = snapshot(token) else {
        return if managed {
            Err(Error::Unauthorized)
        } else {
            Ok(token.to_owned())
        };
    };
    let Some(tokens) = &session.oauth else {
        return Ok(token.to_owned());
    };

    if !session.dirty && !tokens.needs_refresh(oauth::now()) {
        return Ok(tokens.access_token.clone());
    }

    let token = token.to_owned();

    // Finish rotation even if the requesting command is cancelled.
    tokio::spawn(async move {
        let _refresh = REFRESH.lock().await;
        let anchor = token.clone();
        let (lock, session) = tokio::task::spawn_blocking(move || {
            let lock = credentials::lock()?;
            let saved = Session::decode(&credentials::read()?)?;
            let mut cache = SESSION.lock().unwrap_or_else(PoisonError::into_inner);
            let current = cache.as_mut().ok_or(Error::Unauthorized)?;

            if saved.token != current.token
                || saved.target(&anchor).is_none()
                || current.target(&anchor).is_none()
            {
                return Err(Error::Unauthorized);
            }
            if !current.dirty() {
                *current = saved;
            }

            Ok::<_, Error>((
                lock,
                current.target(&anchor).ok_or(Error::Unauthorized)?.clone(),
            ))
        })
        .await
        .map_err(|_| Error::Unauthorized)??;
        let tokens = session.oauth.as_ref().ok_or(Error::Unauthorized)?;
        let rotated = if tokens.needs_refresh(oauth::now()) {
            Some(oauth::refresh(tokens).await?)
        } else {
            None
        };

        tokio::task::spawn_blocking(move || {
            let result = persist_rotation(&SESSION, &token, rotated, credentials::write);
            drop(lock);

            result
        })
        .await
        .map_err(|_| Error::Unauthorized)?
    })
    .await
    .map_err(|_| Error::Unauthorized)?
    .map_err(refresh_error)
}

fn persist_rotation(
    cache: &Mutex<Option<Session>>,
    token: &str,
    rotated: Option<oauth::Tokens>,
    write: impl FnOnce(&str) -> Result<()>,
) -> Result<String> {
    let mut cache = cache.lock().unwrap_or_else(PoisonError::into_inner);
    let root = cache.as_mut().ok_or(Error::Unauthorized)?;
    let session = root.target_mut(token).ok_or(Error::Unauthorized)?;

    if let Some(tokens) = rotated {
        // GitHub invalidates the old pair; retain the new pair in memory if Keychain saving fails.
        session.oauth = Some(tokens);
        session.dirty = true;
    }

    let access_token = session
        .oauth
        .as_ref()
        .ok_or(Error::Unauthorized)?
        .access_token
        .clone();
    if session.dirty {
        write(&root.encode()?)?;
        root.target_mut(token).ok_or(Error::Unauthorized)?.dirty = false;
    }

    Ok(access_token)
}

fn refresh_error(error: Error) -> Error {
    // Authentication or Keychain failures must leave queued mutations pending.
    if error.is_transient() {
        error
    } else {
        Error::Unauthorized
    }
}

#[cfg(test)]
#[path = "session.test.rs"]
mod tests;
