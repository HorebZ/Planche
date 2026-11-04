use super::*;

#[tokio::test]
async fn reconciliation_paginates_and_requires_the_same_viewer_and_exact_marker() {
    let marker = comment_marker("request-1");
    let page = |body: String, authored: bool, previous: bool| -> wire::IssueData {
        serde_json::from_value(json!({ "viewer": { "id": "A" }, "node": {
            "__typename": "Issue", "id": "I_1", "comments": {
                "pageInfo": { "hasPreviousPage": previous, "startCursor": "older" },
                "nodes": [{ "id": "IC_1", "body": body, "createdAt": "2026-11-04T12:00:00Z", "author": { "login": "lea" }, "viewerDidAuthor": authored, "isMinimized": false }]
            }
        }})).unwrap()
    };
    let mut requests = vec![];

    let entry = load_comment(
        &UserId("A".into()),
        &ContentId("I_1".into()),
        "request-1",
        |before| {
            requests.push(before);
            std::future::ready(Ok(page(
                format!("Saved text\n\n{marker}"),
                requests.len() == 2,
                requests.len() == 1,
            )))
        },
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(requests, [None, Some("older".into())]);
    assert_eq!(entry.id, "IC_1");
    assert_eq!(entry.author.as_deref(), Some("lea"));
    let missing = load_comment(
        &UserId("A".into()),
        &ContentId("I_1".into()),
        "request-1",
        |_| std::future::ready(Ok(page(format!("{marker}\nUnrelated text"), true, false))),
    )
    .await
    .unwrap();

    assert!(missing.is_none());
}

#[tokio::test]
async fn reconciliation_never_treats_inaccessible_or_incomplete_data_as_absence() {
    let account = UserId("A".into());
    let content = ContentId("I_1".into());
    for data in [
        json!({ "viewer": { "id": "B" }, "node": null }),
        json!({ "viewer": { "id": "A" }, "node": null }),
        json!({ "viewer": { "id": "A" }, "node": { "__typename": "Issue", "id": "wrong" } }),
        json!({ "viewer": { "id": "A" }, "node": { "__typename": "Issue", "id": "I_1", "comments": { "pageInfo": { "hasPreviousPage": true, "startCursor": null }, "nodes": [] } } }),
        json!({ "viewer": { "id": "A" }, "node": { "__typename": "Issue", "id": "I_1", "comments": { "pageInfo": { "hasPreviousPage": true, "startCursor": "repeated" }, "nodes": [] } } }),
    ] {
        let result = load_comment(&account, &content, "request-1", |_| {
            std::future::ready(Ok(serde_json::from_value(data.clone()).unwrap()))
        })
        .await;

        assert!(result.is_err());
    }
}
