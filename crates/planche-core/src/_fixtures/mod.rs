#[path = "board.fixtures.rs"]
mod board;
#[path = "card.fixtures.rs"]
mod card;
#[path = "clock.fixtures.rs"]
mod clock;
#[path = "comment.fixtures.rs"]
mod comment;
#[path = "issue.fixtures.rs"]
mod issue_record;
#[path = "remote.fixtures.rs"]
mod remote;
#[path = "user.fixtures.rs"]
mod user;

pub(crate) use board::{board, column};
pub(crate) use card::issue;
pub(crate) use clock::FakeClock;
pub(crate) use comment::{CommentRemote, comment_session};
pub(crate) use issue_record::issue_record;
pub(crate) use remote::WaitingRemote;
pub(crate) use user::user;
