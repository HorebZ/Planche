pub mod auth;
pub mod board;
pub mod cache;
pub mod description;
pub mod domain;
pub mod error;
pub mod github;
pub mod intent;
pub mod issue;
pub mod sync;

pub use error::{Error, Result};

#[cfg(test)]
#[path = "_fixtures/mod.rs"]
pub(crate) mod fixtures;
