//! The sync engine: full fetches into the cache, the sender that drains `pending_mutation`,
//! and the scheduler that decides when to sync.

use std::collections::HashMap;
use std::future::Future;
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::sync::{broadcast, mpsc};

use crate::board::project_board;
use crate::cache::{Cache, Mutation};
use crate::domain::{Board, ItemId, ProjectId, ProjectMeta, RateUsage};
use crate::error::{Error, GraphqlError, Result};
use crate::github::GithubClient;
use crate::github::ops::{self, ItemsPage};
use crate::intent::{Intent, Operation, Placement, to_operations};

/// The GitHub calls the engine makes. Tests swap in a fake.
pub trait Remote: Send + Sync + 'static {
    /// The metadata and the first page of `<owner>/<number>`.
    fn board_page(
        &self,
        owner: &str,
        number: u32,
    ) -> impl Future<Output = Result<(ProjectMeta, ItemsPage)>> + Send;
    fn items_page(
        &self,
        project: &ProjectId,
        cursor: &str,
    ) -> impl Future<Output = Result<ItemsPage>> + Send;
    /// `Some` with the new item's ID for `AddDraftIssue`.
    fn execute(&self, operation: &Operation)
    -> impl Future<Output = Result<Option<ItemId>>> + Send;
    fn usage(&self) -> RateUsage;
}

impl Remote for GithubClient {
    fn board_page(
        &self,
        owner: &str,
        number: u32,
    ) -> impl Future<Output = Result<(ProjectMeta, ItemsPage)>> + Send {
        ops::board_page(self, owner, number)
    }

    fn items_page(
        &self,
        project: &ProjectId,
        cursor: &str,
    ) -> impl Future<Output = Result<ItemsPage>> + Send {
        ops::items_page(self, project, cursor)
    }

    fn execute(
        &self,
        operation: &Operation,
    ) -> impl Future<Output = Result<Option<ItemId>>> + Send {
        ops::execute(self, operation)
    }

    fn usage(&self) -> RateUsage {
        GithubClient::usage(self)
    }
}

/// `PLANCHE_FAULT` injects failures in debug builds: `fail_page_2`, `fail_mutations`,
/// `hang_before_ack` and `ratelimit_low`, comma separated.
fn fault(name: &str) -> bool {
    cfg!(debug_assertions)
        && std::env::var("PLANCHE_FAULT").is_ok_and(|f| f.split(',').any(|f| f.trim() == name))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SyncReport {
    pub project: ProjectId,
    /// Items fetched, archived ones included.
    pub items: u32,
    /// Points this sync cost.
    pub cost: u32,
    pub usage: RateUsage,
    /// Cards that changed column on the server since the previous sync.
    pub changes: Vec<CardChange>,
}

/// `None` stands for a card absent from that board.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct CardChange {
    pub title: String,
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Fetches every page into memory, then writes them in one transaction. A failed page
/// writes nothing. `progress` gets `(page, pages, items_total)` after each page.
pub async fn full_sync<R: Remote>(
    cache: &mut Cache,
    remote: &R,
    owner: &str,
    number: u32,
    mut progress: impl FnMut(u32, u32, u32),
) -> Result<SyncReport> {
    let cost_before = remote.usage().cost_total;
    let (meta, mut page) = remote.board_page(owner, number).await?;
    let total = page.total_count;
    let pages = total.div_ceil(100).max(1);

    progress(1, pages, total);

    let mut items = std::mem::take(&mut page.items);

    for n in 2.. {
        let Some(cursor) = page.next_cursor.take() else {
            break;
        };

        if n == 2 && fault("fail_page_2") {
            return Err(Error::Network("PLANCHE_FAULT=fail_page_2".into()));
        }

        page = remote.items_page(&meta.id, &cursor).await?;
        items.append(&mut page.items);
        progress(n, pages, total);
    }

    let before = cache
        .snapshot(&meta.id)?
        .and_then(|(meta, items)| project_board(&meta, None, &items).ok());

    cache.write_snapshot(&meta, &items, owner == "@me")?;

    let after = project_board(&meta, None, &items).ok();
    let usage = remote.usage();

    Ok(SyncReport {
        project: meta.id,
        items: items.len() as u32,
        cost: usage.cost_total - cost_before,
        usage,
        changes: match (before, after) {
            (Some(before), Some(after)) => column_changes(&before, &after),
            _ => Vec::new(),
        },
    })
}

fn column_changes(before: &Board, after: &Board) -> Vec<CardChange> {
    let columns = |board: &Board| -> HashMap<ItemId, (String, String)> {
        board
            .columns
            .iter()
            .flat_map(|c| {
                c.cards.iter().map(|card| {
                    (
                        card.item_id.clone(),
                        (card.title().to_owned(), c.name.clone()),
                    )
                })
            })
            .collect()
    };
    let (mut before, after) = (columns(before), columns(after));
    let mut changes: Vec<CardChange> = after
        .into_iter()
        .filter_map(|(id, (title, to))| {
            let from = before.remove(&id).map(|(_, from)| from);

            (from.as_ref() != Some(&to)).then_some(CardChange {
                title,
                from,
                to: Some(to),
            })
        })
        .collect();

    changes.extend(before.into_values().map(|(title, from)| CardChange {
        title,
        from: Some(from),
        to: None,
    }));
    changes.sort_by(|a, b| a.title.cmp(&b.title));

    changes
}

#[derive(Debug)]
pub enum Sent {
    Ok(Mutation),
    /// A definitive error. The row is gone, and the board shows the server state again.
    Failed(Mutation, Error),
}

/// Sends the project's queued intents in order. A transient error puts its row back and
/// stops, so later rows keep their order. A definitive error drops the row and goes on.
/// A created draft then gets a `MoveCard` to its column, queued like any other intent.
pub async fn flush<R: Remote>(
    cache: &mut Cache,
    remote: &R,
    project: &ProjectId,
    mut sent: impl FnMut(Sent),
) -> Result<()> {
    while let Some(mutation) = cache.claim_next(project)? {
        let board = cache.board(project, None)?;

        match send(remote, &mutation.intent, board.as_ref()).await {
            Ok(created) => {
                if fault("hang_before_ack") {
                    std::future::pending::<()>().await;
                }

                cache.ack(mutation.seq)?;

                if let (
                    Some(item_id),
                    Intent::CreateDraft {
                        project_id,
                        field_id,
                        column,
                        ..
                    },
                ) = (created, &mutation.intent)
                {
                    cache.enqueue(&Intent::MoveCard {
                        project_id: project_id.clone(),
                        item_id,
                        field_id: field_id.clone(),
                        to: column.clone(),
                        placement: Placement::Top,
                    })?;
                }

                sent(Sent::Ok(mutation));
            }
            Err(error) if error.is_transient() => {
                cache.release(mutation.seq, &error.to_string())?;

                return Err(error);
            }
            Err(error) => {
                cache.remove(mutation.seq)?;
                sent(Sent::Failed(mutation, error));
            }
        }
    }

    Ok(())
}

/// Sends the mutations of one intent, and returns the item a `CreateDraft` made. `board` is
/// the displayed board, which `to_operations` reads.
async fn send<R: Remote>(
    remote: &R,
    intent: &Intent,
    board: Option<&Board>,
) -> Result<Option<ItemId>> {
    if fault("fail_mutations") {
        return Err(Error::GitHub(vec![GraphqlError {
            kind: None,
            message: "PLANCHE_FAULT=fail_mutations".into(),
        }]));
    }

    let board = board
        .ok_or_else(|| Error::Cache(format!("project {} is not cached", intent.project_id())))?;
    let mut created = None;

    for operation in to_operations(intent, board)? {
        created = created.or(remote.execute(&operation).await?);
    }

    Ok(created)
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SyncInterval {
    OneMinute,
    #[default]
    FiveMinutes,
    FifteenMinutes,
    Manual,
}

impl SyncInterval {
    pub fn duration(self) -> Option<Duration> {
        match self {
            Self::OneMinute => Some(Duration::from_secs(60)),
            Self::FiveMinutes => Some(Duration::from_secs(300)),
            Self::FifteenMinutes => Some(Duration::from_secs(900)),
            Self::Manual => None,
        }
    }

    /// The value stored in `kv` under `sync_interval`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneMinute => "1m",
            Self::FiveMinutes => "5m",
            Self::FifteenMinutes => "15m",
            Self::Manual => "manual",
        }
    }
}

impl FromStr for SyncInterval {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, String> {
        [
            Self::OneMinute,
            Self::FiveMinutes,
            Self::FifteenMinutes,
            Self::Manual,
        ]
        .into_iter()
        .find(|i| i.as_str() == s)
        .ok_or_else(|| format!("expected 1m, 5m, 15m or manual, got `{s}`"))
    }
}

/// The hourly GraphQL quota of a personal access token.
const HOURLY_POINTS: u32 = 5000;
/// Planche keeps to 20 % of it, and leaves the rest to `gh` and other tools.
const BUDGET_PER_HOUR: u32 = HOURLY_POINTS / 5;
/// Below this many points left, the next sync waits for the reset.
const LOW_REMAINING: u32 = 250;

/// The delay before the next automatic sync, or `None` for `Manual`. It starts from the
/// setting, and grows so that `cost` points per sync stay within 20 % of the hourly quota.
/// When the quota is nearly spent, it waits `reset_in`.
pub fn next_interval(
    setting: SyncInterval,
    cost: u32,
    remaining: u32,
    reset_in: Duration,
) -> Option<Duration> {
    let base = setting.duration()?;

    if remaining < LOW_REMAINING {
        return Some(base.max(reset_in));
    }

    let floor = (u64::from(cost) * 3600).div_ceil(u64::from(BUDGET_PER_HOUR));

    Some(base.max(Duration::from_secs(floor)))
}

/// Both clocks, so tests can make the wall clock jump. On macOS, `Instant` stops while the
/// Mac sleeps and `SystemTime` does not.
pub trait Clock: Send + Sync + 'static {
    fn wall(&self) -> SystemTime;
    fn mono(&self) -> Instant;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn wall(&self) -> SystemTime {
        SystemTime::now()
    }

    fn mono(&self) -> Instant {
        Instant::now()
    }
}

/// The sync settings, stored in `kv` as `sync_interval` and `sync_on_wake`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncPrefs {
    pub interval: SyncInterval,
    pub on_wake: bool,
}

impl SyncPrefs {
    /// The stored settings, with `5m` and `true` by default.
    pub fn load(cache: &Cache) -> Result<Self> {
        Ok(Self {
            interval: cache
                .get("sync_interval")?
                .and_then(|v| v.parse().ok())
                .unwrap_or_default(),
            on_wake: cache.get("sync_on_wake")?.as_deref() != Some("false"),
        })
    }

    pub fn save(self, cache: &Cache) -> Result<()> {
        cache.set("sync_interval", self.interval.as_str())?;

        cache.set("sync_on_wake", if self.on_wake { "true" } else { "false" })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncConfig {
    /// The project, as `<owner>/<number>` with `@me` for the viewer.
    pub owner: String,
    pub number: u32,
    pub interval: SyncInterval,
    pub sync_on_wake: bool,
}

impl SyncConfig {
    /// The project with the stored `SyncPrefs`.
    pub fn load(cache: &Cache, owner: &str, number: u32) -> Result<Self> {
        let prefs = SyncPrefs::load(cache)?;

        Ok(Self {
            owner: owner.to_owned(),
            number,
            interval: prefs.interval,
            sync_on_wake: prefs.on_wake,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncCommand {
    /// Flush and sync now: Cmd+R, `planche sync`.
    Now,
    /// The window got focus: sync when the last sync is older than 30 s. `Manual` ignores it.
    Focus,
    /// New settings, applied from now on.
    Configure(SyncPrefs),
    /// Send the queue now, without a sync: a user action was just queued.
    Flush,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct SyncStatus {
    pub state: SyncState,
    /// Unix time in milliseconds of this engine's last successful sync.
    pub last_sync_at: Option<f64>,
    /// Unix time in milliseconds of the next retry after a failure, for the offline countdown.
    pub retry_at: Option<f64>,
    /// Queued intents GitHub has not acknowledged yet.
    pub pending: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SyncState {
    #[default]
    Idle,
    Syncing {
        page: u32,
        pages: u32,
        items_total: u32,
    },
    Offline,
    RateLimited,
    Error {
        message: String,
    },
}

#[derive(Debug, Clone)]
pub enum SyncEvent {
    Status(SyncStatus),
    Synced {
        report: SyncReport,
        /// `None` for `Manual`.
        next_in: Option<Duration>,
    },
    SyncFailed {
        error: Arc<Error>,
        retry_in: Duration,
    },
    MutationOk(Mutation),
    MutationFailed {
        mutation: Mutation,
        error: Arc<Error>,
    },
}

/// Commands in, events out. The engine stops when every handle is dropped.
#[derive(Clone)]
pub struct SyncHandle {
    commands: mpsc::Sender<SyncCommand>,
    events: broadcast::Sender<SyncEvent>,
    status: Arc<Mutex<SyncStatus>>,
}

impl SyncHandle {
    pub async fn send(&self, command: SyncCommand) {
        // The engine only stops once every handle is gone, so this cannot fail.
        let _ = self.commands.send(command).await;
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SyncEvent> {
        self.events.subscribe()
    }

    /// The last status the engine published.
    pub fn status(&self) -> SyncStatus {
        self.status.lock().expect("status lock").clone()
    }
}

/// How often the engine wakes to check the schedule, the clocks, and the queue.
const TICK: Duration = Duration::from_secs(1);
const FOCUS_STALE: Duration = Duration::from_secs(30);
const MAX_BACKOFF: Duration = Duration::from_secs(60);

/// Starts the engine as a single task on the current tokio runtime. The task owns `cache`.
/// It puts rows left in flight back in the queue, then syncs on commands and on schedule.
/// Subscribe before the first command to see every event.
pub fn spawn<R: Remote>(
    cache: Cache,
    remote: R,
    config: SyncConfig,
    clock: Arc<dyn Clock>,
) -> SyncHandle {
    let (commands, receiver) = mpsc::channel(16);
    let (events, _) = broadcast::channel(64);
    let status = Arc::new(Mutex::new(SyncStatus::default()));
    let engine = Engine {
        cache,
        remote,
        config,
        clock,
        events: events.clone(),
        status: status.clone(),
        due_at: None,
        failures: 0,
        last_sync: None,
        last_success: None,
    };

    tokio::spawn(engine.run(receiver));

    SyncHandle {
        commands,
        events,
        status,
    }
}

struct Engine<R> {
    cache: Cache,
    remote: R,
    config: SyncConfig,
    clock: Arc<dyn Clock>,
    events: broadcast::Sender<SyncEvent>,
    status: Arc<Mutex<SyncStatus>>,
    /// The next automatic sync, or the next retry after a failure.
    due_at: Option<Instant>,
    failures: u32,
    last_sync: Option<Instant>,
    /// Unix milliseconds of the last successful sync.
    last_success: Option<f64>,
}

impl<R: Remote> Engine<R> {
    async fn run(mut self, mut commands: mpsc::Receiver<SyncCommand>) {
        if let Err(error) = self.cache.reset_in_flight() {
            self.failed(error);
        }

        self.schedule();
        self.publish(SyncState::Idle, None);

        let mut last_tick = (self.clock.wall(), self.clock.mono());

        loop {
            tokio::select! {
                command = commands.recv() => match command {
                    None => return,
                    Some(SyncCommand::Now) => self.cycle().await,
                    Some(SyncCommand::Focus) => {
                        let stale = self
                            .last_sync
                            .is_none_or(|t| self.clock.mono() - t > FOCUS_STALE);
                        if self.config.interval != SyncInterval::Manual && stale {
                            self.cycle().await;
                        }
                    }
                    Some(SyncCommand::Flush) => match self.flush().await {
                        Ok(true) => {
                            // Something went through, so GitHub is reachable again.
                            if self.failures > 0 {
                                self.failures = 0;
                                self.schedule();
                            }
                            self.publish(SyncState::Idle, None);
                        }
                        Ok(false) => self.republish(),
                        Err(error) => self.failed(error),
                    },
                    Some(SyncCommand::Configure(prefs)) => {
                        self.config.interval = prefs.interval;
                        self.config.sync_on_wake = prefs.on_wake;
                        if self.failures == 0 {
                            self.schedule();
                        }
                    }
                },
                () = tokio::time::sleep(TICK) => {
                    let (wall, mono) = (self.clock.wall(), self.clock.mono());
                    let wall_elapsed = wall.duration_since(last_tick.0).unwrap_or_default();
                    let slept = wall_elapsed.saturating_sub(mono - last_tick.1);
                    last_tick = (wall, mono);
                    let woke = self.config.sync_on_wake
                        && self.config.interval.duration().is_some_and(|i| slept > i);
                    if woke || self.due_at.is_some_and(|due| mono >= due) {
                        self.cycle().await;
                    } else if self.failures == 0 {
                        // Sends what another process queued, such as `planche move` offline.
                        match self.flush().await {
                            Ok(true) => self.publish(SyncState::Idle, None),
                            Ok(false) => {}
                            Err(error) => self.failed(error),
                        }
                    }
                }
            }
        }
    }

    /// The next automatic sync, one interval from now.
    fn schedule(&mut self) {
        self.due_at = self
            .config
            .interval
            .duration()
            .map(|d| self.clock.mono() + d);
    }

    /// Flushes the queue, then fetches the project.
    async fn cycle(&mut self) {
        self.last_sync = Some(self.clock.mono());

        let syncing = |page, pages, items_total| SyncState::Syncing {
            page,
            pages,
            items_total,
        };

        self.publish(syncing(0, 0, 0), None);

        let result = match self.flush().await {
            Ok(_) => {
                let (status, events) = (self.status.clone(), self.events.clone());
                let base = self.status();

                full_sync(
                    &mut self.cache,
                    &self.remote,
                    &self.config.owner,
                    self.config.number,
                    |page, pages, items_total| {
                        let next = SyncStatus {
                            state: syncing(page, pages, items_total),
                            ..base.clone()
                        };

                        *status.lock().expect("status lock") = next.clone();

                        let _ = events.send(SyncEvent::Status(next));
                    },
                )
                .await
            }
            Err(error) => Err(error),
        };

        match result {
            Ok(report) => {
                self.failures = 0;

                let remaining = if fault("ratelimit_low") {
                    1
                } else {
                    report.usage.remaining.unwrap_or(HOURLY_POINTS)
                };
                let now = self
                    .clock
                    .wall()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default();
                let reset_in = report.usage.reset_at.map_or(Duration::ZERO, |at| {
                    Duration::from_secs(at.into()).saturating_sub(now)
                });
                let next_in = next_interval(self.config.interval, report.cost, remaining, reset_in);

                self.due_at = next_in.map(|d| self.clock.mono() + d);
                self.last_success = Some(unix_ms(self.clock.wall()));
                self.publish(SyncState::Idle, None);
                self.emit(SyncEvent::Synced { report, next_in });
            }
            Err(error) => self.failed(error),
        }
    }

    /// Sends the queue. `Ok(true)` when it sent or dropped at least one row.
    async fn flush(&mut self) -> Result<bool> {
        let Some(project) = self
            .cache
            .project_id(&self.config.owner, self.config.number)?
        else {
            return Ok(false);
        };

        let events = self.events.clone();
        let mut any = false;

        flush(&mut self.cache, &self.remote, &project, |sent| {
            any = true;

            let _ = events.send(match sent {
                Sent::Ok(mutation) => SyncEvent::MutationOk(mutation),
                Sent::Failed(mutation, error) => SyncEvent::MutationFailed {
                    mutation,
                    error: Arc::new(error),
                },
            });
        })
        .await?;

        Ok(any)
    }

    /// Retries with an exponential backoff from 2 s to 60 s, or after `retry-after`.
    fn failed(&mut self, error: Error) {
        self.failures += 1;

        let backoff = Duration::from_secs(1 << self.failures.min(6)).min(MAX_BACKOFF);
        let (retry_in, state) = match &error {
            Error::RateLimited { retry_after_secs } => (
                backoff.max(Duration::from_secs(*retry_after_secs)),
                SyncState::RateLimited,
            ),
            Error::Network(_) => (backoff, SyncState::Offline),
            error => (
                backoff,
                SyncState::Error {
                    message: error.to_string(),
                },
            ),
        };

        self.due_at = Some(self.clock.mono() + retry_in);
        self.publish(state, Some(self.clock.wall() + retry_in));
        self.emit(SyncEvent::SyncFailed {
            error: Arc::new(error),
            retry_in,
        });
    }

    fn status(&self) -> SyncStatus {
        self.status.lock().expect("status lock").clone()
    }

    /// Emits the current status again, with a fresh count of pending rows.
    fn republish(&mut self) {
        let SyncStatus {
            state, retry_at, ..
        } = self.status();
        let retry_at = retry_at.map(|ms| UNIX_EPOCH + Duration::from_secs_f64(ms / 1000.0));

        self.publish(state, retry_at);
    }

    /// Stores and emits a new status, with the current count of pending rows.
    fn publish(&mut self, state: SyncState, retry_at: Option<SystemTime>) {
        let pending = self
            .cache
            .project_id(&self.config.owner, self.config.number)
            .ok()
            .flatten()
            .and_then(|project| self.cache.pending_count(&project).ok())
            .unwrap_or(0);
        let status = SyncStatus {
            state,
            last_sync_at: self.last_success,
            retry_at: retry_at.map(unix_ms),
            pending,
        };

        *self.status.lock().expect("status lock") = status.clone();
        self.emit(SyncEvent::Status(status));
    }

    fn emit(&self, event: SyncEvent) {
        // No subscriber is fine: the app may not listen yet.
        let _ = self.events.send(event);
    }
}

fn unix_ms(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

#[cfg(test)]
#[path = "sync.test.rs"]
mod tests;

#[cfg(test)]
#[path = "sync.integration.test.rs"]
mod integration_tests;
