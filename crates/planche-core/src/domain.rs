use serde::{Deserialize, Serialize};
use specta::Type;

macro_rules! id_type {
    ($($(#[$doc:meta])* $name:ident),+ $(,)?) => {$(
        $(#[$doc])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, Type)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl From<String> for $name {
            fn from(id: String) -> Self {
                Self(id)
            }
        }
    )+};
}

id_type! {
    /// Node ID of a `ProjectV2`.
    ProjectId,
    /// Node ID of a `ProjectV2Item`, the card. Not the ID of its issue or pull request.
    ItemId,
    /// Node ID of a project field such as Status.
    FieldId,
    /// ID of a single-select option. GitHub types it `String`, not `ID`.
    OptionId,
    /// Node ID of a `ProjectV2View`.
    ViewId,
    /// Node ID of a `User`.
    UserId,
    /// Node ID of the item content, an `Issue`, `PullRequest` or `DraftIssue`.
    ContentId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Viewer {
    pub id: UserId,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct User {
    pub id: UserId,
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Label {
    pub name: String,
    /// Hex color without `#`, as GitHub sends it.
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ProjectList {
    /// The viewer first, then organizations by login.
    pub owners: Vec<OwnerProjects>,
    /// Organizations that refused the token, usually SAML SSO without authorization.
    pub sso_blocked: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct OwnerProjects {
    pub login: String,
    pub is_org: bool,
    pub projects: Vec<ProjectSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ProjectSummary {
    pub id: ProjectId,
    pub number: u32,
    pub title: String,
    pub closed: bool,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ProjectMeta {
    pub id: ProjectId,
    pub number: u32,
    pub title: String,
    pub url: String,
    pub owner: String,
    pub owner_is_org: bool,
    pub updated_at: String,
    pub fields: Vec<Field>,
    pub views: Vec<View>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Field {
    pub id: FieldId,
    pub name: String,
    /// GitHub's `ProjectV2FieldType`, such as `SINGLE_SELECT` or `TITLE`.
    pub data_type: String,
    /// `Some` only for single-select fields.
    pub options: Option<Vec<SelectOption>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SelectOption {
    pub id: OptionId,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub enum ViewLayout {
    Board,
    Table,
    Roadmap,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct View {
    pub id: ViewId,
    pub number: u32,
    pub name: String,
    pub layout: ViewLayout,
    /// Ignored in v1: the board shows every unarchived item.
    pub filter: Option<String>,
    /// False when the view sorts by a field, so a card cannot be reordered by hand.
    pub manual_order: bool,
    /// The field a board view uses for its columns.
    pub group_by: Option<FieldId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    pub id: ItemId,
    pub archived: bool,
    pub updated_at: String,
    pub single_selects: Vec<(FieldId, OptionId)>,
    pub content: ItemContent,
}

impl Item {
    pub fn option_for(&self, field: &FieldId) -> Option<&OptionId> {
        self.single_selects
            .iter()
            .find(|(f, _)| f == field)
            .map(|(_, o)| o)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum IssueState {
    Open,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PullRequestState {
    Open,
    Closed,
    Merged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ItemContent {
    Draft {
        id: ContentId,
        title: String,
        assignees: Vec<User>,
    },
    Issue {
        id: ContentId,
        number: u32,
        title: String,
        url: String,
        repo: String,
        state: IssueState,
        assignees: Vec<User>,
        labels: Vec<Label>,
    },
    PullRequest {
        id: ContentId,
        number: u32,
        title: String,
        url: String,
        repo: String,
        state: PullRequestState,
        is_draft: bool,
        assignees: Vec<User>,
        labels: Vec<Label>,
    },
    /// Content the token cannot read, such as an issue from a private repo.
    Redacted,
}

impl ItemContent {
    pub fn title(&self) -> &str {
        match self {
            Self::Draft { title, .. }
            | Self::Issue { title, .. }
            | Self::PullRequest { title, .. } => title,
            Self::Redacted => "Redacted item",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Board {
    pub project: BoardProject,
    pub view: Option<BoardView>,
    pub field: BoardField,
    /// "No <field>" first when some items have no value, then one column per option.
    pub columns: Vec<Column>,
    /// Queued intents GitHub has not acknowledged yet.
    pub pending_count: u32,
    /// When the last full sync finished, in UTC. `None` before the first one.
    pub synced_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BoardProject {
    pub id: ProjectId,
    pub number: u32,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BoardView {
    pub number: u32,
    pub name: String,
    /// False when the view sorts by a field: cards move between columns, not within one.
    pub manual_order: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BoardField {
    pub id: FieldId,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Column {
    /// `None` for the "No <field>" column.
    pub option_id: Option<OptionId>,
    pub name: String,
    pub color: Option<String>,
    pub cards: Vec<Card>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Card {
    pub item_id: ItemId,
    /// Rank among the board's cards in project order. GitHub orders a card across every column.
    pub position: u32,
    #[serde(flatten)]
    pub content: ItemContent,
    /// A queued intent GitHub has not acknowledged yet touches this card.
    pub pending: bool,
    /// The last sync changed this card.
    pub updated_by_sync: bool,
}

impl Card {
    pub fn title(&self) -> &str {
        self.content.title()
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Type)]
pub struct RateUsage {
    /// Sum of `rateLimit.cost` over every request made by this client.
    pub cost_total: u32,
    pub remaining: Option<u32>,
    pub limit: Option<u32>,
    /// Unix time of the next quota reset, from `x-ratelimit-reset`.
    pub reset_at: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_id_serializes_as_bare_string() {
        let id = ItemId("PVTI_lADOAq5TD84Bm1t2zgXyZ".into());
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, r#""PVTI_lADOAq5TD84Bm1t2zgXyZ""#);
        assert_eq!(serde_json::from_str::<ItemId>(&json).unwrap(), id);
    }
}
