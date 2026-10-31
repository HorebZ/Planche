use crate::domain::{User, UserId};

pub(crate) fn user(login: &str) -> User {
    User {
        id: UserId(format!("U_{login}")),
        login: login.into(),
        avatar_url: String::new(),
    }
}
