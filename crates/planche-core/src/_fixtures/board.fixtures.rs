use crate::domain::{Board, BoardField, BoardProject, Card, Column, FieldId, OptionId, ProjectId};

pub(crate) fn column(option: &str, name: &str, cards: Vec<Card>) -> Column {
    Column {
        option_id: Some(OptionId(option.into())),
        name: name.into(),
        color: None,
        cards,
    }
}

pub(crate) fn board() -> Board {
    Board {
        project: BoardProject {
            id: ProjectId("PVT_1".into()),
            number: 2,
            title: "Planche".into(),
            url: "https://github.com/users/HorebZ/projects/2".into(),
        },
        view: None,
        field: BoardField {
            id: FieldId("PVTSSF_status".into()),
            name: "Status".into(),
        },
        columns: vec![column("todo", "Todo", vec![])],
        pending_count: 0,
        synced_at: None,
    }
}
