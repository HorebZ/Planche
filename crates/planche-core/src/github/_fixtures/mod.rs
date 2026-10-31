#[path = "github.fixtures.rs"]
mod fake_github;

pub(crate) use fake_github::{FakeGithub, FakeOffline};

pub(crate) const PROJECT_META: &str = include_str!("project_meta.json");
pub(crate) const ITEM_PAGES: [&str; 2] = [
    include_str!("project_items_page1.json"),
    include_str!("project_items_page2.json"),
];
