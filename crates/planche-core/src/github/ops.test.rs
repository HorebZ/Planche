use crate::github::fixtures::{ITEM_PAGES, PROJECT_META};
use crate::github::ops::{decode_project_items, decode_project_meta};
use serde_json::{Value, json};

#[test]
fn issue_references_only_resolve_accessible_issues_for_the_current_viewer() {
    use super::reference_from_wire;
    use crate::Error;
    use crate::domain::{ContentId, UserId};

    let account = UserId("viewer".into());
    let data = |viewer: &str, node: Value| {
        serde_json::from_value(json!({ "viewer": { "id": viewer }, "node": node })).unwrap()
    };
    let issue = json!({ "__typename": "Issue", "id": "I_linked" });

    assert_eq!(
        reference_from_wire(data("viewer", issue.clone()), &account).unwrap(),
        Some(ContentId("I_linked".into()))
    );
    assert!(matches!(
        reference_from_wire(data("other", issue), &account),
        Err(Error::Unauthorized)
    ));
    assert_eq!(
        reference_from_wire(data("viewer", Value::Null), &account).unwrap(),
        None
    );
    assert_eq!(
        reference_from_wire(
            data("viewer", json!({ "__typename": "PullRequest" })),
            &account
        )
        .unwrap(),
        None
    );
    assert!(
        reference_from_wire(
            data("viewer", json!({ "__typename": "Issue", "id": "" })),
            &account
        )
        .is_err()
    );
}

#[tokio::test]
async fn invalid_issue_references_never_reach_github() {
    let client = super::GithubClient::new("unused").unwrap();
    let account = crate::domain::UserId("viewer".into());

    for url in [
        "http://github.com/owner/repo/issues/1",
        "https://example.com/owner/repo/issues/1",
        "https://github.com@evil.example/owner/repo/issues/1",
        "https://user@github.com/owner/repo/issues/1",
        "https://github.com:444/owner/repo/issues/1",
        "https://github.com/owner/repo/pull/1",
        "https://github.com/owner/repo/issues/0",
        "https://github.com/owner/repo/issues/abc",
        "https://github.com/owner/repo/issues/1/extra",
    ] {
        assert!(
            super::issue_reference(&client, &account, url)
                .await
                .is_err(),
            "{url}"
        );
    }
}

#[tokio::test]
async fn activity_paginates_independently_without_duplicates_and_keeps_every_pr_state() {
    use crate::domain::{ActivityKind, ContentId, PullRequestState, UserId};

    let mut requests = Vec::new();
    let activity = super::load_activity(&UserId("A".into()), &ContentId("issue".into()), |timeline_after, prs_after, timeline, prs| {
        let page = requests.len();
        requests.push((timeline_after, prs_after, timeline, prs));
        let mut node = json!({ "__typename": "Issue", "id": "issue", "createdAt": "2026-11-03T09:00:00Z", "author": { "login": "lea" } });

        if timeline {
            let mut entries = vec![json!({ "__typename": "IssueComment", "id": "comment", "createdAt": "2026-11-03T10:00:00Z", "author": null, "body": "Text", "isMinimized": false }), Value::Null];
            if page == 1 {
                for (index, kind) in ["ClosedEvent", "ReopenedEvent", "AssignedEvent", "UnassignedEvent", "LabeledEvent", "UnlabeledEvent", "CommentDeletedEvent"].into_iter().enumerate() {
                    entries.push(json!({ "__typename": kind, "id": format!("event-{index}"), "createdAt": "2026-11-03T10:01:00Z", "actor": { "login": "lea" }, "assignee": { "login": "camille" }, "label": { "name": "bug" } }));
                }
                entries.push(json!({ "__typename": "IssueComment", "id": "hidden", "createdAt": "2026-11-03T10:02:00Z", "author": { "login": "bot" }, "body": "Hidden text", "isMinimized": true }));
            }
            node["timelineItems"] = json!({ "nodes": entries, "pageInfo": { "hasNextPage": page == 0, "endCursor": "timeline-1" } });
        }
        if prs {
            node["closedByPullRequestsReferences"] = json!({
                "nodes": [{ "id": format!("pr-{page}"), "number": page + 1, "title": "Fix", "url": "https://github.com/o/r/pull/1", "state": (["OPEN", "CLOSED", "MERGED"][page]), "isDraft": page == 0, "repository": { "nameWithOwner": "o/r" } }],
                "pageInfo": { "hasNextPage": page < 2, "endCursor": format!("prs-{page}") }
            });
        }

        std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": node })).unwrap()))
    }).await.unwrap().unwrap();

    assert_eq!(
        requests,
        [
            (None, None, true, true),
            (Some("timeline-1".into()), Some("prs-0".into()), true, true),
            (None, Some("prs-1".into()), false, true),
        ]
    );
    let (created, entries) = activity.entries.split_first().unwrap();

    assert_eq!(created.kind, ActivityKind::Created);
    assert_eq!(created.id, "issue");
    assert_eq!(created.author.as_deref(), Some("lea"));
    assert_eq!(created.created_at, "2026-11-03T09:00:00Z");
    assert_eq!(entries.len(), 9);
    assert_eq!(entries[0].kind, ActivityKind::Comment);
    assert!(entries[0].author.is_none());
    assert_eq!(entries[0].body.as_deref(), Some("Text"));
    assert_eq!(entries[1].kind, ActivityKind::Closed);
    assert_eq!(entries[2].kind, ActivityKind::Reopened);
    assert_eq!(entries[3].subject.as_deref(), Some("camille"));
    assert_eq!(entries[7].kind, ActivityKind::CommentDeleted);
    assert!(entries[8].body.is_none());
    assert_eq!(
        activity
            .pull_requests
            .iter()
            .map(|pr| pr.state)
            .collect::<Vec<_>>(),
        [
            PullRequestState::Open,
            PullRequestState::Closed,
            PullRequestState::Merged
        ]
    );
    assert_eq!(activity.pull_requests[0].repo, "o/r");
    assert!(activity.pull_requests[0].is_draft);
}

#[tokio::test]
async fn activity_keeps_creation_when_there_are_no_events_and_the_author_is_deleted() {
    use crate::domain::{ActivityKind, ContentId, UserId};

    let response = json!({
        "viewer": { "id": "A" },
        "node": {
            "__typename": "Issue", "id": "issue",
            "createdAt": "2026-11-03T09:00:00Z", "author": null,
            "timelineItems": { "nodes": [], "pageInfo": { "hasNextPage": false, "endCursor": null } },
            "closedByPullRequestsReferences": { "nodes": [], "pageInfo": { "hasNextPage": false, "endCursor": null } }
        }
    });

    let activity = super::load_activity(
        &UserId("A".into()),
        &ContentId("issue".into()),
        |_, _, _, _| std::future::ready(Ok(serde_json::from_value(response.clone()).unwrap())),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(activity.entries.len(), 1);
    assert_eq!(activity.entries[0].kind, ActivityKind::Created);
    assert!(activity.entries[0].author.is_none());
}

#[tokio::test]
async fn activity_rejects_wrong_identity_missing_pages_and_broken_pagination() {
    use crate::domain::{ContentId, UserId};

    let base = json!({ "viewer": { "id": "A" }, "node": { "__typename": "Issue", "id": "issue", "createdAt": "2026-11-03T09:00:00Z", "author": { "login": "lea" }, "timelineItems": { "nodes": [], "pageInfo": { "hasNextPage": false, "endCursor": null } }, "closedByPullRequestsReferences": { "nodes": [], "pageInfo": { "hasNextPage": false, "endCursor": null } } } });
    for change in [
        "viewer",
        "identity",
        "type",
        "missing-page",
        "missing-cursor",
        "repeated-cursor",
    ] {
        let mut response = base.clone();
        match change {
            "viewer" => response["viewer"]["id"] = json!("B"),
            "identity" => response["node"]["id"] = json!("other"),
            "type" => response["node"]["__typename"] = json!("PullRequest"),
            "missing-page" => response["node"]["timelineItems"] = Value::Null,
            "missing-cursor" => {
                response["node"]["timelineItems"]["pageInfo"]["hasNextPage"] = json!(true)
            }
            _ => {
                response["node"]["timelineItems"]["pageInfo"] =
                    json!({ "hasNextPage": true, "endCursor": "same" })
            }
        }

        let result = super::load_activity(
            &UserId("A".into()),
            &ContentId("issue".into()),
            |_, _, _, _| std::future::ready(Ok(serde_json::from_value(response.clone()).unwrap())),
        )
        .await;

        assert!(result.is_err(), "{change}");
    }

    let missing = super::load_activity(
        &UserId("A".into()),
        &ContentId("issue".into()),
        |_, _, _, _| {
            std::future::ready(Ok(serde_json::from_value(
                json!({ "viewer": { "id": "A" }, "node": null }),
            )
            .unwrap()))
        },
    )
    .await
    .unwrap();

    assert!(missing.is_none());
}

#[tokio::test]
async fn a_failed_later_activity_page_never_returns_a_partial_snapshot() {
    use crate::domain::{ContentId, UserId};

    let mut requests = 0;
    let result = super::load_activity(&UserId("A".into()), &ContentId("issue".into()), |_, _, _, _| {
        requests += 1;
        std::future::ready(if requests == 1 {
            Ok(serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": { "__typename": "Issue", "id": "issue", "createdAt": "2026-11-03T09:00:00Z", "author": { "login": "lea" }, "timelineItems": { "nodes": [], "pageInfo": { "hasNextPage": true, "endCursor": "next" } }, "closedByPullRequestsReferences": { "nodes": [], "pageInfo": { "hasNextPage": false, "endCursor": null } } } })).unwrap())
        } else { Err(crate::Error::Network("offline".into())) })
    }).await;

    assert_eq!(requests, 2);
    assert!(matches!(result, Err(crate::Error::Network(_))));
}

#[tokio::test]
async fn independent_issue_load_checks_identity_and_paginates_both_connections() {
    use super::{issue_from_wire, load_issue};
    use crate::domain::{ContentId, ItemContent, UserId};

    let mut base: Value = serde_json::from_str(ITEM_PAGES[0]).unwrap();
    let mut node = base["data"]["node"]["items"]["nodes"][0]["content"].take();
    node["body"] = json!("Shared body");
    node["viewerCanReact"] = json!(true);
    node["locked"] = json!(false);
    node["commentRepository"] = json!({ "isArchived": false, "isDisabled": false });
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
    for restriction in ["locked", "archived", "disabled", "interaction"] {
        let mut restricted = node.clone();
        restricted["assignees"]["pageInfo"] = json!({ "hasNextPage": false, "endCursor": null });
        restricted["labels"]["pageInfo"] = json!({ "hasNextPage": false, "endCursor": null });
        match restriction {
            "locked" => restricted["locked"] = json!(true),
            "archived" => restricted["commentRepository"]["isArchived"] = json!(true),
            "disabled" => restricted["commentRepository"]["isDisabled"] = json!(true),
            _ => restricted["viewerCanReact"] = json!(false),
        }
        let (issue, _) = load_issue(&account, &content, |_, _| {
            std::future::ready(Ok(serde_json::from_value(
                json!({ "viewer": { "id": "A" }, "node": restricted }),
            )
            .unwrap()))
        })
        .await
        .unwrap()
        .unwrap();

        assert!(!issue.permissions.unwrap().comment, "{restriction}");
    }

    let mut requests = Vec::new();
    let result = load_issue(&account, &content, |users_after, labels_after| {
        let page = requests.len();
        requests.push((users_after, labels_after));
        let mut node = node.clone();
        node["assignees"] = json!({ "nodes": [{ "id": format!("U_{page}"), "login": format!("user{page}"), "avatarUrl": "https://github.com/avatar" }], "pageInfo": { "hasNextPage": page != 1, "endCursor": "users-next" } });
        node["labels"] = json!({ "nodes": [{ "name": format!("label{page}"), "color": "ffffff" }], "pageInfo": { "hasNextPage": page < 2, "endCursor": format!("labels-{}", page + 1) } });

        std::future::ready(Ok(serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": node })).unwrap()))
    }).await.unwrap().unwrap();
    assert!(result.0.permissions.as_ref().unwrap().comment);

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
    content["closedByPullRequestsReferences"]["nodes"][0]["isDraft"] = json!(true);
    content["subIssuesSummary"] = json!({ "completed": 0, "total": 0 });

    let decoded = decode_project_items(&page.to_string()).unwrap();

    let ItemContent::Issue { details, .. } = &decoded.items[0].content else {
        panic!("expected an issue");
    };

    assert_eq!(details.pull_request_count, 3);
    assert!(details.has_draft_pull_request);
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

#[test]
fn app_discovery_only_lists_active_organization_installations() {
    let reply = serde_json::from_value(serde_json::json!({"installations": [
        {"account": {"login": "my-user", "type": "User"}, "suspended_at": null},
        {"account": {"login": "approved-org", "type": "Organization"}, "suspended_at": null},
        {"account": {"login": "suspended-org", "type": "Organization"}, "suspended_at": "2026-11-01"}
    ]})).unwrap();

    assert_eq!(super::installation_organizations(reply), ["approved-org"]);
}
