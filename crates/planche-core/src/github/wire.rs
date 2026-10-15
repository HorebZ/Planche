//! Serde mirrors of the GraphQL responses. Private to `github/`; `ops.rs` converts them.

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Connection<T> {
    /// Requested for items only.
    #[serde(default)]
    pub total_count: Option<u32>,
    pub page_info: PageInfo,
    pub nodes: Vec<Option<T>>,
}

#[derive(Deserialize)]
pub(super) struct Nodes<T> {
    pub nodes: Vec<Option<T>>,
}

#[derive(Deserialize)]
pub(super) struct ViewerData {
    pub viewer: Viewer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Viewer {
    pub id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

/// An entry of REST `/user/orgs`.
#[derive(Deserialize)]
pub(super) struct Organization {
    pub login: String,
}

#[derive(Deserialize)]
pub(super) struct ListProjectsData {
    pub user: Option<ProjectsOwner>,
    pub organization: Option<ProjectsOwner>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ProjectsOwner {
    pub projects_v2: Connection<ProjectSummary>,
}

#[derive(Deserialize)]
pub(super) struct ProjectSummary {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub closed: bool,
    pub url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ProjectBoardData {
    pub viewer: Option<BoardOwner>,
    pub repository_owner: Option<BoardOwner>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BoardOwner {
    pub project_v2: Option<BoardProject>,
}

#[derive(Deserialize)]
pub(super) struct BoardProject {
    #[serde(flatten)]
    pub meta: Project,
    pub items: Connection<Item>,
}

#[derive(Deserialize)]
pub(super) struct ProjectMetaData {
    pub node: Option<Project>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Project {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub url: String,
    pub updated_at: String,
    pub owner: Owner,
    pub fields: Nodes<Field>,
    pub views: Nodes<View>,
}

#[derive(Deserialize)]
pub(super) struct Owner {
    #[serde(rename = "__typename")]
    pub typename: String,
    pub login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Field {
    pub id: String,
    pub name: String,
    pub data_type: String,
    pub options: Option<Vec<SelectOption>>,
}

#[derive(Deserialize)]
pub(super) struct SelectOption {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct View {
    pub id: String,
    pub number: u32,
    pub name: String,
    pub layout: String,
    pub filter: Option<String>,
    pub vertical_group_by_fields: Nodes<FieldRef>,
    pub sort_by_fields: Count,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Count {
    pub total_count: u32,
}

#[derive(Deserialize)]
pub(super) struct FieldRef {
    pub id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ProjectItemsData {
    pub node: Option<ItemsProject>,
}

#[derive(Deserialize)]
pub(super) struct ItemsProject {
    pub items: Connection<Item>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Item {
    pub id: String,
    pub is_archived: bool,
    pub updated_at: String,
    pub field_values: Nodes<FieldValue>,
    pub content: Option<Content>,
}

#[derive(Deserialize)]
#[serde(tag = "__typename", rename_all_fields = "camelCase")]
pub(super) enum FieldValue {
    #[serde(rename = "ProjectV2ItemFieldSingleSelectValue")]
    SingleSelect {
        option_id: Option<String>,
        field: FieldRef,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "__typename", rename_all_fields = "camelCase")]
pub(super) enum Content {
    DraftIssue {
        id: String,
        title: String,
        assignees: Nodes<User>,
    },
    Issue {
        id: String,
        number: u32,
        title: String,
        url: String,
        issue_state: IssueState,
        repository: Repository,
        assignees: Nodes<User>,
        labels: Nodes<Label>,
    },
    PullRequest {
        id: String,
        number: u32,
        title: String,
        url: String,
        pr_state: PullRequestState,
        is_draft: bool,
        repository: Repository,
        assignees: Nodes<User>,
        labels: Nodes<Label>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(super) enum IssueState {
    Open,
    Closed,
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(super) enum PullRequestState {
    Open,
    Closed,
    Merged,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Repository {
    pub name_with_owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct User {
    pub id: String,
    pub login: String,
    pub avatar_url: String,
}

#[derive(Deserialize)]
pub(super) struct Label {
    pub name: String,
    pub color: String,
}
