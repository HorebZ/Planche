use std::time::Duration;

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use specta::Type;
use tokio::sync::Mutex;
use tokio::time::Instant;

use super::{AuthStatus, REQUIRED_SCOPES};
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
#[serde(untagged)]
enum TokenReply {
    Token {
        access_token: String,
        expires_in: Option<u64>,
    },
    Error {
        error: String,
        interval: Option<u32>,
    },
}

impl DeviceFlow {
    pub async fn start(&self) -> Result<DeviceCode> {
        let client_id = std::env::var("PLANCHE_GITHUB_CLIENT_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| option_env!("PLANCHE_GITHUB_CLIENT_ID").map(str::to_owned))
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| Error::OAuth(
                "configure PLANCHE_GITHUB_CLIENT_ID with your OAuth App's public Client ID and enable Device Flow".into(),
            ))?;
        let mut session = self.session.lock().await;

        *session = None;
        let reply: CodeResponse = request(
            "https://github.com/login/device/code",
            &[
                ("client_id", client_id.clone()),
                ("scope", REQUIRED_SCOPES.join(" ")),
            ],
        )
        .await?;
        let code = match reply {
            CodeResponse::Code(code) => code,
            CodeResponse::Error { error } => return Err(oauth_error(&error)),
        };
        let session_value = Session::new(client_id, code)?;
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

        let reply = request(
            "https://github.com/login/oauth/access_token",
            &[
                ("client_id", session.client_id.clone()),
                ("device_code", session.code.device_code.clone()),
                (
                    "grant_type",
                    "urn:ietf:params:oauth:grant-type:device_code".into(),
                ),
            ],
        )
        .await?;
        let token = session.accept(reply)?;

        let Some(token) = token else { return Ok(None) };
        let status = super::set_token(&token).await?;

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

impl Session {
    fn new(client_id: String, code: CodeReply) -> Result<Self> {
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
            expires_at: now + Duration::from_secs(code.expires_in),
            next_poll: now + Duration::from_secs(code.interval.into()),
            code,
        })
    }

    fn accept(&mut self, reply: TokenReply) -> Result<Option<String>> {
        let token = match reply {
            TokenReply::Token {
                access_token,
                expires_in,
            } => {
                // shortcut: long-lived OAuth tokens only; add refresh rotation before enabling expiring tokens.
                if expires_in.is_some() {
                    return Err(Error::OAuth(
                        "disable token expiration in the OAuth App settings, then sign in again"
                            .into(),
                    ));
                }

                if access_token.trim().is_empty() {
                    return Err(Error::OAuth("GitHub returned an empty access token".into()));
                }

                Some(access_token)
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
        "device_flow_disabled" => "enable Device Flow in the GitHub OAuth App settings",
        "incorrect_client_credentials" => "the OAuth App Client ID is invalid",
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
