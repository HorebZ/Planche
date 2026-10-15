//! The commands the webview calls. Each one is a thin wrapper over `Core`, which holds the
//! read connection to the cache and the sync engine of the open project.

use std::sync::{Arc, Mutex};
use std::time::Instant;

use planche_core::auth::{self, AuthStatus};
use planche_core::cache::Cache;
use planche_core::domain::{Board, ProjectId, ProjectList, ProjectMeta, ViewId};
use planche_core::error::Error;
use planche_core::github::{GithubClient, ops};
use planche_core::sync::{
    self, SyncCommand, SyncConfig, SyncEvent, SyncHandle, SyncPrefs, SyncReport, SyncStatus,
    SystemClock,
};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};
use tokio::sync::broadcast::error::RecvError;

use crate::events;

#[derive(Debug, Clone, Serialize, Type)]
pub struct AppError {
    pub kind: ErrorKind,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub enum ErrorKind {
    Auth,
    Network,
    RateLimited,
    NotFound,
    GitHub,
    Cache,
    Invalid,
}

impl From<&Error> for AppError {
    fn from(error: &Error) -> Self {
        let kind = match error {
            Error::NotSignedIn
            | Error::Unauthorized
            | Error::MissingScopes(_)
            | Error::ClassicTokenRequired
            | Error::Keychain(_) => ErrorKind::Auth,
            Error::Network(_) => ErrorKind::Network,
            Error::RateLimited { .. } => ErrorKind::RateLimited,
            Error::ProjectNotFound { .. }
            | Error::ViewNotFound(_)
            | Error::CardNotFound(_)
            | Error::NotCached { .. } => ErrorKind::NotFound,
            Error::GitHub(_) | Error::Http(_) | Error::Decode(_) => ErrorKind::GitHub,
            Error::Cache(_) => ErrorKind::Cache,
            _ => ErrorKind::Invalid,
        };
        Self {
            kind,
            message: error.to_string(),
        }
    }
}

impl From<Error> for AppError {
    fn from(error: Error) -> Self {
        Self::from(&error)
    }
}

type Result<T> = std::result::Result<T, AppError>;

pub struct Core {
    pub started: Instant,
    reader: Mutex<Cache>,
    /// The last list from GitHub, to find the owner of a project not cached yet.
    projects: Mutex<Option<ProjectList>>,
    engine: tokio::sync::Mutex<Option<Engine>>,
}

struct Engine {
    project: ProjectId,
    handle: SyncHandle,
}

impl Core {
    pub fn new(reader: Cache) -> Self {
        Self {
            started: Instant::now(),
            reader: Mutex::new(reader),
            projects: Mutex::default(),
            engine: tokio::sync::Mutex::default(),
        }
    }

    fn cache(&self) -> std::sync::MutexGuard<'_, Cache> {
        self.reader.lock().expect("cache lock")
    }

    /// The board as displayed, or `None` before the project's first sync.
    pub fn board(&self, project: &ProjectId, view: Option<&ViewId>) -> Result<Option<Board>> {
        let cache = self.cache();
        let number = match view {
            None => None,
            Some(id) => cache
                .meta(project)?
                .and_then(|meta| meta.views.into_iter().find(|v| &v.id == id))
                .map(|v| v.number),
        };
        Ok(cache.board(project, number)?)
    }

    pub fn project(&self, project: &ProjectId) -> Result<Option<ProjectMeta>> {
        Ok(self.cache().meta(project)?)
    }

    pub fn current_project(&self) -> Result<Option<ProjectId>> {
        Ok(self.cache().get("last_project")?.map(ProjectId))
    }

    /// Starts the sync engine on `project`, unless it already runs there.
    pub async fn open(&self, app: &AppHandle, project: &ProjectId) -> Result<SyncHandle> {
        let mut engine = self.engine.lock().await;
        if let Some(engine) = engine.as_ref().filter(|e| &e.project == project) {
            return Ok(engine.handle.clone());
        }
        let client = GithubClient::new(auth::load_token()?)?;
        let (owner, number) = match self.owner_of(project) {
            Ok(found) => found,
            // Not cached and not listed yet: the app just started on a project never synced.
            Err(_) => {
                *self.projects.lock().expect("projects lock") =
                    Some(ops::list_projects(&client).await?);
                self.owner_of(project)?
            }
        };
        let config = SyncConfig::load(&self.cache(), &owner, number)?;
        let handle = sync::spawn(
            Cache::open_default()?,
            client,
            config,
            Arc::new(SystemClock),
        );
        events::relay(app.clone(), project.clone(), handle.subscribe());
        handle.send(SyncCommand::Now).await;
        self.cache().set("last_project", project.as_str())?;
        // Dropping the previous handle stops that engine.
        *engine = Some(Engine {
            project: project.clone(),
            handle: handle.clone(),
        });
        Ok(handle)
    }

    fn owner_of(&self, project: &ProjectId) -> Result<(String, u32)> {
        if let Some(found) = self.cache().project_ref(project)? {
            return Ok(found);
        }
        let projects = self.projects.lock().expect("projects lock");
        projects
            .iter()
            .flat_map(|list| &list.owners)
            .find_map(|owner| {
                owner
                    .projects
                    .iter()
                    .find(|p| &p.id == project)
                    .map(|p| (owner.login.clone(), p.number))
            })
            .ok_or_else(|| AppError {
                kind: ErrorKind::NotFound,
                message: format!("project {project} is not in the project list"),
            })
    }

    pub async fn engine(&self) -> Option<SyncHandle> {
        self.engine.lock().await.as_ref().map(|e| e.handle.clone())
    }

    pub async fn stop(&self) {
        *self.engine.lock().await = None;
    }
}

/// Who is signed in. With a stored token, the account the last check saw, without the network,
/// so the cached board shows at once. A revoked token surfaces as an auth error in the sync.
#[tauri::command]
#[specta::specta]
pub async fn auth_status(core: State<'_, Core>) -> Result<AuthStatus> {
    match auth::load_token() {
        Ok(_) => {}
        Err(Error::NotSignedIn) => return Ok(AuthStatus::default()),
        Err(error) => return Err(error.into()),
    }
    let cached = {
        let cache = core.cache();
        cache.get("account_login")?.map(|login| AuthStatus {
            login: Some(login),
            avatar_url: cache.get("account_avatar").ok().flatten(),
            missing_scopes: Vec::new(),
        })
    };
    if let Some(status) = cached {
        return Ok(status);
    }
    let status = auth::status().await?;
    remember_account(&core, &status)?;
    Ok(status)
}

fn remember_account(core: &Core, status: &AuthStatus) -> Result<()> {
    let cache = core.cache();
    if let Some(login) = &status.login {
        cache.set("account_login", login)?;
    }
    if let Some(avatar) = &status.avatar_url {
        cache.set("account_avatar", avatar)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn auth_set_token(core: State<'_, Core>, token: String) -> Result<AuthStatus> {
    let status = auth::set_token(&token).await?;
    remember_account(&core, &status)?;
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub async fn auth_sign_out(core: State<'_, Core>) -> Result<()> {
    core.stop().await;
    auth::sign_out()?;
    Ok(())
}

/// GitHub's list, or the cached projects when GitHub is unreachable.
#[tauri::command]
#[specta::specta]
pub async fn list_projects(core: State<'_, Core>) -> Result<ProjectList> {
    let client = GithubClient::new(auth::load_token()?)?;
    match ops::list_projects(&client).await {
        Ok(list) => {
            *core.projects.lock().expect("projects lock") = Some(list.clone());
            Ok(list)
        }
        Err(Error::Network(_)) => Ok(core.cache().projects()?),
        Err(error) => Err(error.into()),
    }
}

/// The projects in the cache, at once, while `list_projects` asks GitHub.
#[tauri::command]
#[specta::specta]
pub async fn cached_projects(core: State<'_, Core>) -> Result<ProjectList> {
    Ok(core.cache().projects()?)
}

/// Makes `project_id` the open project: its engine syncs it, and the app reopens it next time.
#[tauri::command]
#[specta::specta]
pub async fn open_project(
    app: AppHandle,
    core: State<'_, Core>,
    project_id: ProjectId,
) -> Result<()> {
    core.open(&app, &project_id).await.map(|_| ())
}

/// The project the app opened last.
#[tauri::command]
#[specta::specta]
pub async fn current_project(core: State<'_, Core>) -> Result<Option<ProjectId>> {
    core.current_project()
}

/// The cached metadata, or `None` before the first sync.
#[tauri::command]
#[specta::specta]
pub async fn get_project(
    core: State<'_, Core>,
    project_id: ProjectId,
) -> Result<Option<ProjectMeta>> {
    core.project(&project_id)
}

/// The board from the cache, or `None` before the first sync.
#[tauri::command]
#[specta::specta]
pub async fn get_board(
    core: State<'_, Core>,
    project_id: ProjectId,
    view_id: Option<ViewId>,
) -> Result<Option<Board>> {
    core.board(&project_id, view_id.as_ref())
}

/// Syncs now and waits for the result.
#[tauri::command]
#[specta::specta]
pub async fn refresh_project(
    app: AppHandle,
    core: State<'_, Core>,
    project_id: ProjectId,
) -> Result<SyncReport> {
    let engine = core.open(&app, &project_id).await?;
    let mut events = engine.subscribe();
    engine.send(SyncCommand::Now).await;
    loop {
        match events.recv().await {
            Ok(SyncEvent::Synced { report, .. }) => return Ok(report),
            Ok(SyncEvent::SyncFailed { error, .. }) => return Err(error.as_ref().into()),
            Ok(_) | Err(RecvError::Lagged(_)) => {}
            Err(RecvError::Closed) => {
                return Err(AppError {
                    kind: ErrorKind::Invalid,
                    message: "the sync engine stopped".into(),
                });
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn sync_status(core: State<'_, Core>) -> Result<SyncStatus> {
    Ok(core
        .engine()
        .await
        .map(|engine| engine.status())
        .unwrap_or_default())
}

#[tauri::command]
#[specta::specta]
pub async fn get_sync_prefs(core: State<'_, Core>) -> Result<SyncPrefs> {
    Ok(SyncPrefs::load(&core.cache())?)
}

#[tauri::command]
#[specta::specta]
pub async fn set_sync_prefs(core: State<'_, Core>, prefs: SyncPrefs) -> Result<SyncPrefs> {
    prefs.save(&core.cache())?;
    if let Some(engine) = core.engine().await {
        engine.send(SyncCommand::Configure(prefs)).await;
    }
    Ok(prefs)
}

/// Logs a webview timing next to the time since `setup`, for the perf budget.
#[tauri::command]
#[specta::specta]
pub fn perf_mark(core: State<'_, Core>, name: String, ms: f64) {
    println!(
        "perf {name} since_setup={}ms webview={ms:.0}ms",
        core.started.elapsed().as_millis()
    );
}

#[cfg(test)]
mod tests {
    use planche_core::github::ops::{decode_project_items, decode_project_meta};
    use serde_json::json;

    use super::*;

    fn fixture(name: &str) -> String {
        let path = format!("{}/../../fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        std::fs::read_to_string(path).unwrap()
    }

    fn core_with_fixtures(name: &str) -> (Core, ProjectId) {
        let dir = std::env::temp_dir().join(format!("planche-app-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut cache = Cache::open(dir.join("cache.sqlite")).unwrap();
        let meta = decode_project_meta(&fixture("project_meta.json")).unwrap();
        let items: Vec<_> = ["project_items_page1.json", "project_items_page2.json"]
            .iter()
            .flat_map(|page| decode_project_items(&fixture(page)).unwrap().items)
            .collect();
        cache.write_snapshot(&meta, &items, true).unwrap();
        (Core::new(cache), meta.id)
    }

    #[test]
    fn get_board_reads_the_cached_board() {
        let (core, project) = core_with_fixtures("board");
        let board = serde_json::to_value(core.board(&project, None).unwrap().unwrap()).unwrap();
        let columns: Vec<_> = board["columns"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| {
                let numbers: Vec<_> = c["cards"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|card| card["number"].clone())
                    .collect();
                json!([c["name"], numbers])
            })
            .collect();
        assert_eq!(
            json!(columns),
            json!([
                ["Todo", [4, 5, 6, 7, 8, 9, 10, 11]],
                ["In Progress", [1]],
                ["Done", [2, 3, 13]]
            ])
        );
        assert_eq!(
            board["columns"][0]["cards"][0],
            json!({
                "item_id": "PVTI_lAHOAq5TD84Bm1t2zhAbQRY",
                "position": 3,
                "kind": "issue",
                "id": "I_kwDOVF-zOM8AAAABWrzxHQ",
                "number": 4,
                "title": "Phase 1b: show a project board in the terminal",
                "url": "https://github.com/HorebZ/Planche/issues/4",
                "repo": "HorebZ/Planche",
                "state": "open",
                "assignees": [],
                "labels": [{ "name": "phase", "color": "1D76DB" }],
                "pending": false,
                "updated_by_sync": false
            })
        );
        assert_eq!(board["pending_count"], json!(0));
        assert!(board["synced_at"].is_string());
    }

    #[test]
    fn get_board_picks_a_view_by_id() {
        let (core, project) = core_with_fixtures("view");
        let meta = core.project(&project).unwrap().unwrap();
        let board_view = meta.views.iter().find(|v| v.number == 2).unwrap();
        let board = core.board(&project, Some(&board_view.id)).unwrap().unwrap();
        assert_eq!(board.view.unwrap().number, 2);
    }

    #[test]
    fn get_board_is_none_before_the_first_sync() {
        let (core, _) = core_with_fixtures("none");
        assert!(
            core.board(&ProjectId("PVT_unknown".into()), None)
                .unwrap()
                .is_none()
        );
    }
}
