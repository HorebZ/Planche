use super::*;
use crate::domain::{RepositoryPage, RepositorySource, RepositorySummary};
use crate::repositories::repository_reference;

pub async fn repository_catalog(
    client: &GithubClient,
    account: &UserId,
    source: RepositorySource,
    search: &str,
    after: Option<String>,
) -> Result<RepositoryPage> {
    let organization = if source == RepositorySource::Organizations && client.restricted_oauth() {
        client.organization_client()?
    } else {
        None
    };
    let client = organization.as_ref().unwrap_or(client);

    load_catalog(account, source, search, after, |after| async move {
        Ok(client
            .query::<wire::RepositoryCatalogData>(
                include_str!("../../graphql/repository_catalog.graphql"),
                "RepositoryCatalog",
                json!({ "after": after }),
            )
            .await?
            .data)
    })
    .await
}

// shortcut: search scans account pages; use owner-scoped server search if catalog latency grows.
async fn load_catalog<F: std::future::Future<Output = Result<wire::RepositoryCatalogData>>>(
    account: &UserId,
    source: RepositorySource,
    search: &str,
    mut after: Option<String>,
    mut fetch: impl FnMut(Option<String>) -> F,
) -> Result<RepositoryPage> {
    let search = search.trim().to_lowercase();
    let mut cursors = HashSet::new();
    if let Some(cursor) = &after {
        cursors.insert(cursor.clone());
    }

    loop {
        let data = fetch(after).await?;
        if data.viewer.id != account.as_str() {
            return Err(Error::Unauthorized);
        }

        let page = data.viewer.repositories;
        let repositories = page
            .nodes
            .into_iter()
            .flatten()
            .map(repository_from_wire)
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .filter(|repository| {
                repository.owner_is_org == (source == RepositorySource::Organizations)
                    && repository.full_name.to_lowercase().contains(&search)
            })
            .collect::<Vec<_>>();
        let next_cursor = if page.page_info.has_next_page {
            Some(
                page.page_info
                    .end_cursor
                    .filter(|cursor| !cursor.is_empty() && cursors.insert(cursor.clone()))
                    .ok_or_else(|| Error::Decode("missing or repeated repository cursor".into()))?,
            )
        } else {
            None
        };

        if !repositories.is_empty() || next_cursor.is_none() {
            return Ok(RepositoryPage {
                repositories,
                next_cursor,
            });
        }

        after = next_cursor;
    }
}

pub async fn repository_by_reference(
    client: &GithubClient,
    account: &UserId,
    reference: &str,
) -> Result<RepositorySummary> {
    let (owner, name) = repository_reference(reference)?;
    let client = client.repository_metadata_client(&owner, None).await?;
    let data = client
        .query::<wire::RepositoryLookupData>(
            include_str!("../../graphql/repository.graphql"),
            "RepositoryByName",
            json!({ "owner": owner, "name": name }),
        )
        .await?
        .data;

    if data.viewer.id != account.as_str() {
        return Err(Error::Unauthorized);
    }

    repository_from_wire(data.repository.ok_or_else(|| {
        Error::InvalidRepository("Repository unavailable with your current GitHub access.".into())
    })?)
}

pub async fn repository_by_id(
    client: &GithubClient,
    account: &UserId,
    repository: &RepositorySummary,
) -> Result<Option<RepositorySummary>> {
    let (owner, _) = repository_reference(&repository.full_name)?;
    let client = client
        .repository_metadata_client(&owner, Some(repository.owner_is_org))
        .await?;
    let data = client
        .query::<wire::IssueData>(
            include_str!("../../graphql/repository.graphql"),
            "RepositoryById",
            json!({ "id": repository.id }),
        )
        .await?
        .data;

    if data.viewer.id != account.as_str() {
        return Err(Error::Unauthorized);
    }
    let Some(node) = data.node else {
        return Ok(None);
    };
    if node["__typename"] != "Repository" || node["id"] != repository.id {
        return Err(Error::Decode(
            "repository identity does not match the request".into(),
        ));
    }

    repository_from_wire(
        serde_json::from_value(node).map_err(|error| Error::Decode(error.to_string()))?,
    )
    .map(Some)
}

fn repository_from_wire(repository: wire::RepositoryNode) -> Result<RepositorySummary> {
    repository_reference(&repository.name_with_owner)?;
    let owner_is_org = match repository.owner.__typename.as_str() {
        "Organization" => true,
        "User" => false,
        _ => return Err(Error::Decode("unknown repository owner type".into())),
    };
    if repository.id.is_empty()
        || repository.url != format!("https://github.com/{}", repository.name_with_owner)
    {
        return Err(Error::Decode("invalid repository identity or URL".into()));
    }

    Ok(RepositorySummary {
        id: repository.id,
        full_name: repository.name_with_owner,
        url: repository.url,
        owner_is_org,
        has_issues: repository.has_issues_enabled,
        archived: repository.is_archived,
    })
}

#[cfg(test)]
#[path = "repositories.test.rs"]
mod tests;
