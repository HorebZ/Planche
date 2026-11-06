//! Serde mirrors of the GraphQL responses. Private to `github/`; `ops.rs` converts them.

use serde::Deserialize;

#[derive(Deserialize)]
pub(super) struct RepositoryCatalogData {
    pub viewer: RepositoryViewer,
}

#[derive(Deserialize)]
pub(super) struct RepositoryViewer {
    pub id: String,
    pub repositories: Connection<RepositoryNode>,
}

#[derive(Deserialize)]
pub(super) struct RepositoryLookupData {
    pub viewer: DescriptionViewer,
    pub repository: Option<RepositoryNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RepositoryNode {
    pub id: String,
    pub name_with_owner: String,
    pub url: String,
    pub has_issues_enabled: bool,
    pub is_archived: bool,
    pub owner: RepositoryAccount,
}

#[derive(Deserialize)]
pub(super) struct RepositoryAccount {
    pub __typename: String,
}

#[derive(Deserialize)]
pub(super) struct ActivityData {
    pub viewer: DescriptionViewer,
    pub node: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ActivityNode {
    pub created_at: String,
    pub author: Option<Login>,
    pub timeline_items: Option<Connection<ActivityEntry>>,
    pub closed_by_pull_requests_references: Option<Connection<ClosingPullRequest>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ActivityEntry {
    pub id: String,
    #[serde(rename = "__typename")]
    pub kind: ActivityKind,
    pub created_at: String,
    pub actor: Option<Login>,
    pub author: Option<Login>,
    pub assignee: Option<Login>,
    pub label: Option<ActivityLabel>,
    pub body: Option<String>,
    #[serde(default)]
    pub is_minimized: bool,
}

#[derive(Deserialize)]
pub(super) enum ActivityKind {
    IssueComment,
    CommentDeletedEvent,
    ClosedEvent,
    ReopenedEvent,
    AssignedEvent,
    UnassignedEvent,
    LabeledEvent,
    UnlabeledEvent,
}

#[derive(Deserialize)]
pub(super) struct Login {
    pub login: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ActivityLabel {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ClosingPullRequest {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub url: String,
    pub state: PullRequestState,
    pub is_draft: bool,
    pub repository: Repository,
}

#[derive(Deserialize)]
pub(super) struct IssueData {
    pub viewer: DescriptionViewer,
    pub node: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IssueNode {
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub viewer_can_react: bool,
    #[serde(default)]
    pub comment_repository: CommentRepository,
    #[serde(flatten)]
    pub content: Content,
    pub body: String,
    pub viewer_can_assign: bool,
    pub viewer_can_close: bool,
    pub viewer_can_reopen: bool,
    pub viewer_can_label: bool,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommentRepository {
    pub is_archived: bool,
    pub is_disabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommentNode {
    pub comments: CommentConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommentConnection {
    pub nodes: Vec<Option<Comment>>,
    pub page_info: CommentPageInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommentPageInfo {
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Comment {
    pub id: String,
    pub body: String,
    pub created_at: String,
    pub author: Option<Login>,
    pub viewer_did_author: bool,
    pub is_minimized: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AddCommentData {
    pub add_comment: AddCommentPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AddCommentPayload {
    pub client_mutation_id: Option<String>,
    pub comment_edge: Option<CommentEdge>,
}

#[derive(Deserialize)]
pub(super) struct CommentEdge {
    pub node: Comment,
}

#[derive(Deserialize)]
pub(super) struct IssueDescriptionData {
    pub viewer: DescriptionViewer,
    pub node: Option<DescriptionNode>,
}

#[derive(Deserialize)]
pub(super) struct DescriptionViewer {
    pub id: String,
}

#[derive(Deserialize)]
pub(super) struct DescriptionNode {
    pub id: String,
    pub __typename: String,
    pub body: Option<String>,
}

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
    #[serde(default, rename = "pageInfo")]
    pub page_info: Option<PageInfo>,
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
pub(super) struct UserInstallations {
    pub installations: Vec<Installation>,
}

#[derive(Deserialize)]
pub(super) struct Installation {
    pub account: InstallationAccount,
    pub suspended_at: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct InstallationAccount {
    pub login: String,
    #[serde(rename = "type")]
    pub kind: String,
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
    pub account: DescriptionViewer,
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
    pub viewer_can_update: bool,
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
        #[serde(default)]
        body: Option<String>,
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
        #[serde(default)]
        created_at: Option<String>,
        #[serde(default)]
        updated_at: Option<String>,
        #[serde(default)]
        author: Option<Author>,
        #[serde(default)]
        comments: Option<CommentCount>,
        #[serde(default)]
        parent: Option<ParentIssue>,
        #[serde(default)]
        sub_issues_summary: Option<crate::domain::SubIssues>,
        #[serde(default)]
        issue_dependencies_summary: Option<DependenciesSummary>,
        #[serde(default)]
        closed_by_pull_requests_references: Option<LinkedPullRequests>,
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
        #[serde(default)]
        created_at: Option<String>,
        #[serde(default)]
        updated_at: Option<String>,
        #[serde(default)]
        author: Option<Author>,
        #[serde(default)]
        comments: Option<CommentCount>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Author {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommentCount {
    pub total_count: u32,
}

#[derive(Deserialize)]
pub(super) struct ParentIssue {
    pub title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DependenciesSummary {
    pub blocked_by: u32,
    pub blocking: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedPullRequests {
    pub total_count: u32,
    pub nodes: Vec<Option<LinkedPullRequest>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedPullRequest {
    pub number: u32,
    pub title: String,
    pub pr_state: PullRequestState,
    pub is_draft: bool,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AddDraftIssueData {
    pub add_project_v2_draft_issue: AddedDraft,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AddedDraft {
    pub project_item: NodeId,
}

#[derive(Deserialize)]
pub(super) struct NodeId {
    pub id: String,
}

#[derive(Deserialize)]
pub(super) struct AssignableUsersData {
    pub repository: Option<AssignableRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AssignableRepository {
    pub assignable_users: Nodes<User>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RepositoryIssuesNode {
    pub issues: Connection<Content>,
}

#[derive(Deserialize)]
pub(super) struct RepositoryOptionsNode {
    pub labels: Option<Connection<Label>>,
    pub milestones: Option<Connection<RepositoryMilestone>>,
}

#[derive(Deserialize)]
pub(super) struct RepositoryMilestone {
    pub number: u32,
    pub title: String,
}
