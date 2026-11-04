use super::*;
use crate::domain::RepositoryIssueState;
use std::cell::RefCell;

fn response(label: Option<String>, after: Option<String>) -> wire::IssueData {
    let number = if after.is_some() {
        1
    } else if label.as_deref() == Some("bug") {
        3
    } else {
        2
    };
    serde_json::from_value(json!({ "viewer": { "id": "U1" }, "node": {
        "__typename": "Repository", "id": "R1", "issues": {
            "pageInfo": { "hasNextPage": after.is_none(), "endCursor": "next" },
            "nodes": [{ "__typename": "Issue", "id": format!("I{number}"), "number": number, "title": "Issue", "url": "https://github.com/o/r/issues/1", "issueState": "OPEN", "repository": { "nameWithOwner": "o/r" }, "assignees": { "nodes": [] }, "labels": { "nodes": [] } }]
        }
    }})).unwrap()
}

#[tokio::test]
async fn label_streams_are_unioned_paginated_and_deduplicated_without_search() {
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::All,
        milestone: Some(42),
        labels: vec!["help".into(), "bug".into(), "bug".into()],
    };
    let calls = RefCell::new(vec![]);
    let fetch = |label: Option<String>, after: Option<String>| {
        calls.borrow_mut().push((label.clone(), after.clone()));
        std::future::ready(Ok(response(label, after)))
    };
    let first = load_issues(&UserId("U1".into()), "R1", &filter, None, fetch)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(first.issues.len(), 2);
    assert!(!first.complete);
    assert_eq!(calls.borrow().len(), 2);
    let second = load_issues(
        &UserId("U1".into()),
        "R1",
        &filter,
        first.next_cursor.as_deref(),
        fetch,
    )
    .await
    .unwrap()
    .unwrap();
    assert!(second.complete);
    assert_eq!(second.issues.len(), 1);
    assert!(second.next_cursor.is_none());
    assert!(
        calls.borrow()[2..]
            .iter()
            .all(|(_, after)| after.as_deref() == Some("next"))
    );

    let other_filter = RepositoryIssueFilter {
        milestone: None,
        ..filter
    };
    assert!(
        load_issues(
            &UserId("U1".into()),
            "R1",
            &other_filter,
            first.next_cursor.as_deref(),
            fetch
        )
        .await
        .is_err()
    );
    assert!(
        load_issues(&UserId("U2".into()), "R1", &other_filter, None, fetch)
            .await
            .is_err()
    );
    assert!(
        load_issues(&UserId("U1".into()), "R2", &other_filter, None, fetch)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn null_and_non_issue_nodes_and_broken_cursors_are_not_treated_as_complete_pages() {
    let filter = RepositoryIssueFilter {
        state: RepositoryIssueState::Open,
        milestone: None,
        labels: vec![],
    };
    for change in ["pr", "cursor", "node"] {
        let result = load_issues(&UserId("U1".into()), "R1", &filter, None, |_, _| async {
            let mut data = response(None, None);
            if change == "pr" {
                data.node.as_mut().unwrap()["issues"]["nodes"][0]["__typename"] =
                    json!("DraftIssue");
            }
            if change == "cursor" {
                data.node.as_mut().unwrap()["issues"]["pageInfo"]["endCursor"] = json!(null);
            }
            if change == "node" {
                data.node = None;
            }
            Ok(data)
        })
        .await;
        if change == "node" {
            assert!(result.unwrap().is_none());
        } else {
            assert!(result.is_err());
        }
    }
}

#[tokio::test]
async fn filter_options_finish_both_connections_and_detect_cursor_loops() {
    let calls = RefCell::new(vec![]);
    let fetch = |labels_after: Option<String>,
                 milestones_after: Option<String>,
                 labels: bool,
                 milestones: bool| {
        calls.borrow_mut().push((
            labels_after.clone(),
            milestones_after.clone(),
            labels,
            milestones,
        ));
        std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": "U1" }, "node": {
            "id": "R1", "__typename": "Repository",
            "labels": if labels { json!({ "pageInfo": { "hasNextPage": labels_after.is_none(), "endCursor": "labels2" }, "nodes": [{ "name": if labels_after.is_some() { "help" } else { "bug" }, "color": "abcdef" }] }) } else { json!(null) },
            "milestones": if milestones { json!({ "pageInfo": { "hasNextPage": false }, "nodes": [{ "number": 7, "title": "v1" }] }) } else { json!(null) }
        }})).unwrap()))
    };

    let options = load_options(&UserId("U1".into()), "R1", fetch)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(options.labels.len(), 2);
    assert_eq!(options.milestones.len(), 1);
    assert_eq!(
        calls.borrow()[1],
        (Some("labels2".into()), None, true, false)
    );

    let result = load_options(&UserId("U1".into()), "R1", |_, _, _, _| async {
        let mut data = response(None, None);
        data.node = Some(json!({ "id": "R1", "__typename": "Repository", "labels": { "pageInfo": { "hasNextPage": true, "endCursor": "same" }, "nodes": [] }, "milestones": { "pageInfo": { "hasNextPage": false }, "nodes": [] } }));
        Ok(data)
    }).await;
    assert!(result.is_err());
}
