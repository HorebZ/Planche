use super::*;

fn personal(app: bool) -> GithubClient {
    let mut client = GithubClient::new("gho_personal").unwrap();
    client.restricted_oauth = true;
    client.app_token = app.then(|| "ghu_organization".into());

    client
}

#[test]
fn projects_and_issue_operations_use_their_own_connection_without_a_pat_fallback() {
    let client = personal(true);
    for operation in [
        "ProjectBoard",
        "ProjectMeta",
        "ProjectItems",
        "SetSingleSelect",
        "ArchiveItem",
        "SetDraftAssignees",
    ] {
        assert_eq!(client.operation_token(operation).unwrap(), "gho_personal");
    }
    for operation in [
        "Issue",
        "IssueDescription",
        "IssueActivity",
        "IssueComments",
        "AddComment",
        "AssignableUsers",
        "AddAssignees",
        "RemoveAssignees",
    ] {
        assert_eq!(
            client.operation_token(operation).unwrap(),
            "ghu_organization"
        );
    }

    assert_eq!(
        client.project_client(true).unwrap().token,
        "ghu_organization"
    );
    assert_eq!(client.project_client(false).unwrap().token, "gho_personal");
}

#[test]
fn oauth_alone_reads_public_issues_but_cannot_write_issues_or_open_organization_projects() {
    let client = personal(false);
    assert_eq!(client.operation_token("Issue").unwrap(), "gho_personal");
    assert!(!client.can_write_issues());
    assert!(client.operation_token("AddAssignees").is_err());
    assert!(client.operation_token("RemoveAssignees").is_err());
    assert!(client.operation_token("AddComment").is_err());
    assert!(client.project_client(true).is_err());
    assert_eq!(client.project_client(false).unwrap().token, "gho_personal");
}

#[tokio::test]
async fn repository_metadata_uses_the_app_for_known_organizations_and_allows_public_oauth_without_it()
 {
    let mut client = GithubClient::new("gho_personal").unwrap();
    client.restricted_oauth = true;

    let public = client
        .repository_metadata_client("external", Some(true))
        .await
        .unwrap();
    assert_eq!(
        public.operation_token("RepositoryByName").unwrap(),
        "gho_personal"
    );

    client.app_token = Some("ghu_organizations".into());
    let organization = client
        .repository_metadata_client("external", Some(true))
        .await
        .unwrap();
    let personal = client
        .repository_metadata_client("user", Some(false))
        .await
        .unwrap();

    assert_eq!(
        organization.operation_token("RepositoryById").unwrap(),
        "ghu_organizations"
    );
    assert_eq!(
        personal.operation_token("RepositoryByName").unwrap(),
        "gho_personal"
    );
}

#[test]
fn pat_mode_keeps_one_explicit_credential_for_every_operation() {
    let client = GithubClient::new("ghp_classic").unwrap();
    for operation in ["ProjectBoard", "Issue", "AddAssignees"] {
        assert_eq!(client.operation_token(operation).unwrap(), "ghp_classic");
    }
    assert_eq!(client.project_client(true).unwrap().token, "ghp_classic");
    assert!(client.organization_client().unwrap().is_none());
}

#[tokio::test]
async fn cached_owner_kinds_keep_offline_opening_independent_of_network_discovery() {
    let client = personal(true);
    let selected = client.for_owner("cached-user", Some(false)).await.unwrap();
    assert!(selected.restricted_oauth());
    assert_eq!(
        selected.operation_token("Issue").unwrap(),
        "ghu_organization"
    );
    assert_eq!(
        client
            .for_owner("cached-org", Some(true))
            .await
            .unwrap()
            .token,
        "ghu_organization"
    );
    assert!(
        personal(false)
            .for_owner("cached-org", Some(true))
            .await
            .is_err()
    );
}
