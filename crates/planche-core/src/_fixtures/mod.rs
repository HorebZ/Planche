#[path = "board.fixtures.rs"]
mod board;
#[path = "card.fixtures.rs"]
mod card;
#[path = "clock.fixtures.rs"]
mod clock;
#[path = "issue.fixtures.rs"]
mod issue_record;
#[path = "user.fixtures.rs"]
mod user;

pub(crate) use board::{board, column};
pub(crate) use card::issue;
pub(crate) use clock::FakeClock;
pub(crate) use issue_record::issue_record;
pub(crate) use user::user;
