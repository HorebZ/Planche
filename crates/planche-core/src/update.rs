//! Public alpha releases never use the user's GitHub credentials.

mod install;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
use reqwest::{Client, Response};
use semver::Version;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{Error, Result};

const ENDPOINT: &str = "https://github.com/HorebZ/Planche/releases/download/alpha/latest.json";
const PUBLIC_KEY: &str = include_str!("../alpha-updater.pub");
const MAX_DOWNLOAD: usize = 128 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum UpdatePhase {
    Idle,
    Checking,
    Current,
    Available,
    Downloading,
    Ready,
    Installing,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UpdateRelease {
    pub version: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UpdateStatus {
    pub current_version: String,
    pub phase: UpdatePhase,
    pub release: Option<UpdateRelease>,
    pub received: u32,
    pub total: Option<u32>,
    pub error: Option<String>,
}

#[derive(Clone, Deserialize)]
struct Asset {
    url: String,
    signature: String,
}

#[derive(Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    notes: String,
    platforms: HashMap<String, Asset>,
}

struct Pending {
    release: UpdateRelease,
    asset: Asset,
    bytes: Option<Vec<u8>>,
}

pub struct Updater {
    status: Mutex<UpdateStatus>,
    pending: Mutex<Option<Pending>>,
    operation: tokio::sync::Mutex<()>,
}

impl Updater {
    pub fn new(version: &str) -> Self {
        Self {
            status: Mutex::new(UpdateStatus {
                current_version: version.into(),
                phase: UpdatePhase::Idle,
                release: None,
                received: 0,
                total: None,
                error: None,
            }),
            pending: Mutex::new(None),
            operation: tokio::sync::Mutex::new(()),
        }
    }

    pub fn status(&self) -> UpdateStatus {
        self.status.lock().expect("update status").clone()
    }

    fn publish(&self, phase: UpdatePhase, emit: &impl Fn(UpdateStatus)) {
        let status = {
            let mut status = self.status.lock().expect("update status");
            status.phase = phase;
            status.error = None;

            status.clone()
        };

        emit(status);
    }

    fn failed(&self, error: Error, emit: &impl Fn(UpdateStatus)) -> Error {
        let status = {
            let mut status = self.status.lock().expect("update status");
            status.phase = UpdatePhase::Error;
            status.error = Some(error.to_string());

            status.clone()
        };

        emit(status);

        error
    }

    pub async fn check(&self, emit: impl Fn(UpdateStatus)) -> Result<UpdateStatus> {
        let Ok(_operation) = self.operation.try_lock() else {
            return Ok(self.status());
        };

        if self.status().phase == UpdatePhase::Ready {
            return Ok(self.status());
        }

        self.publish(UpdatePhase::Checking, &emit);
        let result = async {
            let response = client()?
                .get(ENDPOINT)
                .timeout(Duration::from_secs(15))
                .send()
                .await
                .map_err(network)?;

            if response.status() == reqwest::StatusCode::NOT_FOUND {
                return Ok(None);
            }

            let bytes = read_body(response, 1024 * 1024, |_, _| {}).await?;
            let manifest: Manifest =
                serde_json::from_slice(&bytes).map_err(|error| Error::Update(error.to_string()))?;

            select_release(manifest, &self.status().current_version, target())
        }
        .await;
        let pending = result.map_err(|error| self.failed(error, &emit))?;
        let phase = if pending.is_some() {
            UpdatePhase::Available
        } else {
            UpdatePhase::Current
        };
        self.status.lock().expect("update status").release =
            pending.as_ref().map(|pending| pending.release.clone());
        *self.pending.lock().expect("pending update") = pending;
        self.publish(phase, &emit);

        Ok(self.status())
    }

    pub async fn download(&self, emit: impl Fn(UpdateStatus)) -> Result<UpdateStatus> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| Error::Update("another update operation is running".into()))?;
        let (release, asset) = self
            .pending
            .lock()
            .expect("pending update")
            .as_ref()
            .map(|pending| (pending.release.clone(), pending.asset.clone()))
            .ok_or_else(|| Error::Update("check for an update first".into()))?;
        {
            let mut status = self.status.lock().expect("update status");
            status.received = 0;
            status.total = None;
        }

        self.publish(UpdatePhase::Downloading, &emit);
        let result = async {
            let response = client()?.get(&asset.url).send().await.map_err(network)?;
            let bytes = read_body(response, MAX_DOWNLOAD, |received, total| {
                let snapshot = {
                    let mut status = self.status.lock().expect("update status");
                    status.received = received as u32;
                    status.total = total.map(|total| total as u32);

                    status.clone()
                };

                emit(snapshot);
            })
            .await?;
            verify(&bytes, &asset.signature, PUBLIC_KEY, &release.version)?;

            Ok(bytes)
        }
        .await;
        let bytes = result.map_err(|error| self.failed(error, &emit))?;
        self.pending
            .lock()
            .expect("pending update")
            .as_mut()
            .expect("operation holds pending update")
            .bytes = Some(bytes);
        self.publish(UpdatePhase::Ready, &emit);

        Ok(self.status())
    }

    /// The shell drains writers before entering this synchronous installation step.
    pub fn install(&self, emit: impl Fn(UpdateStatus)) -> Result<()> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| Error::Update("another update operation is running".into()))?;
        let pending = self.pending.lock().expect("pending update");
        let pending = pending
            .as_ref()
            .ok_or_else(|| Error::Update("download an update first".into()))?;
        let bytes = pending
            .bytes
            .as_ref()
            .ok_or_else(|| Error::Update("download an update first".into()))?;

        self.publish(UpdatePhase::Installing, &emit);
        let result = verify(
            bytes,
            &pending.asset.signature,
            PUBLIC_KEY,
            &pending.release.version,
        )
        .and_then(|()| install::install(bytes, &pending.release.version));

        result.map_err(|error| self.failed(error, &emit))
    }
}

fn client() -> Result<Client> {
    Client::builder()
        .https_only(true)
        .user_agent(concat!("Planche/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(network)
}

fn network(error: reqwest::Error) -> Error {
    Error::Network(error.without_url().to_string())
}

async fn read_body(
    mut response: Response,
    limit: usize,
    mut progress: impl FnMut(usize, Option<usize>),
) -> Result<Vec<u8>> {
    if !response.status().is_success() {
        return Err(Error::Http(response.status().as_u16()));
    }

    let total = response.content_length();

    if total.is_some_and(|total| total > limit as u64) {
        return Err(Error::Update("release file exceeds the size limit".into()));
    }

    let mut bytes = Vec::new();

    while let Some(chunk) = response.chunk().await.map_err(network)? {
        if chunk.len() > limit - bytes.len() {
            return Err(Error::Update("release file exceeds the size limit".into()));
        }

        bytes.extend_from_slice(&chunk);
        progress(bytes.len(), total.map(|total| total as usize));
    }

    if total.is_some_and(|total| total != bytes.len() as u64) {
        return Err(Error::Update("release download was interrupted".into()));
    }

    Ok(bytes)
}

fn target() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "darwin-aarch64"
    } else {
        "darwin-x86_64"
    }
}

fn select_release(manifest: Manifest, current: &str, target: &str) -> Result<Option<Pending>> {
    let parse =
        |version: &str| Version::parse(version).map_err(|error| Error::Update(error.to_string()));

    if parse(&manifest.version)? <= parse(current)? {
        return Ok(None);
    }

    let asset = manifest
        .platforms
        .get(target)
        .ok_or_else(|| Error::Update("this release has no update for this Mac".into()))?
        .clone();
    let url = reqwest::Url::parse(&asset.url).map_err(|error| Error::Update(error.to_string()))?;

    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || asset.signature.is_empty()
    {
        return Err(Error::Update(
            "release requires HTTPS and an update signature".into(),
        ));
    }

    Ok(Some(Pending {
        release: UpdateRelease {
            version: manifest.version,
            notes: manifest.notes,
        },
        asset,
        bytes: None,
    }))
}

fn verify(bytes: &[u8], signature: &str, public_key: &str, version: &str) -> Result<()> {
    let decode = |value: &str| -> Result<String> {
        String::from_utf8(
            STANDARD
                .decode(value.trim())
                .map_err(|_| Error::Update("invalid update signature encoding".into()))?,
        )
        .map_err(|_| Error::Update("invalid update signature encoding".into()))
    };
    let key = PublicKey::decode(&decode(public_key)?)
        .map_err(|_| Error::Update("invalid update public key".into()))?;
    let signature = Signature::decode(&decode(signature)?)
        .map_err(|_| Error::Update("invalid update signature".into()))?;

    key.verify(bytes, &signature, false).map_err(|_| {
        Error::Update(
            "update signature verification failed; the installed app was not changed".into(),
        )
    })?;

    if !signature
        .trusted_comment()
        .split('\t')
        .any(|part| part.strip_prefix("version:") == Some(version))
    {
        return Err(Error::Update(
            "signed update version does not match the release".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
#[path = "update.test.rs"]
mod tests;
