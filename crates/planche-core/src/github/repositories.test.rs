use super::*;

#[test]
fn repository_metadata_never_exposes_a_foreign_url_or_an_unknown_owner() {
    let base = json!({ "id": "R1", "nameWithOwner": "owner/repo", "url": "https://github.com/owner/repo", "hasIssuesEnabled": true, "isArchived": false, "owner": { "__typename": "User" } });
    assert!(repository_from_wire(serde_json::from_value(base.clone()).unwrap()).is_ok());

    for change in ["url", "name", "id", "owner"] {
        let mut data = base.clone();
        match change {
            "url" => data["url"] = json!("https://example.com/owner/repo"),
            "name" => data["nameWithOwner"] = json!("owner/../repo"),
            "id" => data["id"] = json!(""),
            _ => data["owner"]["__typename"] = json!("Unknown"),
        }

        assert!(
            repository_from_wire(serde_json::from_value(data).unwrap()).is_err(),
            "{change}"
        );
    }
}

#[tokio::test]
async fn catalog_search_skips_nonmatching_pages_and_keeps_the_next_source_cursor() {
    let mut requests = vec![];
    let result = load_catalog(&UserId("A".into()), RepositorySource::Personal, "TARGET", None, |after| {
        requests.push(after);
        let page = requests.len();
        std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": "A", "repositories": {
            "pageInfo": { "hasNextPage": true, "endCursor": format!("page-{page}") },
            "nodes": [{ "id": format!("R{page}"), "nameWithOwner": if page == 1 { "org/target" } else { "user/target" }, "url": if page == 1 { "https://github.com/org/target" } else { "https://github.com/user/target" }, "hasIssuesEnabled": false, "isArchived": false, "owner": { "__typename": if page == 1 { "Organization" } else { "User" } } }]
        } } })).unwrap()))
    }).await.unwrap();

    assert_eq!(requests, [None, Some("page-1".into())]);
    assert_eq!(result.next_cursor.as_deref(), Some("page-2"));
    assert_eq!(result.repositories.len(), 1);
    assert_eq!(result.repositories[0].full_name, "user/target");
    assert!(!result.repositories[0].has_issues);
}

#[tokio::test]
async fn catalog_rejects_a_wrong_viewer_and_incomplete_or_repeated_cursors() {
    for (viewer, cursor) in [
        ("B", Some("next")),
        ("A", None),
        ("A", Some("")),
        ("A", Some("repeated")),
    ] {
        let result = load_catalog(&UserId("A".into()), RepositorySource::Personal, "", Some("repeated".into()), |_| std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": viewer, "repositories": { "pageInfo": { "hasNextPage": true, "endCursor": cursor }, "nodes": [] } } })).unwrap()))).await;

        assert!(result.is_err());
    }
    let empty = load_catalog(&UserId("A".into()), RepositorySource::Organizations, "nothing", None, |_| std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": "A", "repositories": { "pageInfo": { "hasNextPage": false, "endCursor": null }, "nodes": [] } } })).unwrap()))).await.unwrap();

    assert!(empty.repositories.is_empty());
    assert!(empty.next_cursor.is_none());
}
