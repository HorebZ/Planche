use serde::Deserialize;

use crate::domain::ItemId;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not signed in, run `planche auth login`")]
    NotSignedIn,
    #[error("token rejected by GitHub (401)")]
    Unauthorized,
    #[error("the token is missing the {} scope(s); reconnect GitHub or create a classic token with repo, read:org and project", .0.join(", "))]
    MissingScopes(Vec<String>),
    #[error(
        "Planche needs GitHub sign-in or a classic personal access token with repo, read:org and project. \
         A fine-grained token covers a single resource owner, so it cannot reach your account and your organizations at once"
    )]
    ClassicTokenRequired,
    #[error("network unreachable: {0}")]
    Network(String),
    #[error("GitHub rate limit reached, retry in {retry_after_secs}s")]
    RateLimited { retry_after_secs: u64 },
    #[error("GitHub returned HTTP {0}")]
    Http(u16),
    #[error("GitHub API error: {}", .0.iter().map(|e| e.message.as_str()).collect::<Vec<_>>().join("; "))]
    GitHub(Vec<GraphqlError>),
    #[error("unexpected response from GitHub: {0}")]
    Decode(String),
    #[error("project {owner}/{number} not found")]
    ProjectNotFound { owner: String, number: u32 },
    #[error("view {0} not found")]
    ViewNotFound(u32),
    #[error("view {0} is not a board")]
    ViewNotBoard(u32),
    #[error("the project has no board view and no single select field named Status")]
    NoStatusField,
    #[error("the board columns use the field {0}, which is not a single select field")]
    UnsupportedColumnField(String),
    #[error("no card matches `{0}`")]
    CardNotFound(String),
    #[error(
        "`{query}` matches several cards, pass one of these item IDs instead:{}",
        candidates.iter().map(|(id, title)| format!("\n  {id}  {title}")).collect::<String>()
    )]
    AmbiguousCard {
        query: String,
        candidates: Vec<(ItemId, String)>,
    },
    #[error("no column `{name}`, expected one of: {}", valid.join(", "))]
    UnknownColumn { name: String, valid: Vec<String> },
    #[error("credential storage error: {0}")]
    Credentials(String),
    #[error("GitHub sign-in: {0}")]
    OAuth(String),
    #[error("cache error: {0}")]
    Cache(String),
    #[error(
        "{owner}/{number} is not in the cache yet, run `planche board {owner}/{number}` once online"
    )]
    NotCached { owner: String, number: u32 },
}

impl Error {
    /// Worth retrying later: the network, the rate limit, GitHub's side, or a token to fix.
    /// Any other error from a mutation is definitive.
    pub fn is_transient(&self) -> bool {
        match self {
            Self::Network(_) | Self::RateLimited { .. } | Self::Unauthorized => true,
            Self::Http(status) => *status == 429 || *status >= 500,
            _ => false,
        }
    }
}

impl From<rusqlite::Error> for Error {
    fn from(error: rusqlite::Error) -> Self {
        Self::Cache(error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct GraphqlError {
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub message: String,
}

impl GraphqlError {
    pub fn is_access_denied(&self) -> bool {
        self.kind.as_deref() == Some("FORBIDDEN") || self.message.contains("SAML")
    }
}
