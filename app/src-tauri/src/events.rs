//! The events Rust emits to the webview, and the task that relays the sync engine's.

use planche_core::domain::ProjectId;
use planche_core::intent::Intent;
use planche_core::sync::{SyncEvent, SyncStatus};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;
use tokio::sync::broadcast::{Receiver, error::RecvError};

/// The board of `project_id` changed: a sync, an acknowledged move, or a rollback.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct BoardChanged {
    pub project_id: ProjectId,
}

/// GitHub refused a queued intent for good, and the board rolled back.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct MutationFailed {
    pub intent: Intent,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "sync-status")]
pub struct SyncStatusChanged(pub SyncStatus);

/// Forwards one engine's events until the engine stops. It also logs each cycle on stdout,
/// like `planche sync --watch`, for the live scenarios.
pub fn relay(app: AppHandle, project: ProjectId, mut events: Receiver<SyncEvent>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let event = match events.recv().await {
                Ok(event) => event,
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => return,
            };
            let changed = BoardChanged {
                project_id: project.clone(),
            };
            // An emit only fails once the window is gone.
            let _ = match event {
                SyncEvent::Status(status) => SyncStatusChanged(status).emit(&app),
                SyncEvent::Synced { report, .. } => {
                    println!(
                        "sync ok items={} cost={} changes={}",
                        report.items,
                        report.cost,
                        report.changes.len()
                    );

                    changed.emit(&app)
                }
                SyncEvent::SyncFailed { error, .. } => {
                    println!("sync failed: {error}");

                    Ok(())
                }
                SyncEvent::MutationOk(mutation) => {
                    println!("mutation ok: {}", mutation.intent.item_id());

                    changed.emit(&app)
                }
                SyncEvent::MutationFailed { mutation, error } => {
                    println!(
                        "mutation failed, rolled back: {} ({error})",
                        mutation.intent.item_id()
                    );

                    let _ = MutationFailed {
                        intent: mutation.intent,
                        message: error.to_string(),
                    }
                    .emit(&app);

                    changed.emit(&app)
                }
            };
        }
    });
}
