use super::*;
use crate::issue::comment_marker;

pub async fn find_comment(
    client: &GithubClient,
    account: &UserId,
    content: &ContentId,
    request: &str,
) -> Result<Option<ActivityEntry>> {
    load_comment(account, content, request, |before| async move {
        Ok(client
            .query::<wire::IssueData>(
                include_str!("../../graphql/issue_comments.graphql"),
                "IssueComments",
                json!({ "id": content, "before": before }),
            )
            .await?
            .data)
    })
    .await
}

async fn load_comment<F: std::future::Future<Output = Result<wire::IssueData>>>(
    account: &UserId,
    content: &ContentId,
    request: &str,
    mut fetch: impl FnMut(Option<String>) -> F,
) -> Result<Option<ActivityEntry>> {
    let marker = comment_marker(request);
    let mut before = None;
    let mut cursors = HashSet::new();

    loop {
        let data = fetch(before).await?;

        if data.viewer.id != account.as_str() {
            return Err(Error::Unauthorized);
        }

        let node = data.node.ok_or(Error::Http(404))?;

        if node["__typename"] != "Issue" || node["id"] != content.as_str() {
            return Err(Error::Decode(
                "comment issue identity does not match the request".into(),
            ));
        }

        let node: wire::CommentNode =
            serde_json::from_value(node).map_err(|error| Error::Decode(error.to_string()))?;

        for comment in node.comments.nodes.into_iter().flatten() {
            if comment.viewer_did_author && comment.body.ends_with(&marker) {
                return Ok(Some(comment_entry(comment)));
            }
        }

        if !node.comments.page_info.has_previous_page {
            return Ok(None);
        }

        let cursor = node
            .comments
            .page_info
            .start_cursor
            .filter(|cursor| !cursor.is_empty() && cursors.insert(cursor.clone()))
            .ok_or_else(|| Error::Decode("missing or repeated comment pagination cursor".into()))?;
        before = Some(cursor);
    }
}

pub async fn post_comment(
    client: &GithubClient,
    content: &ContentId,
    request: &str,
    body: &str,
) -> Result<ActivityEntry> {
    let reply = client.query::<wire::AddCommentData>(include_str!("../../graphql/add_comment.graphql"), "AddComment", json!({ "id": content, "body": format!("{body}\n\n{}", comment_marker(request)), "request": request })).await?.data.add_comment;

    if reply.client_mutation_id.as_deref() != Some(request) {
        return Err(Error::Decode(
            "comment receipt does not match the request".into(),
        ));
    }

    let comment = reply
        .comment_edge
        .ok_or_else(|| Error::Decode("comment receipt is missing".into()))?
        .node;

    if !comment.viewer_did_author {
        return Err(Error::Unauthorized);
    }

    Ok(comment_entry(comment))
}

fn comment_entry(comment: wire::Comment) -> ActivityEntry {
    ActivityEntry {
        id: comment.id,
        kind: ActivityKind::Comment,
        author: comment.author.and_then(|author| author.login),
        created_at: comment.created_at,
        body: (!comment.is_minimized).then_some(comment.body),
        subject: None,
    }
}

#[cfg(test)]
#[path = "comments.test.rs"]
mod tests;
