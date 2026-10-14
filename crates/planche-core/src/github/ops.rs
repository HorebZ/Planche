//! One function per GraphQL operation. Converts wire types into `domain` types.

use serde::de::IgnoredAny;
use serde_json::json;

use super::{GithubClient, decode, wire};
use crate::board::project_board;
use crate::domain::{
    Board, ContentId, Field, FieldId, IssueState, Item, ItemContent, Label, OptionId,
    OwnerProjects, ProjectId, ProjectList, ProjectMeta, ProjectSummary, PullRequestState,
    SelectOption, User, UserId, View, ViewId, ViewLayout, Viewer,
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

/// Every item of the project, in `POSITION` order, following `endCursor` until the last page.
pub async fn project_items(client: &GithubClient, project: &ProjectId) -> Result<Vec<Item>> {
    project_items_after(client, project, None).await
}

async fn project_items_after(
    client: &GithubClient,
    project: &ProjectId,
    mut after: Option<String>,
) -> Result<Vec<Item>> {
    let mut items = Vec::new();
    loop {
        let reply = client
            .query::<wire::ProjectItemsData>(
                QUERIES,
                "ProjectItems",
                json!({ "projectId": project, "after": after }),
            )
            .await?;
        let page = items_page_from_wire(project_node(reply.data.node)?.items);
        items.extend(page.items);
        match page.next_cursor {
            Some(cursor) => after = Some(cursor),
            None => return Ok(items),
        }
    }
}

/// Fetches `<owner>/<number>`, where `@me` is the viewer, and builds the board. A project
/// under 100 items takes a single request.
pub async fn fetch_board(
    client: &GithubClient,
    owner: &str,
    number: u32,
    view: Option<u32>,
) -> Result<Board> {
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
    let meta = meta_from_wire(project.meta)?;
    let first = items_page_from_wire(project.items);
    let mut items = first.items;
    if let Some(cursor) = first.next_cursor {
        items.extend(project_items_after(client, &meta.id, Some(cursor)).await?);
    }
    project_board(&meta, view, &items)
}

/// Sends one mutation.
pub async fn execute(client: &GithubClient, operation: &Operation) -> Result<()> {
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
    };
    client
        .query::<IgnoredAny>(MUTATIONS, name, variables)
        .await?;
    Ok(())
}

/// Decodes a captured `ProjectMeta` response body.
pub fn decode_project_meta(body: &str) -> Result<ProjectMeta> {
    let (data, _) = decode::<wire::ProjectMetaData>(body)?;
    meta_from_wire(project_node(data.node)?)
}

pub struct ItemsPage {
    pub items: Vec<Item>,
    pub next_cursor: Option<String>,
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
        owner: p.owner.login,
        fields: p
            .fields
            .nodes
            .into_iter()
            .flatten()
            .map(|f| Field {
                id: FieldId(f.id),
                name: f.name,
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
        } => ItemContent::PullRequest {
            id: ContentId(id),
            number,
            title,
            url,
            repo: repository.name_with_owner,
            state: match pr_state {
                wire::PullRequestState::Open => PullRequestState::Open,
                wire::PullRequestState::Closed => PullRequestState::Closed,
                wire::PullRequestState::Merged => PullRequestState::Merged,
            },
            is_draft,
            assignees: users(assignees),
            labels: labels_from_wire(labels),
        },
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
