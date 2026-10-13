//! One function per GraphQL operation. Converts wire types into `domain` types.

use serde_json::json;

use super::{GithubClient, decode, wire};
use crate::board::project_board;
use crate::domain::{
    Board, ContentId, Field, FieldId, IssueState, Item, ItemContent, Label, OptionId,
    OwnerProjects, ProjectId, ProjectList, ProjectMeta, ProjectSummary, PullRequestState,
    SelectOption, User, UserId, View, ViewId, ViewLayout, Viewer,
};
use crate::error::{Error, Result};

const QUERIES: &str = include_str!("../../graphql/queries.graphql");

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

/// Finds the project ID for `<owner>/<number>`, where `@me` is the viewer.
pub async fn resolve_project(client: &GithubClient, owner: &str, number: u32) -> Result<ProjectId> {
    let (login, is_org) = if owner == "@me" {
        (viewer(client).await?.0.login, false)
    } else {
        let orgs = viewer_organizations(client).await?;
        let is_org = orgs.iter().any(|o| o.eq_ignore_ascii_case(owner));
        (owner.to_owned(), is_org)
    };
    let not_found = || Error::ProjectNotFound {
        owner: owner.to_owned(),
        number,
    };
    let reply = client
        .query::<wire::ResolveProjectData>(
            QUERIES,
            "ResolveProject",
            json!({ "login": login, "isOrg": is_org, "number": number }),
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
    reply
        .data
        .user
        .or(reply.data.organization)
        .and_then(|o| o.project_v2)
        .map(|p| ProjectId(p.id))
        .ok_or_else(not_found)
}

pub async fn project_meta(client: &GithubClient, project: &ProjectId) -> Result<ProjectMeta> {
    let reply = client
        .query::<wire::ProjectMetaData>(QUERIES, "ProjectMeta", json!({ "projectId": project }))
        .await?;
    meta_from_wire(reply.data)
}

/// Every item of the project, in `POSITION` order, following `endCursor` until the last page.
pub async fn project_items(client: &GithubClient, project: &ProjectId) -> Result<Vec<Item>> {
    let mut items = Vec::new();
    let mut after: Option<String> = None;
    loop {
        let reply = client
            .query::<wire::ProjectItemsData>(
                QUERIES,
                "ProjectItems",
                json!({ "projectId": project, "after": after }),
            )
            .await?;
        let page = items_page_from_wire(reply.data)?;
        items.extend(page.items);
        match page.next_cursor {
            Some(cursor) => after = Some(cursor),
            None => return Ok(items),
        }
    }
}

/// Resolves the project, fetches its metadata and items, and builds the board.
pub async fn fetch_board(
    client: &GithubClient,
    owner: &str,
    number: u32,
    view: Option<u32>,
) -> Result<Board> {
    let project = resolve_project(client, owner, number).await?;
    let meta = project_meta(client, &project).await?;
    let items = project_items(client, &project).await?;
    project_board(&meta, view, &items)
}

/// Decodes a captured `ProjectMeta` response body.
pub fn decode_project_meta(body: &str) -> Result<ProjectMeta> {
    let (data, _) = decode::<wire::ProjectMetaData>(body)?;
    meta_from_wire(data)
}

pub struct ItemsPage {
    pub items: Vec<Item>,
    pub next_cursor: Option<String>,
}

/// Decodes a captured `ProjectItems` response body.
pub fn decode_project_items(body: &str) -> Result<ItemsPage> {
    let (data, _) = decode::<wire::ProjectItemsData>(body)?;
    items_page_from_wire(data)
}

fn next_cursor(page_info: wire::PageInfo) -> Option<String> {
    page_info.end_cursor.filter(|_| page_info.has_next_page)
}

fn meta_from_wire(data: wire::ProjectMetaData) -> Result<ProjectMeta> {
    let p = data
        .node
        .ok_or_else(|| Error::Decode("project node is null".into()))?;
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

fn items_page_from_wire(data: wire::ProjectItemsData) -> Result<ItemsPage> {
    let project = data
        .node
        .ok_or_else(|| Error::Decode("project node is null".into()))?;
    let page = project.items;
    Ok(ItemsPage {
        items: page
            .nodes
            .into_iter()
            .flatten()
            .map(item_from_wire)
            .collect(),
        next_cursor: next_cursor(page.page_info),
    })
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
