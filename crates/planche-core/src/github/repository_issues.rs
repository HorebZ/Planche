use super::*;
use crate::domain::{
    RepositoryIssueFilter, RepositoryIssueOptions, RepositoryIssueState, RepositoryIssues,
};
use serde::{Deserialize, Serialize};

const DOCUMENT: &str = include_str!("../../graphql/repository_issues.graphql");

#[derive(Serialize, Deserialize)]
struct Cursor {
    repository: String,
    filter: RepositoryIssueFilter,
    streams: Vec<Stream>,
}

#[derive(Serialize, Deserialize)]
struct Stream {
    after: Option<String>,
    done: bool,
}

pub async fn repository_issues(
    client: &GithubClient,
    account: &UserId,
    repository: &str,
    filter: &RepositoryIssueFilter,
    after: Option<&str>,
) -> Result<Option<RepositoryIssues>> {
    load_issues(account, repository, filter, after, |label, after| async move {
        Ok(client.query::<wire::IssueData>(DOCUMENT, "RepositoryIssues", json!({
            "id": repository,
            "after": after,
            "labels": label.map(|label| vec![label]),
            "states": match filter.state { RepositoryIssueState::Open => vec!["OPEN"], RepositoryIssueState::Closed => vec!["CLOSED"], RepositoryIssueState::All => vec!["OPEN", "CLOSED"] },
            "filter": filter.milestone.map(|number| json!({ "milestoneNumber": number.to_string() })),
        })).await?.data)
    }).await
}

async fn load_issues<F: std::future::Future<Output = Result<wire::IssueData>>>(
    account: &UserId,
    repository: &str,
    filter: &RepositoryIssueFilter,
    after: Option<&str>,
    mut fetch: impl FnMut(Option<String>, Option<String>) -> F,
) -> Result<Option<RepositoryIssues>> {
    let filter = filter.normalized();
    let mut cursor = match after {
        Some(after) => serde_json::from_str::<Cursor>(after)
            .map_err(|_| Error::Decode("invalid repository issues cursor".into()))?,
        None => Cursor {
            repository: repository.into(),
            filter: filter.clone(),
            streams: (0..filter.labels.len().max(1))
                .map(|_| Stream {
                    after: None,
                    done: false,
                })
                .collect(),
        },
    };

    if cursor.repository != repository
        || cursor.filter != filter
        || cursor.streams.len() != filter.labels.len().max(1)
        || cursor.streams.iter().any(|stream| {
            !stream.done && after.is_some() && stream.after.as_ref().is_none_or(String::is_empty)
        })
    {
        return Err(Error::Decode(
            "repository cursor does not match the requested filters".into(),
        ));
    }

    let mut issues = Vec::new();
    let mut ids = HashSet::new();
    // GitHub's multi-label filter is an intersection; independent streams provide OR without search's result cap.
    for (index, stream) in cursor
        .streams
        .iter_mut()
        .enumerate()
        .filter(|(_, stream)| !stream.done)
    {
        let data = fetch(filter.labels.get(index).cloned(), stream.after.clone()).await?;
        let Some(node) = repository_node(data, account, repository)? else {
            return Ok(None);
        };
        let node: wire::RepositoryIssuesNode =
            serde_json::from_value(node).map_err(|error| Error::Decode(error.to_string()))?;
        let mut cursors = HashSet::from_iter(stream.after.iter().cloned());
        stream.after = activity_cursor(node.issues.page_info, &mut cursors)?;
        stream.done = stream.after.is_none();

        for content in node.issues.nodes.into_iter().flatten() {
            if !matches!(content, wire::Content::Issue { .. }) {
                return Err(Error::Decode(
                    "repository issues contained a non-issue".into(),
                ));
            }
            let content = content_from_wire(content);
            if let ItemContent::Issue { id, .. } = &content
                && ids.insert(id.clone())
            {
                issues.push(content);
            }
        }
    }

    let complete = cursor.streams.iter().all(|stream| stream.done);
    Ok(Some(RepositoryIssues {
        issues,
        complete,
        next_cursor: (!complete)
            .then(|| serde_json::to_string(&cursor).expect("cursor serializes")),
        fetched_at: String::new(),
    }))
}

fn repository_node(
    data: wire::IssueData,
    account: &UserId,
    repository: &str,
) -> Result<Option<serde_json::Value>> {
    if data.viewer.id != account.as_str() {
        return Err(Error::Unauthorized);
    }
    if let Some(node) = &data.node
        && (node["__typename"] != "Repository" || node["id"] != repository)
    {
        return Err(Error::Decode(
            "repository identity does not match the request".into(),
        ));
    }
    Ok(data.node)
}

pub async fn repository_issue_options(
    client: &GithubClient,
    account: &UserId,
    repository: &str,
) -> Result<Option<RepositoryIssueOptions>> {
    load_options(account, repository, |labels_after, milestones_after, labels, milestones| async move {
        Ok(client.query::<wire::IssueData>(DOCUMENT, "RepositoryIssueOptions", json!({ "id": repository, "labelsAfter": labels_after, "milestonesAfter": milestones_after, "labels": labels, "milestones": milestones })).await?.data)
    }).await
}

async fn load_options<F: std::future::Future<Output = Result<wire::IssueData>>>(
    account: &UserId,
    repository: &str,
    mut fetch: impl FnMut(Option<String>, Option<String>, bool, bool) -> F,
) -> Result<Option<RepositoryIssueOptions>> {
    let mut options = RepositoryIssueOptions {
        labels: vec![],
        milestones: vec![],
    };
    let (mut labels_after, mut milestones_after) = (None, None);
    let (mut labels, mut milestones) = (true, true);
    let (mut label_cursors, mut milestone_cursors) = (HashSet::new(), HashSet::new());

    while labels || milestones {
        let data = fetch(
            labels_after.take(),
            milestones_after.take(),
            labels,
            milestones,
        )
        .await?;
        let Some(node) = repository_node(data, account, repository)? else {
            return Ok(None);
        };
        let node: wire::RepositoryOptionsNode =
            serde_json::from_value(node).map_err(|error| Error::Decode(error.to_string()))?;

        if labels {
            let page = node
                .labels
                .ok_or_else(|| Error::Decode("missing repository labels page".into()))?;
            labels_after = activity_cursor(page.page_info, &mut label_cursors)?;
            labels = labels_after.is_some();
            options
                .labels
                .extend(page.nodes.into_iter().flatten().map(|label| Label {
                    name: label.name,
                    color: label.color,
                }));
        }
        if milestones {
            let page = node
                .milestones
                .ok_or_else(|| Error::Decode("missing repository milestones page".into()))?;
            milestones_after = activity_cursor(page.page_info, &mut milestone_cursors)?;
            milestones = milestones_after.is_some();
            options
                .milestones
                .extend(page.nodes.into_iter().flatten().map(|milestone| {
                    crate::domain::RepositoryMilestone {
                        number: milestone.number,
                        title: milestone.title,
                    }
                }));
        }
    }
    options.labels.sort_by(|a, b| a.name.cmp(&b.name));
    options.labels.dedup_by(|a, b| a.name == b.name);
    options.milestones.sort_by_key(|milestone| milestone.number);
    options
        .milestones
        .dedup_by_key(|milestone| milestone.number);
    Ok(Some(options))
}

#[cfg(test)]
#[path = "repository_issues.test.rs"]
mod tests;
