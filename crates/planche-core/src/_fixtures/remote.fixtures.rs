use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

use crate::Error;
use crate::intent::Operation;
use crate::sync::Remote;

#[derive(Clone)]
pub(crate) struct WaitingRemote {
    pub(crate) started: Arc<Notify>,
    pub(crate) release: Arc<Notify>,
    pub(crate) failure: Arc<Mutex<Option<Error>>>,
}

impl WaitingRemote {
    pub(crate) fn new() -> Self {
        Self {
            started: Arc::new(Notify::new()),
            release: Arc::new(Notify::new()),
            failure: Arc::default(),
        }
    }
}

impl Remote for WaitingRemote {
    async fn board_page(
        &self,
        _: &str,
        _: u32,
    ) -> crate::Result<(crate::domain::ProjectMeta, crate::github::ops::ItemsPage)> {
        panic!("an issue send must not load a Project");
    }

    async fn items_page(
        &self,
        _: &crate::domain::ProjectId,
        _: &str,
    ) -> crate::Result<crate::github::ops::ItemsPage> {
        panic!("an issue send must not load Project items");
    }

    async fn execute(&self, _: &Operation) -> crate::Result<Option<crate::domain::ItemId>> {
        self.started.notify_one();
        self.release.notified().await;

        match self.failure.lock().unwrap().take() {
            Some(error) => Err(error),
            None => Ok(None),
        }
    }

    fn usage(&self) -> crate::domain::RateUsage {
        crate::domain::RateUsage::default()
    }
}
