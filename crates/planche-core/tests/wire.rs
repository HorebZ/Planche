use planche_core::github::ops::{decode_project_items, decode_project_meta};
use serde_json::{Value, json};

fn fixture(name: &str) -> String {
    let path = format!("{}/../../fixtures/{name}", env!("CARGO_MANIFEST_DIR"));

    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"))
}

#[test]
fn every_fixture_decodes() {
    let meta = decode_project_meta(&fixture("project_meta.json")).unwrap();

    assert_eq!(meta.title, "Planche");
    assert!(
        meta.fields
            .iter()
            .any(|f| f.name == "Status" && f.options.is_some())
    );

    let page1 = decode_project_items(&fixture("project_items_page1.json")).unwrap();
    let page2 = decode_project_items(&fixture("project_items_page2.json")).unwrap();

    assert!(page1.next_cursor.is_some());
    assert!(page2.next_cursor.is_none());
    assert!(!page1.items.is_empty() && !page2.items.is_empty());
}

#[test]
fn issue_relations_decode_and_survive_the_offline_cache() {
    use planche_core::cache::Cache;
    use planche_core::domain::{ItemContent, PullRequestState};

    let meta = decode_project_meta(&fixture("project_meta.json")).unwrap();
    let page = decode_project_items(&fixture("project_items_page1.json")).unwrap();

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
    use planche_core::domain::ItemContent;

    let mut page: Value = serde_json::from_str(&fixture("project_items_page1.json")).unwrap();
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
    let mut page: Value = serde_json::from_str(&fixture("project_items_page1.json")).unwrap();
    let values = page["data"]["node"]["items"]["nodes"][0]["fieldValues"]["nodes"]
        .as_array_mut()
        .unwrap();

    values.push(json!({ "__typename": "ProjectV2ItemFieldFromTheFuture", "whatever": 1 }));

    let decoded = decode_project_items(&page.to_string()).unwrap();

    assert!(!decoded.items[0].single_selects.is_empty());
}
