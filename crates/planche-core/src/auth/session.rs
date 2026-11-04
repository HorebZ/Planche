use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};

use super::{credentials, oauth};
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
            dirty: false,
        }
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
        if self.oauth.is_none() && !self.restricted_oauth && self.app.is_none() {
            return Ok(self.token.clone());
        }

        serde_json::to_string(self)
            .map_err(|_| Error::Credentials("could not encode the GitHub session".into()))
    }

    fn valid(&self) -> bool {
        let primary = if self.restricted_oauth {
            !self.token.trim().is_empty() && self.oauth.is_none() && self.user_id.is_some()
        } else {
            self.token.starts_with("ghu_") && self.oauth.as_ref().is_some_and(oauth::Tokens::valid)
        };
        primary
            && self.app.as_ref().is_none_or(|app| {
                self.restricted_oauth
                    && !app.restricted_oauth
                    && app.app.is_none()
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
    let mut root = Session::decode(&credentials::read()?)?;
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

pub(super) fn save(session: Session) -> Result<()> {
    let _lock = credentials::lock()?;
    let mut cache = SESSION.lock().unwrap_or_else(PoisonError::into_inner);

    credentials::write(&session.encode()?)?;
    *cache = Some(session);

    Ok(())
}

pub(super) fn clear() -> Result<()> {
    let _lock = credentials::lock()?;
    let mut cache = SESSION.lock().unwrap_or_else(PoisonError::into_inner);

    credentials::delete()?;
    *cache = None;

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
