use crate::domain::RepositorySummary;

pub(crate) fn repository() -> RepositorySummary {
    RepositorySummary {
        id: "R_planche".into(),
        full_name: "HorebZ/Planche".into(),
        url: "https://github.com/HorebZ/Planche".into(),
        owner_is_org: false,
        has_issues: true,
        archived: false,
    }
}
