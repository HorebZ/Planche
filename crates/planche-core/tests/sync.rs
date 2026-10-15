//! The cache and the sync engine, on a temporary database and a fake GitHub built from the
//! fixtures. The fake serves the 12 fixture items in pages of 6, so a full sync takes 2 pages.

use std::future::{Future, ready};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use planche_core::Error;
use planche_core::board::project_board;
use planche_core::cache::Cache;
use planche_core::domain::{Board, Item, ItemId, ProjectId, ProjectMeta, RateUsage};
use planche_core::error::{GraphqlError, Result};
use planche_core::github::ops::{ItemsPage, decode_project_items, decode_project_meta};
use planche_core::intent::{self, Intent, Operation, Placement, to_operations};
use planche_core::sync::{
    self, Clock, Remote, Sent, SyncCommand, SyncConfig, SyncEvent, SyncInterval, SystemClock,
};
use tokio::sync::broadcast;

const PAGE: usize = 6;

struct State {
    meta: ProjectMeta,
    items: Vec<Item>,
    fail_page: Option<u32>,
    fail_mutations: bool,
    /// False makes GitHub read stale right after a mutation.
    apply_mutations: bool,
    executed: Vec<Operation>,
    fetches: u32,
    cost: u32,
}

#[derive(Clone)]
struct FakeGithub(Arc<Mutex<State>>);

impl FakeGithub {
    fn new() -> Self {
        let fixture = |name: &str| {
            let path = format!("{}/../../fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
            std::fs::read_to_string(path).unwrap()
        };
        let items = ["project_items_page1.json", "project_items_page2.json"]
            .iter()
            .flat_map(|page| decode_project_items(&fixture(page)).unwrap().items)
            .collect();
        Self(Arc::new(Mutex::new(State {
            meta: decode_project_meta(&fixture("project_meta.json")).unwrap(),
            items,
            fail_page: None,
            fail_mutations: false,
            apply_mutations: true,
            executed: Vec::new(),
            fetches: 0,
            cost: 0,
        })))
    }

    fn edit<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        f(&mut self.0.lock().unwrap())
    }

    fn page(&self, n: u32) -> Result<ItemsPage> {
        self.edit(|s| {
            s.cost += 3;
            if s.fail_page == Some(n) {
                return Err(Error::Network(format!("page {n} timed out")));
            }
            let start = (n as usize - 1) * PAGE;
            let end = (start + PAGE).min(s.items.len());
            Ok(ItemsPage {
                items: s.items[start..end].to_vec(),
                next_cursor: (end < s.items.len()).then(|| (n + 1).to_string()),
                total_count: s.items.len() as u32,
            })
        })
    }

    fn server_apply(state: &mut State, operation: &Operation) {
        let index = |items: &[Item], id: &ItemId| items.iter().position(|i| &i.id == id).unwrap();
        match operation {
            Operation::SetSingleSelect {
                item_id,
                field_id,
                option_id,
                ..
            } => {
                let i = index(&state.items, item_id);
                let selects = &mut state.items[i].single_selects;
                selects.retain(|(f, _)| f != field_id);
                selects.push((field_id.clone(), option_id.clone()));
            }
            Operation::ClearFieldValue {
                item_id, field_id, ..
            } => {
                let i = index(&state.items, item_id);
                state.items[i].single_selects.retain(|(f, _)| f != field_id);
            }
            Operation::MoveItemPosition {
                item_id, after_id, ..
            } => {
                let item = state.items.remove(index(&state.items, item_id));
                let at = after_id
                    .as_ref()
                    .map_or(0, |after| index(&state.items, after) + 1);
                state.items.insert(at, item);
            }
        }
    }
}

impl Remote for FakeGithub {
    fn board_page(
        &self,
        _owner: &str,
        _number: u32,
    ) -> impl Future<Output = Result<(ProjectMeta, ItemsPage)>> + Send {
        self.edit(|s| s.fetches += 1);
        let meta = self.edit(|s| s.meta.clone());
        ready(self.page(1).map(|page| (meta, page)))
    }

    fn items_page(
        &self,
        _project: &ProjectId,
        cursor: &str,
    ) -> impl Future<Output = Result<ItemsPage>> + Send {
        ready(self.page(cursor.parse().unwrap()))
    }

    fn execute(&self, operation: &Operation) -> impl Future<Output = Result<()>> + Send {
        ready(self.edit(|s| {
            if s.fail_mutations {
                return Err(Error::GitHub(vec![GraphqlError {
                    kind: Some("NOT_FOUND".into()),
                    message: "Could not resolve to a node".into(),
                }]));
            }
            s.executed.push(operation.clone());
            if s.apply_mutations {
                Self::server_apply(s, operation);
            }
            Ok(())
        }))
    }

    fn usage(&self) -> RateUsage {
        RateUsage {
            cost_total: self.edit(|s| s.cost),
            remaining: Some(4900),
            limit: Some(5000),
            reset_at: None,
        }
    }
}

fn temp_cache(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("planche-sync-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir.join("cache.sqlite")
}

async fn sync_once(cache: &mut Cache, github: &FakeGithub) -> Result<ProjectId> {
    sync::full_sync(cache, github, "@me", 2, |_, _, _| {})
        .await
        .map(|report| report.project)
}

async fn synced(name: &str, github: &FakeGithub) -> (PathBuf, Cache, ProjectId) {
    let path = temp_cache(name);
    let mut cache = Cache::open(&path).unwrap();
    let project = sync_once(&mut cache, github).await.unwrap();
    (path, cache, project)
}

fn server_board(cache: &Cache, project: &ProjectId) -> Board {
    let (meta, items) = cache.snapshot(project).unwrap().unwrap();
    project_board(&meta, None, &items).unwrap()
}

/// Column names and card IDs in order, without the cache's flags and timestamps.
fn layout(board: &Board) -> Vec<(String, Vec<ItemId>)> {
    board
        .columns
        .iter()
        .map(|c| {
            (
                c.name.clone(),
                c.cards.iter().map(|card| card.item_id.clone()).collect(),
            )
        })
        .collect()
}

fn column_of(board: &Board, item: &ItemId) -> String {
    board
        .columns
        .iter()
        .find(|c| c.cards.iter().any(|card| &card.item_id == item))
        .map(|c| c.name.clone())
        .unwrap()
}

/// Moves the first card of the Todo column to `column`.
fn move_todo_card(board: &Board, column: &str) -> Intent {
    let todo = board.columns.iter().find(|c| c.name == "Todo").unwrap();
    let target = intent::find_column(board, column).unwrap();
    Intent::move_card(board, &todo.cards[0].item_id, target, Placement::Keep)
}

#[tokio::test]
async fn a_failure_on_page_2_leaves_the_cache_byte_for_byte() {
    let github = FakeGithub::new();
    let (path, mut cache, _) = synced("page-2", &github).await;
    let files = |path: &Path| {
        ["", "-wal"].map(|suffix| std::fs::read(format!("{}{suffix}", path.display())).unwrap())
    };
    let before = files(&path);

    github.edit(|s| {
        s.items.remove(0);
        s.fail_page = Some(2);
    });
    assert!(sync_once(&mut cache, &github).await.is_err());
    assert_eq!(files(&path), before);
}

#[tokio::test]
async fn an_item_deleted_on_the_server_leaves_the_cache() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("deleted", &github).await;
    let gone = github.edit(|s| s.items.remove(7).id);

    sync_once(&mut cache, &github).await.unwrap();
    let (_, items) = cache.snapshot(&project).unwrap().unwrap();
    assert_eq!(items.len(), 11);
    assert!(items.iter().all(|i| i.id != gone));
}

#[tokio::test]
async fn the_cache_reads_back_what_the_sync_wrote() {
    let github = FakeGithub::new();
    let (_, cache, project) = synced("round-trip", &github).await;
    let (meta, items) = cache.snapshot(&project).unwrap().unwrap();
    github.edit(|s| {
        assert_eq!(items, s.items);
        assert_eq!(meta, s.meta);
    });
    assert_eq!(cache.project_id("@me", 2).unwrap(), Some(project.clone()));
    assert_eq!(cache.project_id("horebz", 2).unwrap(), Some(project));
}

#[tokio::test]
async fn a_pending_move_on_the_old_snapshot_shows_the_new_column() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("pending", &github).await;
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    cache.enqueue(&intent).unwrap();

    let shown = cache.board(&project, None).unwrap().unwrap();
    assert_eq!(column_of(&shown, intent.item_id()), "Done");
    assert_eq!(cache.pending_count(&project).unwrap(), 1);
}

#[tokio::test]
async fn the_same_move_on_an_up_to_date_snapshot_gives_the_same_board() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("up-to-date", &github).await;
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    cache.enqueue(&intent).unwrap();
    // Another client made the same move, and the next sync sees it.
    github.edit(|s| {
        for operation in to_operations(&intent) {
            FakeGithub::server_apply(s, &operation);
        }
    });
    sync_once(&mut cache, &github).await.unwrap();

    let server = server_board(&cache, &project);
    assert_eq!(column_of(&server, intent.item_id()), "Done");
    assert_eq!(
        layout(&cache.board(&project, None).unwrap().unwrap()),
        layout(&server)
    );
}

#[tokio::test]
async fn a_failed_mutation_disappears_and_the_board_returns_to_the_server_state() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("failed", &github).await;
    let server = server_board(&cache, &project);
    cache.enqueue(&move_todo_card(&server, "Done")).unwrap();
    github.edit(|s| s.fail_mutations = true);

    let mut outcomes = Vec::new();
    sync::flush(&mut cache, &github, &project, |sent| outcomes.push(sent))
        .await
        .unwrap();
    assert!(matches!(outcomes.as_slice(), [Sent::Failed(..)]));
    assert_eq!(cache.pending_count(&project).unwrap(), 0);
    assert_eq!(
        layout(&cache.board(&project, None).unwrap().unwrap()),
        layout(&server)
    );
}

#[tokio::test]
async fn a_transient_failure_keeps_the_row_pending() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("transient", &github).await;
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    cache.enqueue(&intent).unwrap();

    let offline = FakeOffline;
    let error = sync::flush(&mut cache, &offline, &project, |_| {}).await;
    assert!(matches!(error, Err(Error::Network(_))));
    assert_eq!(cache.pending_count(&project).unwrap(), 1);
    let shown = cache.board(&project, None).unwrap().unwrap();
    assert_eq!(column_of(&shown, intent.item_id()), "Done");
}

#[tokio::test]
async fn two_pending_moves_of_one_card_merge_and_only_the_last_is_sent() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("merge", &github).await;
    let board = server_board(&cache, &project);
    let first = move_todo_card(&board, "Done");
    let Intent::MoveCard { item_id, .. } = &first;
    cache
        .enqueue(&Intent::move_card(&board, item_id, None, Placement::Top))
        .unwrap();
    cache.enqueue(&first).unwrap();

    let Intent::MoveCard {
        to,
        placement: kept,
        ..
    } = &cache.intents(&project).unwrap()[0];
    assert_eq!(cache.intents(&project).unwrap().len(), 1);
    // The last move's `Keep` inherits the replaced move's `Top`.
    assert_eq!(*kept, Placement::Top);
    sync::flush(&mut cache, &github, &project, |_| {})
        .await
        .unwrap();
    let executed = github.edit(|s| s.executed.clone());
    assert_eq!(executed.len(), 2);
    assert!(matches!(
        &executed[0],
        Operation::SetSingleSelect { option_id, .. } if Some(option_id) == to.as_ref()
    ));
}

#[tokio::test]
async fn an_acked_move_is_replayed_until_the_snapshot_shows_it_or_for_two_syncs() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("acked", &github).await;
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    let shows_done = |cache: &Cache| {
        column_of(
            &cache.board(&project, None).unwrap().unwrap(),
            intent.item_id(),
        ) == "Done"
    };

    // GitHub accepts the mutation but keeps serving the old state.
    github.edit(|s| s.apply_mutations = false);
    cache.enqueue(&intent).unwrap();
    sync::flush(&mut cache, &github, &project, |_| {})
        .await
        .unwrap();
    assert_eq!(cache.pending_count(&project).unwrap(), 0);
    sync_once(&mut cache, &github).await.unwrap();
    assert!(shows_done(&cache), "replayed after the first stale sync");
    sync_once(&mut cache, &github).await.unwrap();
    assert!(!shows_done(&cache), "dropped after the second sync");

    // When the snapshot reflects the move, the first sync retires the row.
    github.edit(|s| s.apply_mutations = true);
    cache.enqueue(&intent).unwrap();
    sync::flush(&mut cache, &github, &project, |_| {})
        .await
        .unwrap();
    sync_once(&mut cache, &github).await.unwrap();
    assert!(cache.intents(&project).unwrap().is_empty());
    assert!(shows_done(&cache));
}

#[tokio::test]
async fn an_older_acked_move_does_not_outlive_a_newer_one_the_snapshot_shows() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("superseded", &github).await;
    let board = server_board(&cache, &project);
    let there = move_todo_card(&board, "Done");
    let back = Intent::move_card(
        &board,
        there.item_id(),
        intent::find_column(&board, "Todo").unwrap(),
        Placement::Keep,
    );
    for intent in [&there, &back] {
        cache.enqueue(intent).unwrap();
        sync::flush(&mut cache, &github, &project, |_| {})
            .await
            .unwrap();
    }

    sync_once(&mut cache, &github).await.unwrap();
    assert!(cache.intents(&project).unwrap().is_empty());
    let shown = cache.board(&project, None).unwrap().unwrap();
    assert_eq!(column_of(&shown, there.item_id()), "Todo");
}

#[tokio::test]
async fn a_row_in_flight_at_startup_is_sent_again_once() {
    let github = FakeGithub::new();
    let (path, mut cache, project) = synced("in-flight", &github).await;
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    cache.enqueue(&intent).unwrap();
    // The process dies between the claim and the ack.
    assert!(cache.claim_next(&project).unwrap().is_some());
    assert!(cache.claim_next(&project).unwrap().is_none());
    drop(cache);

    let engine = sync::spawn(
        Cache::open(&path).unwrap(),
        github.clone(),
        config(SyncInterval::Manual, true),
        Arc::new(SystemClock),
    );
    let mut events = engine.subscribe();
    engine.send(SyncCommand::Now).await;
    let events = until_synced(&mut events).await;
    assert!(
        events
            .iter()
            .any(|e| matches!(e, SyncEvent::MutationOk(m) if m.intent == intent))
    );
    assert_eq!(github.edit(|s| s.executed.clone()), to_operations(&intent));
}

#[tokio::test]
async fn two_connections_write_at_once_without_database_is_locked() {
    let github = FakeGithub::new();
    let (path, cache, project) = synced("locked", &github).await;
    let (meta, items) = cache.snapshot(&project).unwrap().unwrap();
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    drop(cache);

    let writers: Vec<_> = (0..2)
        .map(|n| {
            let (path, meta, items, intent) =
                (path.clone(), meta.clone(), items.clone(), intent.clone());
            std::thread::spawn(move || {
                let mut cache = Cache::open(&path).unwrap();
                for _ in 0..100 {
                    if n == 0 {
                        cache.write_snapshot(&meta, &items, true).unwrap();
                    } else {
                        cache.enqueue(&intent).unwrap();
                    }
                }
            })
        })
        .collect();
    for writer in writers {
        writer.join().unwrap();
    }
}

#[derive(Default)]
struct FakeClock {
    start: Option<(SystemTime, Instant)>,
    /// How long the Mac slept: the wall clock moved, the monotonic clock did not.
    slept: Mutex<Duration>,
    /// Time awake: both clocks moved.
    awake: Mutex<Duration>,
}

impl FakeClock {
    fn new() -> Self {
        Self {
            start: Some((SystemTime::now(), Instant::now())),
            ..Self::default()
        }
    }
}

impl Clock for FakeClock {
    fn wall(&self) -> SystemTime {
        self.start.unwrap().0 + *self.slept.lock().unwrap() + *self.awake.lock().unwrap()
    }

    fn mono(&self) -> Instant {
        self.start.unwrap().1 + *self.awake.lock().unwrap()
    }
}

#[tokio::test(start_paused = true)]
async fn a_wall_clock_jump_longer_than_the_interval_syncs_unless_sync_on_wake_is_off() {
    for sync_on_wake in [true, false] {
        let github = FakeGithub::new();
        let clock = Arc::new(FakeClock::new());
        let engine = sync::spawn(
            Cache::open(temp_cache(&format!("wake-{sync_on_wake}"))).unwrap(),
            github.clone(),
            config(SyncInterval::OneMinute, sync_on_wake),
            clock.clone(),
        );
        let mut events = engine.subscribe();
        engine.send(SyncCommand::Now).await;
        until_synced(&mut events).await;

        *clock.slept.lock().unwrap() = Duration::from_secs(10 * 60);
        let woke = tokio::time::timeout(Duration::from_secs(30), until_synced(&mut events)).await;
        assert_eq!(woke.is_ok(), sync_on_wake, "sync_on_wake = {sync_on_wake}");
        let fetches = if sync_on_wake { 2 } else { 1 };
        assert_eq!(github.edit(|s| s.fetches), fetches);
    }
}

#[tokio::test(start_paused = true)]
async fn focus_syncs_when_the_last_sync_is_older_than_30_s_unless_manual() {
    for (interval, after, expected) in [
        (SyncInterval::FiveMinutes, 10, 1),
        (SyncInterval::FiveMinutes, 31, 2),
        (SyncInterval::Manual, 31, 1),
    ] {
        let github = FakeGithub::new();
        let clock = Arc::new(FakeClock::new());
        let engine = sync::spawn(
            Cache::open(temp_cache(&format!("focus-{interval:?}-{after}"))).unwrap(),
            github.clone(),
            config(interval, true),
            clock.clone(),
        );
        let mut events = engine.subscribe();
        engine.send(SyncCommand::Now).await;
        until_synced(&mut events).await;

        *clock.awake.lock().unwrap() = Duration::from_secs(after);
        engine.send(SyncCommand::Focus).await;
        let synced = tokio::time::timeout(Duration::from_secs(5), until_synced(&mut events)).await;
        let case = format!("{interval:?} after {after} s");
        assert_eq!(synced.is_ok(), expected == 2, "{case}");
        assert_eq!(github.edit(|s| s.fetches), expected, "{case}");
    }
}

#[tokio::test]
async fn flush_sends_the_queue_without_a_sync() {
    let github = FakeGithub::new();
    let (path, cache, project) = synced("flush", &github).await;
    let intent = move_todo_card(&server_board(&cache, &project), "Done");
    drop(cache);
    let engine = sync::spawn(
        Cache::open(&path).unwrap(),
        github.clone(),
        config(SyncInterval::Manual, true),
        Arc::new(SystemClock),
    );
    let mut events = engine.subscribe();
    Cache::open(&path).unwrap().enqueue(&intent).unwrap();
    engine.send(SyncCommand::Flush).await;
    loop {
        match events.recv().await.unwrap() {
            SyncEvent::MutationOk(m) => {
                assert_eq!(m.intent, intent);
                break;
            }
            SyncEvent::Synced { .. } => panic!("Flush must not sync"),
            _ => {}
        }
    }
    assert_eq!(github.edit(|s| s.fetches), 1, "only the first sync fetched");
    assert_eq!(github.edit(|s| s.executed.clone()), to_operations(&intent));
}

fn config(interval: SyncInterval, sync_on_wake: bool) -> SyncConfig {
    SyncConfig {
        owner: "@me".into(),
        number: 2,
        interval,
        sync_on_wake,
    }
}

/// The events up to and including the next `Synced`. Fails on `SyncFailed`.
async fn until_synced(events: &mut broadcast::Receiver<SyncEvent>) -> Vec<SyncEvent> {
    let mut seen = Vec::new();
    loop {
        let event = events.recv().await.unwrap();
        if let SyncEvent::SyncFailed { error, .. } = &event {
            panic!("sync failed: {error}");
        }
        let done = matches!(event, SyncEvent::Synced { .. });
        seen.push(event);
        if done {
            return seen;
        }
    }
}

/// GitHub unreachable.
struct FakeOffline;

impl Remote for FakeOffline {
    fn board_page(
        &self,
        _owner: &str,
        _number: u32,
    ) -> impl Future<Output = Result<(ProjectMeta, ItemsPage)>> + Send {
        ready(Err(Error::Network("offline".into())))
    }

    fn items_page(
        &self,
        _project: &ProjectId,
        _cursor: &str,
    ) -> impl Future<Output = Result<ItemsPage>> + Send {
        ready(Err(Error::Network("offline".into())))
    }

    fn execute(&self, _operation: &Operation) -> impl Future<Output = Result<()>> + Send {
        ready(Err(Error::Network("offline".into())))
    }

    fn usage(&self) -> RateUsage {
        RateUsage::default()
    }
}

#[tokio::test]
async fn the_board_flags_pending_cards_and_cards_the_last_sync_changed() {
    let github = FakeGithub::new();
    let (_, mut cache, project) = synced("flags", &github).await;
    let flagged = |cache: &Cache| {
        let board = cache.board(&project, None).unwrap().unwrap();
        let cards: Vec<_> = board.columns.into_iter().flat_map(|c| c.cards).collect();
        let ids = |f: fn(&planche_core::domain::Card) -> bool| {
            cards
                .iter()
                .filter(|c| f(c))
                .map(|c| c.item_id.clone())
                .collect::<Vec<_>>()
        };
        (
            ids(|c| c.pending),
            ids(|c| c.updated_by_sync),
            board.pending_count,
        )
    };
    assert_eq!(
        flagged(&cache),
        (vec![], vec![], 0),
        "nothing after the first sync"
    );

    let board = server_board(&cache, &project);
    let local = move_todo_card(&board, "Done");
    cache.enqueue(&local).unwrap();
    assert_eq!(flagged(&cache), (vec![local.item_id().clone()], vec![], 1));

    // Someone else retitles another card on github.com.
    let remote = github.edit(|s| {
        let item = s
            .items
            .iter_mut()
            .find(|i| &i.id != local.item_id())
            .unwrap();
        if let planche_core::domain::ItemContent::Issue { title, .. } = &mut item.content {
            title.push_str(" (edited)");
        }
        item.updated_at = "2026-10-15T00:00:00Z".into();
        item.id.clone()
    });
    sync_once(&mut cache, &github).await.unwrap();
    assert_eq!(
        flagged(&cache),
        (vec![local.item_id().clone()], vec![remote], 1)
    );
}
