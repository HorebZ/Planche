use crate::domain::{Card, ContentId, IssueState, ItemContent, ItemId};

pub(crate) fn issue(item: &str, number: u32, repo: &str, title: &str) -> Card {
    Card {
        item_id: ItemId(item.into()),
        position: 0,
        content: ItemContent::Issue {
            id: ContentId(format!("I_{item}")),
            number,
            title: title.into(),
            url: format!("https://github.com/{repo}/issues/{number}"),
            repo: repo.into(),
            state: IssueState::Open,
            assignees: vec![],
            labels: vec![],
            details: Default::default(),
        },
        pending: false,
        updated_by_sync: false,
    }
}
