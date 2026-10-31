//! One function per GraphQL operation. Converts wire types into `domain` types.

use serde::de::IgnoredAny;
use serde_json::json;

use super::{GithubClient, decode, wire};
use crate::domain::{
    CardDetails, ContentId, Field, FieldId, IssueState, Item, ItemContent, ItemId, Label,
    LinkedPullRequest, OptionId, OwnerProjects, ProjectId, ProjectList, ProjectMeta,
    ProjectSummary, PullRequestState, SelectOption, User, UserId, View, ViewId, ViewLayout, Viewer,
};
use crate::error::{Error, Result};
use crate::intent::Operation;

const QUERIES: &str = include_str!("../../graphql/queries.graphql");
const MUTATIONS: &str = include_str!("../../graphql/mutations.graphql");

/// The signed-in user, and the token scopes from `x-oauth-scopes`.
pub async fn viewer(client: &GithubClient) -> Result<(Viewer, Option<String>)> {
    let reply = client
        .query::<wire::ViewerData>(QUERIES, "Viewer", json!({}))
        .await?;
    let v = reply.data.viewer;
    let viewer = Viewer {
        id: UserId(v.id),
        login: v.login,
        name: v.name,
        avatar_url: v.avatar_url,
    };

    Ok((viewer, reply.scopes))
}

/// Logins of every organization the viewer belongs to.
///
/// Uses REST `/user/orgs`: GraphQL `viewer.organizations` leaves out some memberships
/// that REST returns, and their projects would silently disappear.
pub async fn viewer_organizations(client: &GithubClient) -> Result<Vec<String>> {
    const PER_PAGE: usize = 100;

    let mut logins = Vec::new();

    for page in 1.. {
        let orgs: Vec<wire::Organization> = client
            .rest_get(&format!("/user/orgs?per_page={PER_PAGE}&page={page}"))
            .await?;
        let last = orgs.len() < PER_PAGE;

        logins.extend(orgs.into_iter().map(|o| o.login));

        if last {
            break;
        }
    }

    Ok(logins)
}

/// Projects of the viewer, then of each organization by login. An organization that
/// refuses the token goes into `sso_blocked` instead of failing the list.
pub async fn list_projects(client: &GithubClient) -> Result<ProjectList> {
    let (viewer, _) = viewer(client).await?;
    let mut orgs = viewer_organizations(client).await?;

    orgs.sort_by_key(|login| login.to_lowercase());

    let mut owners = vec![OwnerProjects {
        projects: owner_projects(client, &viewer.login, false).await?,
        login: viewer.login,
        is_org: false,
    }];
    let mut sso_blocked = Vec::new();

    for login in orgs {
        match owner_projects(client, &login, true).await {
            Ok(projects) => owners.push(OwnerProjects {
                login,
                is_org: true,
                projects,
            }),
            Err(Error::GitHub(errors)) if errors.iter().any(|e| e.is_access_denied()) => {
                sso_blocked.push(login)
            }
            Err(error) => return Err(error),
        }
    }

    Ok(ProjectList {
        owners,
        sso_blocked,
    })
}

async fn owner_projects(
    client: &GithubClient,
    login: &str,
    is_org: bool,
) -> Result<Vec<ProjectSummary>> {
    let mut projects = Vec::new();
    let mut after: Option<String> = None;

    loop {
        let reply = client
            .query::<wire::ListProjectsData>(
                QUERIES,
                "ListProjects",
                json!({ "login": login, "isOrg": is_org, "after": after }),
            )
            .await?;

        let Some(owner) = reply.data.user.or(reply.data.organization) else {
            return Ok(projects);
        };

        let page = owner.projects_v2;

        projects.extend(page.nodes.into_iter().flatten().map(|p| ProjectSummary {
            id: ProjectId(p.id),
            number: p.number,
            title: p.title,
            closed: p.closed,
            url: p.url,
        }));

        match next_cursor(page.page_info) {
            Some(cursor) => after = Some(cursor),
            None => return Ok(projects),
        }
    }
}

pub async fn project_meta(client: &GithubClient, project: &ProjectId) -> Result<ProjectMeta> {
    let reply = client
        .query::<wire::ProjectMetaData>(QUERIES, "ProjectMeta", json!({ "projectId": project }))
        .await?;

    meta_from_wire(project_node(reply.data.node)?)
}

/// Fetches the metadata and the first 100 items of `<owner>/<number>`, where `@me` is the
/// viewer, in one request. `items_page` follows `next_cursor`.
pub async fn board_page(
    client: &GithubClient,
    owner: &str,
    number: u32,
) -> Result<(ProjectMeta, ItemsPage)> {
    let not_found = || Error::ProjectNotFound {
        owner: owner.to_owned(),
        number,
    };
    let reply = client
        .query::<wire::ProjectBoardData>(
            QUERIES,
            "ProjectBoard",
            json!({ "login": owner, "viewer": owner == "@me", "number": number }),
        )
        .await
        .map_err(|e| match e {
            Error::GitHub(errors)
                if errors
                    .iter()
                    .any(|e| e.kind.as_deref() == Some("NOT_FOUND")) =>
            {
                not_found()
            }
            e => e,
        })?;
    let project = reply
        .data
        .viewer
        .or(reply.data.repository_owner)
        .and_then(|o| o.project_v2)
        .ok_or_else(not_found)?;

    Ok((
        meta_from_wire(project.meta)?,
        items_page_from_wire(project.items),
    ))
}

/// The 100 items after `cursor`.
pub async fn items_page(
    client: &GithubClient,
    project: &ProjectId,
    cursor: &str,
) -> Result<ItemsPage> {
    let reply = client
        .query::<wire::ProjectItemsData>(
            QUERIES,
            "ProjectItems",
            json!({ "projectId": project, "after": cursor }),
        )
        .await?;

    Ok(items_page_from_wire(project_node(reply.data.node)?.items))
}

/// Sends one mutation. `AddDraftIssue` answers with the new item's ID.
pub async fn execute(client: &GithubClient, operation: &Operation) -> Result<Option<ItemId>> {
    let (name, variables) = match operation {
        Operation::SetSingleSelect {
            project_id,
            item_id,
            field_id,
            option_id,
        } => (
            "SetSingleSelect",
            json!({ "projectId": project_id, "itemId": item_id, "fieldId": field_id, "optionId": option_id }),
        ),
        Operation::ClearFieldValue {
            project_id,
            item_id,
            field_id,
        } => (
            "ClearFieldValue",
            json!({ "projectId": project_id, "itemId": item_id, "fieldId": field_id }),
        ),
        Operation::MoveItemPosition {
            project_id,
            item_id,
            after_id,
        } => (
            "MoveItemPosition",
            json!({ "projectId": project_id, "itemId": item_id, "afterId": after_id }),
        ),
        Operation::ArchiveItem {
            project_id,
            item_id,
        } => (
            "ArchiveItem",
            json!({ "projectId": project_id, "itemId": item_id }),
        ),
        Operation::UnarchiveItem {
            project_id,
            item_id,
        } => (
            "UnarchiveItem",
            json!({ "projectId": project_id, "itemId": item_id }),
        ),
        Operation::AddDraftIssue { project_id, title } => {
            let reply = client
                .query::<wire::AddDraftIssueData>(
                    MUTATIONS,
                    "AddDraftIssue",
                    json!({ "projectId": project_id, "title": title }),
                )
                .await?;

            return Ok(Some(ItemId(
                reply.data.add_project_v2_draft_issue.project_item.id,
            )));
        }
        Operation::AddAssignees {
            assignable_id,
            assignee_ids,
        } => (
            "AddAssignees",
            json!({ "assignableId": assignable_id, "assigneeIds": assignee_ids }),
        ),
        Operation::RemoveAssignees {
            assignable_id,
            assignee_ids,
        } => (
            "RemoveAssignees",
            json!({ "assignableId": assignable_id, "assigneeIds": assignee_ids }),
        ),
        Operation::SetDraftAssignees {
            draft_issue_id,
            assignee_ids,
        } => (
            "SetDraftAssignees",
            json!({ "draftIssueId": draft_issue_id, "assigneeIds": assignee_ids }),
        ),
    };

    client
        .query::<IgnoredAny>(MUTATIONS, name, variables)
        .await?;

    Ok(None)
}

/// The first 100 users who can be assigned in `owner/name`.
pub async fn assignable_users(client: &GithubClient, owner: &str, name: &str) -> Result<Vec<User>> {
    let reply = client
        .query::<wire::AssignableUsersData>(
            QUERIES,
            "AssignableUsers",
            json!({ "owner": owner, "name": name }),
        )
        .await?;
    let repository = reply
        .data
        .repository
        .ok_or_else(|| Error::Decode(format!("repository {owner}/{name} is null")))?;

    Ok(users(repository.assignable_users))
}

/// Decodes a captured `ProjectMeta` response body.
pub fn decode_project_meta(body: &str) -> Result<ProjectMeta> {
    let (data, _) = decode::<wire::ProjectMetaData>(body)?;

    meta_from_wire(project_node(data.node)?)
}

pub struct ItemsPage {
    pub items: Vec<Item>,
    pub next_cursor: Option<String>,
    /// Items in the whole project, archived ones included.
    pub total_count: u32,
}

/// Decodes a captured `ProjectItems` response body.
pub fn decode_project_items(body: &str) -> Result<ItemsPage> {
    let (data, _) = decode::<wire::ProjectItemsData>(body)?;

    Ok(items_page_from_wire(project_node(data.node)?.items))
}

fn project_node<T>(node: Option<T>) -> Result<T> {
    node.ok_or_else(|| Error::Decode("project node is null".into()))
}

fn next_cursor(page_info: wire::PageInfo) -> Option<String> {
    page_info.end_cursor.filter(|_| page_info.has_next_page)
}

fn meta_from_wire(p: wire::Project) -> Result<ProjectMeta> {
    Ok(ProjectMeta {
        id: ProjectId(p.id),
        number: p.number,
        title: p.title,
        url: p.url,
        owner_is_org: p.owner.typename == "Organization",
        owner: p.owner.login,
        updated_at: p.updated_at,
        fields: p
            .fields
            .nodes
            .into_iter()
            .flatten()
            .map(|f| Field {
                id: FieldId(f.id),
                name: f.name,
                data_type: f.data_type,
                options: f.options.map(|options| {
                    options
                        .into_iter()
                        .map(|o| SelectOption {
                            id: OptionId(o.id),
                            name: o.name,
                            color: o.color,
                        })
                        .collect()
                }),
            })
            .collect(),
        views: p
            .views
            .nodes
            .into_iter()
            .flatten()
            .filter_map(|v| {
                let layout = match v.layout.as_str() {
                    "BOARD_LAYOUT" => ViewLayout::Board,
                    "TABLE_LAYOUT" => ViewLayout::Table,
                    "ROADMAP_LAYOUT" => ViewLayout::Roadmap,
                    _ => return None,
                };

                Some(View {
                    id: ViewId(v.id),
                    number: v.number,
                    name: v.name,
                    layout,
                    filter: v.filter,
                    manual_order: v.sort_by_fields.total_count == 0,
                    group_by: v
                        .vertical_group_by_fields
                        .nodes
                        .into_iter()
                        .flatten()
                        .find_map(|f| f.id)
                        .map(FieldId),
                })
            })
            .collect(),
    })
}

fn items_page_from_wire(page: wire::Connection<wire::Item>) -> ItemsPage {
    ItemsPage {
        total_count: page.total_count.unwrap_or_default(),
        items: page
            .nodes
            .into_iter()
            .flatten()
            .map(item_from_wire)
            .collect(),
        next_cursor: next_cursor(page.page_info),
    }
}

fn item_from_wire(item: wire::Item) -> Item {
    let single_selects = item
        .field_values
        .nodes
        .into_iter()
        .flatten()
        .filter_map(|value| match value {
            wire::FieldValue::SingleSelect {
                option_id: Some(option),
                field: wire::FieldRef { id: Some(field) },
            } => Some((FieldId(field), OptionId(option))),
            _ => None,
        })
        .collect();

    Item {
        id: crate::domain::ItemId(item.id),
        archived: item.is_archived,
        updated_at: item.updated_at,
        single_selects,
        content: item
            .content
            .map_or(ItemContent::Redacted, content_from_wire),
    }
}

fn content_from_wire(content: wire::Content) -> ItemContent {
    match content {
        wire::Content::DraftIssue {
            id,
            title,
            assignees,
        } => ItemContent::Draft {
            id: ContentId(id),
            title,
            assignees: users(assignees),
        },
        wire::Content::Issue {
            id,
            number,
            title,
            url,
            issue_state,
            repository,
            assignees,
            labels,
            created_at,
            parent,
            sub_issues_summary,
            issue_dependencies_summary,
            closed_by_pull_requests_references,
        } => ItemContent::Issue {
            id: ContentId(id),
            number,
            title,
            url,
            repo: repository.name_with_owner,
            state: match issue_state {
                wire::IssueState::Open => IssueState::Open,
                wire::IssueState::Closed => IssueState::Closed,
            },
            assignees: users(assignees),
            labels: labels_from_wire(labels),
            details: Box::new(CardDetails {
                created_at,
                parent_title: parent.map(|p| p.title),
                sub_issues: sub_issues_summary.filter(|s| s.total > 0),
                blocked_by: issue_dependencies_summary
                    .as_ref()
                    .map_or(0, |d| d.blocked_by),
                blocking: issue_dependencies_summary
                    .as_ref()
                    .map_or(0, |d| d.blocking),
                pull_request_count: closed_by_pull_requests_references
                    .as_ref()
                    .map_or(0, |p| p.total_count),
                pull_request: closed_by_pull_requests_references
                    .filter(|p| p.total_count == 1)
                    .and_then(|p| p.nodes.into_iter().flatten().next())
                    .map(|p| LinkedPullRequest {
                        number: p.number,
                        title: p.title,
                        state: pr_state(p.pr_state),
                        is_draft: p.is_draft,
                    }),
            }),
        },
        wire::Content::PullRequest {
            id,
            number,
            title,
            url,
            pr_state,
            is_draft,
            repository,
            assignees,
            labels,
            created_at,
        } => ItemContent::PullRequest {
            id: ContentId(id),
            number,
            title,
            url,
            repo: repository.name_with_owner,
            state: self::pr_state(pr_state),
            is_draft,
            assignees: users(assignees),
            labels: labels_from_wire(labels),
            details: Box::new(CardDetails {
                created_at,
                ..Default::default()
            }),
        },
    }
}

fn pr_state(state: wire::PullRequestState) -> PullRequestState {
    match state {
        wire::PullRequestState::Open => PullRequestState::Open,
        wire::PullRequestState::Closed => PullRequestState::Closed,
        wire::PullRequestState::Merged => PullRequestState::Merged,
    }
}

fn users(nodes: wire::Nodes<wire::User>) -> Vec<User> {
    nodes
        .nodes
        .into_iter()
        .flatten()
        .map(|u| User {
            id: UserId(u.id),
            login: u.login,
            avatar_url: u.avatar_url,
        })
        .collect()
}

fn labels_from_wire(nodes: wire::Nodes<wire::Label>) -> Vec<Label> {
    nodes
        .nodes
        .into_iter()
        .flatten()
        .map(|l| Label {
            name: l.name,
            color: l.color,
        })
        .collect()
}
