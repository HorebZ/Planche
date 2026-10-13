use crate::domain::Viewer;
use crate::error::{Error, Result};
use crate::github::{GithubClient, ops};

const KEYCHAIN_SERVICE: &str = "dev.planche.app";
const KEYCHAIN_ACCOUNT: &str = "github-token";

pub const REQUIRED_SCOPES: [&str; 3] = ["repo", "read:org", "project"];

/// The token from `PLANCHE_TOKEN`, else from the macOS keychain.
pub fn load_token() -> Result<String> {
    if let Some(token) = std::env::var("PLANCHE_TOKEN")
        .ok()
        .filter(|t| !t.trim().is_empty())
    {
        return Ok(token.trim().to_owned());
    }
    match entry()?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err(Error::NotSignedIn),
        Err(e) => Err(Error::Keychain(e.to_string())),
    }
}

/// Checks the token against GitHub and its scopes, then stores it in the keychain.
/// The keychain is left untouched when any check fails.
pub async fn login(token: &str) -> Result<Viewer> {
    let token = token.trim();
    let client = GithubClient::new(token)?;
    let (viewer, scopes) = ops::viewer(&client).await?;
    if token.starts_with("github_pat_") {
        return Err(Error::ClassicTokenRequired);
    }
    let missing = missing_scopes(scopes.as_deref())?;
    if !missing.is_empty() {
        return Err(Error::MissingScopes(missing));
    }
    entry()?
        .set_password(token)
        .map_err(|e| Error::Keychain(e.to_string()))?;
    Ok(viewer)
}

/// Required scopes absent from an `x-oauth-scopes` header. A missing header means a
/// fine-grained token, which Planche refuses.
pub fn missing_scopes(header: Option<&str>) -> Result<Vec<String>> {
    let header = header.ok_or(Error::ClassicTokenRequired)?;
    let granted: Vec<&str> = header
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let covers = |required: &str| {
        granted.iter().any(|&scope| match required {
            "read:org" => matches!(scope, "read:org" | "write:org" | "admin:org"),
            other => scope == other,
        })
    };
    Ok(REQUIRED_SCOPES
        .iter()
        .filter(|required| !covers(required))
        .map(|s| (*s).to_owned())
        .collect())
}

fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|e| Error::Keychain(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_missing_scopes_names_each_absent_scope() {
        assert_eq!(missing_scopes(Some("repo, read:org")).unwrap(), ["project"]);
        assert_eq!(missing_scopes(Some("gist")).unwrap(), REQUIRED_SCOPES);
        assert!(
            missing_scopes(Some("repo, admin:org, project, workflow"))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn auth_absent_scopes_header_requires_a_classic_token() {
        assert!(matches!(
            missing_scopes(None),
            Err(Error::ClassicTokenRequired)
        ));
    }
}
