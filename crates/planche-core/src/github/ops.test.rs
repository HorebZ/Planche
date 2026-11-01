use crate::github::fixtures::{ITEM_PAGES, PROJECT_META};
use crate::github::ops::{decode_project_items, decode_project_meta};
use serde_json::{Value, json};

#[tokio::test]
async fn independent_issue_load_checks_identity_and_paginates_both_connections() {
    use super::{issue_from_wire, load_issue};
    use crate::domain::{ContentId, ItemContent, UserId};

    let mut base: Value = serde_json::from_str(ITEM_PAGES[0]).unwrap();
    let mut node = base["data"]["node"]["items"]["nodes"][0]["content"].take();
    node["body"] = json!("Shared body");
    for permission in [
        "viewerCanAssign",
        "viewerCanClose",
        "viewerCanReopen",
        "viewerCanLabel",
        "viewerCanUpdate",
        "viewerCanDelete",
    ] {
        node[permission] = json!(true);
    }
    let content = ContentId(node["id"].as_str().unwrap().into());
    let account = UserId("A".into());
    let mut requests = Vec::new();
    let result = load_issue(&account, &content, |users_after, labels_after| {
        let page = requests.len();
        requests.push((users_after, labels_after));
        let mut node = node.clone();
        node["assignees"] = json!({ "nodes": [{ "id": format!("U_{page}"), "login": format!("user{page}"), "avatarUrl": "https://github.com/avatar" }], "pageInfo": { "hasNextPage": page != 1, "endCursor": "users-next" } });
        node["labels"] = json!({ "nodes": [{ "name": format!("label{page}"), "color": "ffffff" }], "pageInfo": { "hasNextPage": page < 2, "endCursor": format!("labels-{}", page + 1) } });

        std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": node })).unwrap()))
    }).await.unwrap().unwrap();
    let ItemContent::Issue {
        assignees, labels, ..
    } = result.0.content
    else {
        panic!("issue");
    };

    assert_eq!(
        assignees
            .iter()
            .map(|user| user.login.as_str())
            .collect::<Vec<_>>(),
        ["user0", "user1"]
    );
    assert_eq!(
        labels
            .iter()
            .map(|label| label.name.as_str())
            .collect::<Vec<_>>(),
        ["label0", "label1", "label2"]
    );
    assert_eq!(
        requests,
        [
            (None, None),
            (Some("users-next".into()), Some("labels-1".into())),
            (None, Some("labels-2".into()))
        ]
    );
    assert_eq!(result.1, "Shared body");
    assert!(result.0.permissions.unwrap().delete);

    let data = || serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": node })).unwrap();

    assert!(issue_from_wire(data(), &UserId("B".into()), &content).is_err());
    assert!(
        issue_from_wire(data(), &account, &ContentId("other".into()))
            .unwrap()
            .is_none()
    );
    node["__typename"] = json!("PullRequest");
    let wrong_type =
        serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": node })).unwrap();

    assert!(
        issue_from_wire(wrong_type, &account, &content)
            .unwrap()
            .is_none()
    );
}

#[test]
fn every_fixture_decodes() {
    let meta = decode_project_meta(PROJECT_META).unwrap();

    assert_eq!(meta.title, "Planche");
    assert!(
        meta.fields
            .iter()
            .any(|f| f.name == "Status" && f.options.is_some())
    );

    let page1 = decode_project_items(ITEM_PAGES[0]).unwrap();
    let page2 = decode_project_items(ITEM_PAGES[1]).unwrap();

    assert!(page1.next_cursor.is_some());
    assert!(page2.next_cursor.is_none());
    assert!(!page1.items.is_empty() && !page2.items.is_empty());
}

#[test]
fn issue_relations_decode_and_survive_the_offline_cache() {
    use crate::cache::Cache;
    use crate::domain::{ItemContent, PullRequestState};

    let meta = decode_project_meta(PROJECT_META).unwrap();
    let page = decode_project_items(ITEM_PAGES[0]).unwrap();

    let ItemContent::Issue { details, .. } = &page.items[0].content else {
        panic!("expected an issue");
    };

    assert_eq!(details.created_at.as_deref(), Some("2026-10-02T12:00:00Z"));
    assert_eq!(details.parent_title.as_deref(), Some("Parent roadmap"));

    let sub_issues = details.sub_issues.as_ref().unwrap();

    assert_eq!((sub_issues.completed, sub_issues.total), (2, 5));
    assert_eq!((details.blocked_by, details.blocking), (2, 1));
    assert_eq!(details.pull_request_count, 1);

    let pr = details.pull_request.as_ref().unwrap();

    assert_eq!(
        (pr.number, pr.state, pr.is_draft),
        (42, PullRequestState::Merged, false)
    );

    let mut cache = Cache::open(":memory:").unwrap();

    cache.write_snapshot(&meta, &page.items, true).unwrap();

    assert_eq!(cache.snapshot(&meta.id).unwrap().unwrap().1, page.items);
}

#[test]
fn multiple_linked_prs_use_the_total_count_and_empty_sub_issues_are_omitted() {
    use crate::domain::ItemContent;

    let mut page: Value = serde_json::from_str(ITEM_PAGES[0]).unwrap();
    let content = &mut page["data"]["node"]["items"]["nodes"][0]["content"];

    content["closedByPullRequestsReferences"]["totalCount"] = json!(3);
    content["subIssuesSummary"] = json!({ "completed": 0, "total": 0 });

    let decoded = decode_project_items(&page.to_string()).unwrap();

    let ItemContent::Issue { details, .. } = &decoded.items[0].content else {
        panic!("expected an issue");
    };

    assert_eq!(details.pull_request_count, 3);
    assert!(details.pull_request.is_none());
    assert!(details.sub_issues.is_none());
}

#[test]
fn unknown_field_value_typename_is_ignored() {
    let mut page: Value = serde_json::from_str(ITEM_PAGES[0]).unwrap();
    let values = page["data"]["node"]["items"]["nodes"][0]["fieldValues"]["nodes"]
        .as_array_mut()
        .unwrap();

    values.push(json!({ "__typename": "ProjectV2ItemFieldFromTheFuture", "whatever": 1 }));

    let decoded = decode_project_items(&page.to_string()).unwrap();

    assert!(!decoded.items[0].single_selects.is_empty());
}
#[test]
fn description_checks_viewer_content_id_and_node_type() {
    let decode = |viewer: &str, id: &str, kind: &str| {
        let data = serde_json::from_value(serde_json::json!({"viewer": {"id": viewer}, "node": {"id": id, "__typename": kind, "body": "body"}})).unwrap();

        super::description_from_wire(
            data,
            &crate::domain::UserId("viewer".into()),
            &crate::domain::ContentId("issue".into()),
        )
    };

    assert_eq!(
        decode("viewer", "issue", "Issue").unwrap().as_deref(),
        Some("body")
    );
    assert!(matches!(
        decode("other", "issue", "Issue"),
        Err(crate::Error::Unauthorized)
    ));
    assert!(decode("viewer", "wrong", "Issue").unwrap().is_none());
    assert!(decode("viewer", "issue", "PullRequest").unwrap().is_none());
}
