use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use specta::Type;
use tokio::sync::Mutex;
use tokio::time::Instant;

use super::{AuthStatus, OAUTH_SCOPES};
use crate::error::{Error, Result};

#[derive(Clone, Serialize, Type)]
pub struct DeviceCode {
    pub user_code: String,
    pub interval: u32,
}

#[derive(Default)]
pub struct DeviceFlow {
    session: Mutex<Option<Session>>,
}

struct Session {
    client_id: String,
    github_app: bool,
    attach_to: Option<String>,
    code: CodeReply,
    expires_at: Instant,
    next_poll: Instant,
}

#[derive(Deserialize)]
struct CodeReply {
    device_code: String,
    user_code: String,
    expires_in: u64,
    interval: u32,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum CodeResponse {
    Code(CodeReply),
    Error { error: String },
}

#[derive(Deserialize)]
struct TokenData {
    access_token: String,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    refresh_token_expires_in: Option<u64>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum TokenReply {
    Token(TokenData),
    Error {
        error: String,
        interval: Option<u32>,
    },
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Tokens {
    pub client_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub refresh_expires_at: u64,
}

impl Tokens {
    fn from_reply(client_id: &str, reply: TokenData, now: u64) -> Result<Self> {
        let expires_in = reply.expires_in.filter(|value| (1..=86400).contains(value));
        let refresh_expires_in = reply
            .refresh_token_expires_in
            .filter(|value| (1..=31_536_000).contains(value));
        let tokens = Self {
            client_id: client_id.to_owned(),
            access_token: reply.access_token,
            refresh_token: reply.refresh_token.unwrap_or_default(),
            expires_at: expires_in
                .and_then(|value| now.checked_add(value))
                .unwrap_or(0),
            refresh_expires_at: refresh_expires_in
                .and_then(|value| now.checked_add(value))
                .unwrap_or(0),
        };

        if !tokens.valid() {
            return Err(Error::OAuth(
                "GitHub returned an invalid expiring app session; sign in again".into(),
            ));
        }

        Ok(tokens)
    }

    pub fn valid(&self) -> bool {
        !self.client_id.trim().is_empty()
            && self.access_token.starts_with("ghu_")
            && self.access_token.len() > 4
            && self.refresh_token.starts_with("ghr_")
            && self.refresh_token.len() > 4
            && self.expires_at > 0
            && self.refresh_expires_at >= self.expires_at
    }

    pub fn needs_refresh(&self, now: u64) -> bool {
        now.saturating_add(60) >= self.expires_at
    }
}

pub(super) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub(super) async fn refresh(tokens: &Tokens) -> Result<Tokens> {
    if now() >= tokens.refresh_expires_at {
        return Err(Error::Unauthorized);
    }

    let reply = request(
        "https://github.com/login/oauth/access_token",
        &[
            ("client_id", tokens.client_id.clone()),
            ("grant_type", "refresh_token".into()),
            ("refresh_token", tokens.refresh_token.clone()),
        ],
    )
    .await?;

    match reply {
        TokenReply::Token(reply) => Tokens::from_reply(&tokens.client_id, reply, now()),
        TokenReply::Error { .. } => Err(Error::Unauthorized),
    }
}

fn configured(name: &str, embedded: Option<&str>) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            embedded
                .map(str::to_owned)
                .filter(|value| !value.trim().is_empty())
        })
}

pub(super) fn app_client_id() -> Option<String> {
    configured(
        "PLANCHE_GITHUB_APP_CLIENT_ID",
        option_env!("PLANCHE_GITHUB_APP_CLIENT_ID"),
    )
}

fn client_configuration(github_app: bool) -> Result<String> {
    if github_app {
        return app_client_id().ok_or_else(|| Error::OAuth("Configure PLANCHE_GITHUB_APP_CLIENT_ID and enable Device Flow to connect organizations".into()));
    }
    configured(
        "PLANCHE_GITHUB_CLIENT_ID",
        option_env!("PLANCHE_GITHUB_CLIENT_ID"),
    ).ok_or_else(|| Error::OAuth("Configure PLANCHE_GITHUB_CLIENT_ID with your OAuth App's public Client ID and enable Device Flow".into()))
}

fn device_parameters(client_id: &str, github_app: bool) -> [(&'static str, String); 2] {
    [
        ("client_id", client_id.to_owned()),
        (
            "scope",
            if github_app {
                "offline_access".into()
            } else {
                OAUTH_SCOPES.join(" ")
            },
        ),
    ]
}

impl DeviceFlow {
    pub async fn start(&self) -> Result<DeviceCode> {
        self.start_flow(false).await
    }

    pub async fn start_organizations(&self) -> Result<DeviceCode> {
        self.start_flow(true).await
    }

    async fn start_flow(&self, github_app: bool) -> Result<DeviceCode> {
        let client_id = client_configuration(github_app)?;
        let attach_to = if github_app {
            let anchor = tokio::task::spawn_blocking(super::load_token)
                .await
                .map_err(|_| Error::Unauthorized)??;
            if !super::session::connection(&anchor).is_some_and(|(restricted, _)| restricted) {
                return Err(Error::OAuth("Sign in with OAuth before connecting organizations. PAT mode is a separate connection.".into()));
            }
            Some(anchor)
        } else {
            None
        };
        let mut session = self.session.lock().await;

        *session = None;
        let reply: CodeResponse = request(
            "https://github.com/login/device/code",
            &device_parameters(&client_id, github_app),
        )
        .await?;
        let code = match reply {
            CodeResponse::Code(code) => code,
            CodeResponse::Error { error } => return Err(oauth_error(&error)),
        };
        let mut session_value = Session::new(client_id, github_app, code)?;
        session_value.attach_to = attach_to;
        let public = DeviceCode {
            user_code: session_value.code.user_code.clone(),
            interval: session_value.code.interval,
        };

        *session = Some(session_value);

        Ok(public)
    }

    pub async fn poll(&self, user_code: &str) -> Result<Option<AuthStatus>> {
        let mut slot = self.session.lock().await;
        let session = slot
            .as_mut()
            .filter(|session| session.code.user_code == user_code)
            .ok_or_else(|| Error::OAuth("sign-in cancelled; start again".into()))?;

        if Instant::now() >= session.expires_at {
            *slot = None;
            return Err(oauth_error("expired_token"));
        }

        if Instant::now() < session.next_poll {
            return Ok(None);
        }

        let device_code = session.code.device_code.clone();
        let client_id = session.client_id.clone();
        session.next_poll = Instant::now() + Duration::from_secs(session.code.interval.into());
        drop(slot);

        let reply = request(
            "https://github.com/login/oauth/access_token",
            &[
                ("client_id", client_id),
                ("device_code", device_code.clone()),
                (
                    "grant_type",
                    "urn:ietf:params:oauth:grant-type:device_code".into(),
                ),
            ],
        )
        .await?;
        let mut slot = self.session.lock().await;
        let session = current_session(&mut slot, user_code, &device_code)?;
        let attach_to = session.attach_to.clone();
        let token = session.accept(reply)?;

        let Some(session) = token else {
            return Ok(None);
        };
        drop(slot);
        let (session, viewer) = super::verify_session(session).await?;
        let mut slot = self.session.lock().await;
        current_session(&mut slot, user_code, &device_code)?;
        super::persist_session(session, attach_to).await?;
        let anchor = tokio::task::spawn_blocking(super::load_token)
            .await
            .map_err(|_| Error::Unauthorized)??;
        let status = super::connection_status(AuthStatus::signed_in(viewer, Vec::new()), &anchor);

        *slot = None;

        Ok(Some(status))
    }

    pub async fn cancel(&self, user_code: &str) {
        let mut session = self.session.lock().await;

        if session
            .as_ref()
            .is_some_and(|session| session.code.user_code == user_code)
        {
            *session = None;
        }
    }

    pub async fn cancel_all(&self) {
        *self.session.lock().await = None;
    }

    pub async fn copy_code(&self, user_code: &str) -> Result<()> {
        let session = self.session.lock().await;
        let code = session
            .as_ref()
            .filter(|session| {
                session.code.user_code == user_code && Instant::now() < session.expires_at
            })
            .ok_or_else(|| {
                Error::OAuth("the code expired or sign-in was cancelled; start again".into())
            })?
            .code
            .user_code
            .clone();

        tokio::task::spawn_blocking(move || {
            use std::io::Write;
            use std::process::{Command, Stdio};

            let mut child = Command::new("/usr/bin/pbcopy")
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;
            let written = child
                .stdin
                .take()
                .expect("piped stdin")
                .write_all(code.as_bytes());
            let status = child.wait()?;

            written?;

            if !status.success() {
                return Err(std::io::Error::other("clipboard is unavailable"));
            }

            Ok(())
        })
        .await
        .map_err(|_| Error::OAuth("could not copy the code; select and copy it manually".into()))?
        .map_err(|_| Error::OAuth("could not copy the code; select and copy it manually".into()))
    }
}

fn current_session<'a>(
    slot: &'a mut Option<Session>,
    user_code: &str,
    device_code: &str,
) -> Result<&'a mut Session> {
    slot.as_mut()
        .filter(|session| {
            session.code.user_code == user_code
                && session.code.device_code == device_code
                && Instant::now() < session.expires_at
        })
        .ok_or_else(|| Error::OAuth("sign-in cancelled or expired; start again".into()))
}

impl Session {
    fn new(client_id: String, github_app: bool, code: CodeReply) -> Result<Self> {
        if code.device_code.is_empty()
            || code.user_code.is_empty()
            || !(1..=3600).contains(&code.expires_in)
            || !(1..=3600).contains(&code.interval)
        {
            return Err(Error::OAuth("invalid device authorization response".into()));
        }

        let now = Instant::now();

        Ok(Self {
            client_id,
            github_app,
            attach_to: None,
            expires_at: now + Duration::from_secs(code.expires_in),
            next_poll: now + Duration::from_secs(code.interval.into()),
            code,
        })
    }

    fn accept(&mut self, reply: TokenReply) -> Result<Option<super::Session>> {
        let token = match reply {
            TokenReply::Token(reply) => {
                if self.github_app {
                    Some(super::Session::github_app(Tokens::from_reply(
                        &self.client_id,
                        reply,
                        now(),
                    )?))
                } else {
                    // shortcut: legacy OAuth uses long-lived tokens; use GitHub App sign-in for rotation.
                    if reply.expires_in.is_some() {
                        return Err(Error::OAuth("Use a GitHub App for expiring sessions; this legacy OAuth connection only supports long-lived tokens".into()));
                    }
                    if reply.access_token.trim().is_empty()
                        || reply.access_token.starts_with("ghu_")
                    {
                        return Err(Error::OAuth(
                            "GitHub returned an invalid legacy OAuth token".into(),
                        ));
                    }

                    let mut session = super::Session::plain(reply.access_token);
                    session.restricted_oauth = true;
                    Some(session)
                }
            }
            TokenReply::Error { error, interval } => match error.as_str() {
                "authorization_pending" => None,
                "slow_down" => {
                    self.code.interval = self
                        .code
                        .interval
                        .saturating_add(5)
                        .max(interval.unwrap_or(0))
                        .min(3600);
                    None
                }
                other => return Err(oauth_error(other)),
            },
        };

        self.next_poll = Instant::now() + Duration::from_secs(self.code.interval.into());

        Ok(token)
    }
}

fn oauth_error(code: &str) -> Error {
    let message = match code {
        "expired_token" => "the code expired; start sign-in again",
        "access_denied" => "authorization was declined; start sign-in again",
        "device_flow_disabled" => {
            "enable Device Flow in the GitHub App or legacy OAuth App settings"
        }
        "incorrect_client_credentials" => "the GitHub Client ID is invalid",
        _ => "authorization failed; start sign-in again",
    };

    Error::OAuth(message.into())
}

async fn request<T: DeserializeOwned>(url: &str, fields: &[(&str, String)]) -> Result<T> {
    let response = reqwest::Client::builder()
        .user_agent(concat!("planche/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| Error::Network(error.to_string()))?
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(fields)
        .send()
        .await
        .map_err(|error| Error::Network(error.to_string()))?;

    if !response.status().is_success() {
        return Err(Error::Http(response.status().as_u16()));
    }

    response
        .json()
        .await
        .map_err(|_| Error::OAuth("invalid response from GitHub".into()))
}

#[cfg(test)]
#[path = "oauth.test.rs"]
mod tests;
