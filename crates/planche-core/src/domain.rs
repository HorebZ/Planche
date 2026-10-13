use serde::{Deserialize, Serialize};

macro_rules! id_type {
    ($($(#[$doc:meta])* $name:ident),+ $(,)?) => {$(
        $(#[$doc])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl From<String> for $name {
            fn from(id: String) -> Self {
                Self(id)
            }
        }
    )+};
}

id_type! {
    /// Node ID of a `ProjectV2`.
    ProjectId,
    /// Node ID of a `ProjectV2Item`, the card. Not the ID of its issue or pull request.
    ItemId,
    /// Node ID of a project field such as Status.
    FieldId,
    /// ID of a single-select option. GitHub types it `String`, not `ID`.
    OptionId,
    /// Node ID of a `ProjectV2View`.
    ViewId,
    /// Node ID of a `User`.
    UserId,
    /// Node ID of the item content, an `Issue`, `PullRequest` or `DraftIssue`.
    ContentId,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_id_serializes_as_bare_string() {
        let id = ItemId("PVTI_lADOAq5TD84Bm1t2zgXyZ".into());
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, r#""PVTI_lADOAq5TD84Bm1t2zgXyZ""#);
        assert_eq!(serde_json::from_str::<ItemId>(&json).unwrap(), id);
    }
}
