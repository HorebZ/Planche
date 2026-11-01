use crate::domain::{Issue, IssuePermissions};

pub(crate) fn issue_record() -> Issue {
    Issue {
        content: super::issue("standalone", 53, "HorebZ/Planche", "Standalone issue").content,
        complete: true,
        permissions: Some(IssuePermissions {
            assign: true,
            close: true,
            reopen: false,
            label: true,
            update: true,
            delete: false,
        }),
        fetched_at: String::new(),
    }
}
