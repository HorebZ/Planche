//! The commands the webview calls. Each one is a thin wrapper over `Core`, which holds the
//! read connection to the cache and the sync engine of the open project.

use std::sync::{Arc, Mutex};
use std::time::Instant;

use planche_core::auth::oauth::{DeviceCode, DeviceFlow};
use planche_core::auth::{self, AuthStatus};
use planche_core::cache::Cache;
use planche_core::description::Descriptions;
use planche_core::domain::{
    Board, ContentId, Issue, IssueDescription, IssueLoad, ProjectId, ProjectList, ProjectMeta,
    User, UserId, ViewId,
};
use planche_core::error::Error;
use planche_core::github::{GithubClient, ops};
use planche_core::intent::Intent;
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
            | Error::Credentials(_)
            | Error::OAuth(_) => ErrorKind::Auth,
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

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DispatchOutcome {
    Accepted {
        #[specta(type = specta_typescript::Number)]
        seq: i64,
    },
    Rejected {
        error: AppError,
    },
}

type Result<T> = std::result::Result<T, AppError>;

pub struct Core {
    pub started: Instant,
    reader: Mutex<Cache>,
    /// The last list from GitHub, to find the owner of a project not cached yet.
    projects: Mutex<Option<ProjectList>>,
    token: Mutex<Option<String>>,
    oauth: DeviceFlow,
    descriptions: Descriptions,
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
            token: Mutex::default(),
            oauth: DeviceFlow::default(),
            descriptions: Descriptions::default(),
            engine: tokio::sync::Mutex::default(),
        }
    }

    fn cache(&self) -> std::sync::MutexGuard<'_, Cache> {
        self.reader.lock().expect("cache lock")
    }

    // Background commands use only the authenticated session.
    fn client(&self) -> Result<GithubClient> {
        let token = self.token.lock().expect("token lock").clone();

        Ok(GithubClient::new(token.ok_or(Error::NotSignedIn)?)?)
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

    pub fn dispatch_intent(&self, intent: &Intent) -> DispatchOutcome {
        match self.cache().enqueue(intent) {
            Ok(seq) => DispatchOutcome::Accepted { seq },
            Err(error) => DispatchOutcome::Rejected {
                error: error.into(),
            },
        }
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

        let client = self.client()?;
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
        let mut engine = self.engine.lock().await;

        *self.token.lock().expect("token lock") = None;
        self.descriptions.lock();
        *engine = None;
    }
}

/// Who is signed in. With a stored token, the account the last check saw, without the network,
/// so the cached board shows at once. A revoked token surfaces as an auth error in the sync.
#[tauri::command]
#[specta::specta]
pub async fn auth_status(core: State<'_, Core>) -> Result<AuthStatus> {
    let token = tauri::async_runtime::spawn_blocking(auth::load_token)
        .await
        .map_err(|_| AppError {
            kind: ErrorKind::Auth,
            message: "Could not read the saved session. Try again.".into(),
        })?;
    let token = match token {
        Ok(token) => token,
        Err(Error::NotSignedIn) => return Ok(AuthStatus::default()),
        Err(error) => return Err(error.into()),
    };
    let cached = auth::cached_status(&core.cache(), &token)?;

    if let Some(status) = cached {
        remember_account(&core, &status, &token)?;
        *core.token.lock().expect("token lock") = Some(token);
        core.descriptions
            .unlock(status.id.clone().ok_or(Error::NotSignedIn)?);

        return Ok(status);
    }

    let status = auth::status().await?;

    remember_account(&core, &status, &token)?;
    *core.token.lock().expect("token lock") = Some(token);
    core.descriptions
        .unlock(status.id.clone().ok_or(Error::NotSignedIn)?);

    Ok(status)
}

fn remember_account(core: &Core, status: &AuthStatus, token: &str) -> Result<()> {
    let cache = core.cache();

    if let Some(id) = &status.id {
        cache.set("account_id", id.as_str())?;
    }

    if let Some(login) = &status.login {
        cache.set("account_login", login)?;
    }

    if let Some(avatar) = &status.avatar_url {
        cache.set("account_avatar", avatar)?;
    }

    auth::remember_status(&cache, token, status)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn auth_set_token(core: State<'_, Core>, token: String) -> Result<AuthStatus> {
    let status = auth::set_token(&token).await?;

    accept_account(&core, &status)?;

    Ok(status)
}

fn accept_account(core: &Core, status: &AuthStatus) -> Result<()> {
    let token = auth::load_token()?;

    core.descriptions.lock();
    remember_account(core, status, &token)?;
    *core.token.lock().expect("token lock") = Some(token);
    core.descriptions
        .unlock(status.id.clone().ok_or(Error::NotSignedIn)?);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn auth_oauth_start(core: State<'_, Core>) -> Result<DeviceCode> {
    Ok(core.oauth.start().await?)
}

#[tauri::command]
#[specta::specta]
pub async fn auth_oauth_poll(
    core: State<'_, Core>,
    user_code: String,
) -> Result<Option<AuthStatus>> {
    let status = core.oauth.poll(&user_code).await?;

    if let Some(status) = &status {
        accept_account(&core, status)?;
    }

    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub async fn auth_oauth_cancel(core: State<'_, Core>, user_code: String) -> Result<()> {
    core.oauth.cancel(&user_code).await;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn auth_oauth_copy_code(core: State<'_, Core>, user_code: String) -> Result<()> {
    Ok(core.oauth.copy_code(&user_code).await?)
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
    let client = core.client()?;

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

#[tauri::command]
#[specta::specta]
pub async fn cached_issue_description(
    core: State<'_, Core>,
    account: UserId,
    content: ContentId,
) -> Result<Option<IssueDescription>> {
    Ok(core.descriptions.cached(&core.reader, &account, &content)?)
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_issue_description(
    core: State<'_, Core>,
    account: UserId,
    content: ContentId,
) -> Result<Option<IssueDescription>> {
    let client = core.client()?;

    Ok(core
        .descriptions
        .refresh(
            &core.reader,
            &account,
            &content,
            ops::issue_description(&client, &account, &content),
        )
        .await?)
}

#[tauri::command]
#[specta::specta]
pub async fn cached_issue(
    core: State<'_, Core>,
    account: UserId,
    content: ContentId,
) -> Result<Option<Issue>> {
    Ok(core
        .descriptions
        .cached_issue(&core.reader, &account, &content)?)
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_issue(
    core: State<'_, Core>,
    account: UserId,
    content: ContentId,
) -> Result<IssueLoad> {
    let client = core.client()?;

    Ok(core
        .descriptions
        .refresh_issue(
            &core.reader,
            &account,
            &content,
            ops::issue(&client, &account, &content),
        )
        .await?)
}

/// Accepted confirms the local enqueue commit, not synchronization with GitHub.
#[tauri::command]
#[specta::specta]
pub async fn dispatch_intent(core: State<'_, Core>, intent: Intent) -> Result<DispatchOutcome> {
    let outcome = core.dispatch_intent(&intent);

    if matches!(outcome, DispatchOutcome::Accepted { .. })
        && let Some(engine) = core.engine().await
    {
        engine.send(SyncCommand::Flush).await;
    }

    Ok(outcome)
}

/// Who can be assigned in `repo`, an `owner/name`.
#[tauri::command]
#[specta::specta]
pub async fn list_assignable_users(core: State<'_, Core>, repo: String) -> Result<Vec<User>> {
    let (owner, name) = repo.split_once('/').ok_or_else(|| AppError {
        kind: ErrorKind::Invalid,
        message: format!("expected owner/name, got `{repo}`"),
    })?;
    let client = core.client()?;

    Ok(ops::assignable_users(&client, owner, name).await?)
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
#[path = "commands.test.rs"]
mod tests;
