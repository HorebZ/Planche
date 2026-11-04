pub mod ops;
mod wire;

#[cfg(test)]
#[path = "_fixtures/mod.rs"]
pub(crate) mod fixtures;

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
    restricted_oauth: bool,
    app_token: Option<String>,
    managed: bool,
    usage: Mutex<RateUsage>,
}

pub(crate) struct Reply<T> {
    pub data: T,
    /// The `x-oauth-scopes` header. Fine-grained tokens do not send it.
    pub scopes: Option<String>,
}

impl GithubClient {
    pub fn new(token: impl Into<String>) -> Result<Self> {
        let token = token.into();
        let connection = crate::auth::session::connection(&token);
        let managed = connection.is_some();
        let (restricted_oauth, app_token) = connection.unwrap_or_default();
        let http = reqwest::Client::builder()
            .user_agent(concat!("planche/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(5))
            // GitHub cancels queries after 10 s on its side.
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| Error::Network(e.to_string()))?;

        Ok(Self {
            http,
            token,
            restricted_oauth,
            app_token,
            managed,
            usage: Mutex::default(),
        })
    }

    pub(super) fn uses_app_permissions(&self) -> bool {
        self.token.starts_with("ghu_")
    }

    pub(crate) fn restricted_oauth(&self) -> bool {
        self.restricted_oauth
    }

    pub(crate) fn can_write_issues(&self) -> bool {
        !self.restricted_oauth || self.app_token.is_some()
    }

    pub(crate) fn organization_client(&self) -> Result<Option<Self>> {
        self.app_token.as_ref().map(Self::new).transpose()
    }

    /// Resolve the owner before sending project queries; organization access never falls back to OAuth.
    pub async fn for_owner(&self, owner: &str, known_organization: Option<bool>) -> Result<Self> {
        if !self.restricted_oauth || owner == "@me" {
            return self.project_client(false);
        }
        if let Some(organization) = known_organization {
            return self.project_client(organization);
        }
        if owner.is_empty()
            || !owner
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        {
            return Err(Error::Decode("invalid GitHub owner".into()));
        }
        #[derive(Deserialize)]
        struct Owner {
            #[serde(rename = "type")]
            kind: String,
        }
        let owner: Owner = self.rest_get(&format!("/users/{}", owner)).await?;

        match owner.kind.as_str() {
            "Organization" => self.project_client(true),
            "User" => self.project_client(false),
            _ => Err(Error::Decode("unsupported GitHub project owner".into())),
        }
    }

    fn project_client(&self, organization: bool) -> Result<Self> {
        if self.restricted_oauth && organization {
            self.organization_client()?.ok_or_else(|| {
                Error::OAuth(
                    "Connect organizations with the GitHub App to open this project".into(),
                )
            })
        } else {
            let mut client = Self::new(&self.token)?;
            client.restricted_oauth = self.restricted_oauth;
            client.app_token = self.app_token.clone();
            client.managed = self.managed;

            Ok(client)
        }
    }

    fn operation_token(&self, operation: &str) -> Result<&str> {
        let content = matches!(
            operation,
            "Issue"
                | "IssueDescription"
                | "IssueActivity"
                | "IssueComments"
                | "AddComment"
                | "AssignableUsers"
                | "AddAssignees"
                | "RemoveAssignees"
        );
        if content
            && !self.can_write_issues()
            && matches!(operation, "AddAssignees" | "RemoveAssignees" | "AddComment")
        {
            return Err(Error::OAuth("This connection can only read public issues. Connect the GitHub App or use a PAT to change assignees.".into()));
        }

        Ok(if content {
            self.app_token.as_deref().unwrap_or(&self.token)
        } else {
            &self.token
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
        let token = self.operation_token(operation)?;
        let (headers, body) = self.send(request, token).await?;
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
        let (_, body) = self.send(request, &self.token).await?;

        serde_json::from_str(&body).map_err(|e| Error::Decode(e.to_string()))
    }

    async fn send(
        &self,
        request: reqwest::RequestBuilder,
        token: &str,
    ) -> Result<(HeaderMap, String)> {
        let token = crate::auth::session::request_token(token, self.managed).await?;
        let response = request
            .bearer_auth(token)
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

#[cfg(test)]
#[path = "mod.test.rs"]
mod tests;

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
