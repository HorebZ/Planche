pub mod ops;
mod wire;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::StatusCode;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::domain::RateUsage;
use crate::error::{Error, GraphqlError, Result};

const GRAPHQL_ENDPOINT: &str = "https://api.github.com/graphql";
const REST_ENDPOINT: &str = "https://api.github.com";

pub struct GithubClient {
    http: reqwest::Client,
    token: String,
    usage: Mutex<RateUsage>,
}

pub(crate) struct Reply<T> {
    pub data: T,
    /// The `x-oauth-scopes` header. Fine-grained tokens do not send it.
    pub scopes: Option<String>,
}

impl GithubClient {
    pub fn new(token: impl Into<String>) -> Result<Self> {
        let http = reqwest::Client::builder()
            .user_agent(concat!("planche/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(5))
            // GitHub cancels queries after 10 s on its side.
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| Error::Network(e.to_string()))?;
        Ok(Self {
            http,
            token: token.into(),
            usage: Mutex::default(),
        })
    }

    pub fn usage(&self) -> RateUsage {
        *self.usage.lock().unwrap()
    }

    pub(crate) async fn query<T: DeserializeOwned>(
        &self,
        document: &str,
        operation: &str,
        variables: Value,
    ) -> Result<Reply<T>> {
        let request = self.http.post(GRAPHQL_ENDPOINT).json(
            &json!({ "query": document, "operationName": operation, "variables": variables }),
        );
        let (headers, body) = self.send(request).await?;
        let (data, rate_limit) = decode::<T>(&body)?;
        self.record(
            rate_limit,
            header_u32(&headers, "x-ratelimit-limit"),
            header_u32(&headers, "x-ratelimit-reset"),
        );
        Ok(Reply {
            data,
            scopes: header_str(&headers, "x-oauth-scopes").map(str::to_owned),
        })
    }

    /// A REST `GET` on `https://api.github.com{path}`, for data GraphQL does not expose.
    pub(crate) async fn rest_get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let request = self.http.get(format!("{REST_ENDPOINT}{path}"));
        let (_, body) = self.send(request).await?;
        serde_json::from_str(&body).map_err(|e| Error::Decode(e.to_string()))
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<(HeaderMap, String)> {
        let response = request
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(network_error)?;
        let status = response.status();
        let headers = response.headers().clone();
        if status == StatusCode::UNAUTHORIZED {
            return Err(Error::Unauthorized);
        }
        if let Some(retry_after_secs) = rate_limited(status, &headers) {
            return Err(Error::RateLimited { retry_after_secs });
        }
        if !status.is_success() {
            return Err(Error::Http(status.as_u16()));
        }
        let body = response.text().await.map_err(network_error)?;
        Ok((headers, body))
    }

    fn record(&self, rate_limit: Option<RateLimit>, limit: Option<u32>, reset_at: Option<u32>) {
        let mut usage = self.usage.lock().unwrap();
        if let Some(rate_limit) = rate_limit {
            usage.cost_total += rate_limit.cost.unwrap_or(0);
            usage.remaining = Some(rate_limit.remaining);
        }
        if limit.is_some() {
            usage.limit = limit;
        }
        if reset_at.is_some() {
            usage.reset_at = reset_at;
        }
    }
}

#[derive(Deserialize)]
struct Envelope {
    data: Option<Value>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Deserialize)]
pub(crate) struct RateLimit {
    cost: Option<u32>,
    remaining: u32,
}

/// Splits a GraphQL response body into its typed `data` and its `rateLimit` block.
pub(crate) fn decode<T: DeserializeOwned>(body: &str) -> Result<(T, Option<RateLimit>)> {
    let envelope: Envelope =
        serde_json::from_str(body).map_err(|e| Error::Decode(e.to_string()))?;
    if let Some(errors) = envelope.errors.filter(|e| !e.is_empty()) {
        return Err(Error::GitHub(errors));
    }
    let data = envelope
        .data
        .ok_or_else(|| Error::Decode("response has no data".into()))?;
    let rate_limit = data
        .get("rateLimit")
        .and_then(|r| RateLimit::deserialize(r).ok());
    let data = T::deserialize(data).map_err(|e| Error::Decode(e.to_string()))?;
    Ok((data, rate_limit))
}

fn network_error(error: reqwest::Error) -> Error {
    if error.is_decode() {
        Error::Decode(error.to_string())
    } else {
        Error::Network(error.to_string())
    }
}

fn rate_limited(status: StatusCode, headers: &HeaderMap) -> Option<u64> {
    if status != StatusCode::FORBIDDEN && status != StatusCode::TOO_MANY_REQUESTS {
        return None;
    }
    if let Some(secs) = header_u32(headers, "retry-after") {
        return Some(secs.into());
    }
    if header_u32(headers, "x-ratelimit-remaining") != Some(0) {
        return None;
    }
    let reset = header_u32(headers, "x-ratelimit-reset").map(u64::from)?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some(reset.saturating_sub(now))
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(name)
        .and_then(|v: &HeaderValue| v.to_str().ok())
}

fn header_u32(headers: &HeaderMap, name: &str) -> Option<u32> {
    header_str(headers, name).and_then(|v| v.trim().parse().ok())
}
