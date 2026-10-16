//! The SQLite cache. It keeps two things apart: the last known server state, and the queue
//! of user intents GitHub has not confirmed yet. The displayed board is the first with the
//! second replayed on top.
//!
//! Only the sync engine writes the server tables (`write_snapshot`). A user action only
//! inserts into `pending_mutation` (`enqueue`), and the sender updates and deletes its rows.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};

use crate::board::{self, project_board};
use crate::domain::{
    Board, ContentId, Field, FieldId, IssueState, Item, ItemContent, ItemId, Label, OptionId,
    OwnerProjects, ProjectId, ProjectList, ProjectMeta, ProjectSummary, PullRequestState,
    SelectOption, User, UserId, View, ViewId, ViewLayout,
};
use crate::error::{Error, Result};
use crate::intent::{self, Intent, Placement};

const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_init.sql")];

/// An acked row stays replayed until the snapshot reflects it, or for this many syncs.
/// Phase 2 saw 0 stale reads in 20 reads right after a move, so 2 is a safety margin.
const ACKED_SYNCS: i64 = 2;

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

pub struct Cache {
    conn: Connection,
}

/// A queued intent and its `pending_mutation.seq`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mutation {
    pub seq: i64,
    pub intent: Intent,
}

impl Cache {
    /// `PLANCHE_CACHE`, else `~/Library/Application Support/dev.planche.app/cache.sqlite`.
    pub fn default_path() -> Result<PathBuf> {
        if let Some(path) = std::env::var_os("PLANCHE_CACHE").filter(|p| !p.is_empty()) {
            return Ok(path.into());
        }
        let home =
            std::env::var_os("HOME").ok_or_else(|| Error::Cache("HOME is not set".into()))?;
        Ok(PathBuf::from(home).join("Library/Application Support/dev.planche.app/cache.sqlite"))
    }

    pub fn open_default() -> Result<Self> {
        Self::open(Self::default_path()?)
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| Error::Cache(e.to_string()))?;
        }
        let mut conn = Connection::open(path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut conn)?;
        Ok(Self { conn })
    }

    pub fn get(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM kv WHERE key = ?1", [key], |r| r.get(0))
            .optional()?)
    }

    pub fn set(&self, key: &str, value: &str) -> Result<()> {
        set_kv(&self.conn, key, value)
    }

    /// The cached project `<owner>/<number>`, where `@me` is the viewer of the last sync.
    pub fn project_id(&self, owner: &str, number: u32) -> Result<Option<ProjectId>> {
        let owner = match owner {
            "@me" => match self.get("viewer_login")? {
                Some(login) => login,
                None => return Ok(None),
            },
            owner => owner.to_owned(),
        };
        Ok(self
            .conn
            .query_row(
                "SELECT id FROM project WHERE owner_login = ?1 COLLATE NOCASE AND number = ?2",
                params![owner, number],
                |r| r.get(0),
            )
            .optional()?
            .map(ProjectId))
    }

    /// When the last full sync of the project finished, in UTC.
    pub fn synced_at(&self, project: &ProjectId) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT items_synced_at FROM project WHERE id = ?1",
                [project.as_str()],
                |r| r.get(0),
            )
            .optional()?
            .flatten())
    }

    /// The board as displayed: the snapshot with every queued intent replayed in order.
    pub fn board(&self, project: &ProjectId, view: Option<u32>) -> Result<Option<Board>> {
        let Some((meta, items)) = self.snapshot(project)? else {
            return Ok(None);
        };
        let mut board = board::project(&meta, view, &items, &self.intents(project)?)?;
        let unacked: Vec<ItemId> = {
            let mut statement = self.conn.prepare_cached(
                "SELECT DISTINCT item_id FROM pending_mutation
                 WHERE project_id = ?1 AND status IN ('pending', 'in_flight', 'unknown')",
            )?;
            statement
                .query_map([project.as_str()], |r| r.get(0).map(ItemId))?
                .collect::<rusqlite::Result<_>>()?
        };
        let changed: Vec<ItemId> = match self.get(&changed_key(project))? {
            Some(json) => serde_json::from_str(&json).map_err(|e| Error::Cache(e.to_string()))?,
            None => Vec::new(),
        };
        for card in board.columns.iter_mut().flat_map(|c| &mut c.cards) {
            card.pending = unacked.contains(&card.item_id);
            card.updated_by_sync = changed.contains(&card.item_id);
        }
        board.pending_count = self.pending_count(project)?;
        board.synced_at = self.synced_at(project)?;
        Ok(Some(board))
    }

    /// The owner login and number of a cached project.
    pub fn project_ref(&self, project: &ProjectId) -> Result<Option<(String, u32)>> {
        Ok(self
            .conn
            .query_row(
                "SELECT owner_login, number FROM project WHERE id = ?1",
                [project.as_str()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?)
    }

    /// The cached projects by owner, for a project list without the network.
    pub fn projects(&self) -> Result<ProjectList> {
        let mut statement = self.conn.prepare_cached(
            "SELECT id, owner_login, owner_kind, number, title, url, closed FROM project
             ORDER BY owner_kind = 'org', owner_login COLLATE NOCASE, number",
        )?;
        let mut owners: Vec<OwnerProjects> = Vec::new();
        for row in statement.query_map([], |r| {
            Ok((
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)? == "org",
                ProjectSummary {
                    id: ProjectId(r.get(0)?),
                    number: r.get(3)?,
                    title: r.get(4)?,
                    url: r.get(5)?,
                    closed: r.get(6)?,
                },
            ))
        })? {
            let (login, is_org, project) = row?;
            match owners.last_mut() {
                Some(owner) if owner.login == login => owner.projects.push(project),
                _ => owners.push(OwnerProjects {
                    login,
                    is_org,
                    projects: vec![project],
                }),
            }
        }
        Ok(ProjectList {
            owners,
            sso_blocked: Vec::new(),
        })
    }

    /// The last known server state of the project.
    pub fn snapshot(&self, project: &ProjectId) -> Result<Option<(ProjectMeta, Vec<Item>)>> {
        let Some(meta) = self.meta(project)? else {
            return Ok(None);
        };
        Ok(Some((meta, self.items(project)?)))
    }

    /// Every queued intent of the project in order, sent or not.
    pub fn intents(&self, project: &ProjectId) -> Result<Vec<Intent>> {
        let mut statement = self.conn.prepare_cached(
            "SELECT intent FROM pending_mutation WHERE project_id = ?1 ORDER BY seq",
        )?;
        let rows = statement.query_map([project.as_str()], |r| r.get::<_, String>(0))?;
        rows.map(|json| decode_intent(&json?)).collect()
    }

    /// Queued intents of the project that GitHub has not acknowledged yet.
    pub fn pending_count(&self, project: &ProjectId) -> Result<u32> {
        Ok(self.conn.query_row(
            "SELECT count(*) FROM pending_mutation
             WHERE project_id = ?1 AND status IN ('pending', 'in_flight', 'unknown')",
            [project.as_str()],
            |r| r.get(0),
        )?)
    }

    /// Queues a user action. A `MoveCard` replaces a `MoveCard` still pending on the same
    /// card, so only the last one is sent. A `Keep` placement inherits the replaced one's.
    pub fn enqueue(&mut self, intent: &Intent) -> Result<i64> {
        let (project_id, item_id) = (intent.project_id(), intent.item_id());
        let tx = self.write()?;
        let mut intent = intent.clone();
        if let Intent::MoveCard { placement, .. } = &mut intent {
            const PENDING_MOVES: &str = "FROM pending_mutation
                WHERE project_id = ?1 AND item_id = ?2 AND status = 'pending'
                AND json_extract(intent, '$.type') = 'move_card'";
            let replaced: Option<String> = tx
                .query_row(
                    &format!("SELECT intent {PENDING_MOVES} ORDER BY seq DESC LIMIT 1"),
                    [project_id.as_str(), item_id.as_str()],
                    |r| r.get(0),
                )
                .optional()?;
            if let (Some(replaced), Placement::Keep) = (replaced, &placement)
                && let Intent::MoveCard {
                    placement: previous,
                    ..
                } = decode_intent(&replaced)?
            {
                *placement = previous;
            }
            tx.execute(
                &format!("DELETE {PENDING_MOVES}"),
                [project_id.as_str(), item_id.as_str()],
            )?;
        }
        tx.execute(
            &format!(
                "INSERT INTO pending_mutation (project_id, item_id, intent, created_at)
                 VALUES (?1, ?2, ?3, {NOW})"
            ),
            params![
                project_id.as_str(),
                item_id.as_str(),
                encode_intent(&intent)
            ],
        )?;
        let seq = tx.last_insert_rowid();
        tx.commit()?;
        Ok(seq)
    }

    /// Puts rows a dead process left in flight back in the queue. Sending a move or an
    /// assignment twice converges. A `CreateDraft` is not idempotent: it waits as `unknown`
    /// for the next snapshot, which shows whether GitHub created the draft.
    pub fn reset_in_flight(&self) -> Result<usize> {
        Ok(self.conn.execute(
            "UPDATE pending_mutation
             SET status = CASE json_extract(intent, '$.type')
                 WHEN 'create_draft' THEN 'unknown' ELSE 'pending' END
             WHERE status = 'in_flight'",
            [],
        )?)
    }

    /// Marks the oldest pending row of the project in flight and returns it. The update only
    /// matches a pending row, so two processes never claim the same one.
    pub fn claim_next(&self, project: &ProjectId) -> Result<Option<Mutation>> {
        loop {
            let Some((seq, json)) = self
                .conn
                .query_row(
                    "SELECT seq, intent FROM pending_mutation
                     WHERE project_id = ?1 AND status = 'pending' ORDER BY seq LIMIT 1",
                    [project.as_str()],
                    |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
                )
                .optional()?
            else {
                return Ok(None);
            };
            let claimed = self.conn.execute(
                "UPDATE pending_mutation SET status = 'in_flight', attempts = attempts + 1
                 WHERE seq = ?1 AND status = 'pending'",
                [seq],
            )?;
            if claimed == 1 {
                return Ok(Some(Mutation {
                    seq,
                    intent: decode_intent(&json)?,
                }));
            }
        }
    }

    /// GitHub accepted the row. It stays replayed until a snapshot reflects it.
    pub fn ack(&self, seq: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE pending_mutation SET status = 'acked', acked_at_sync = 0, last_error = NULL
             WHERE seq = ?1",
            [seq],
        )?;
        Ok(())
    }

    /// A transient failure: the row goes back in the queue.
    pub fn release(&self, seq: i64, error: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE pending_mutation SET status = 'pending', last_error = ?2 WHERE seq = ?1",
            params![seq, error],
        )?;
        Ok(())
    }

    /// A definitive failure: dropping the row is the rollback, the replay gives the server state.
    pub fn remove(&self, seq: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM pending_mutation WHERE seq = ?1", [seq])?;
        Ok(())
    }

    /// Replaces the project's server state with a full fetch, in one transaction, then
    /// retires the acked rows the new snapshot reflects. Only the sync engine calls it.
    /// `viewer` is true when the fetch asked for `@me`, so `@me` resolves offline.
    pub fn write_snapshot(
        &mut self,
        meta: &ProjectMeta,
        items: &[Item],
        viewer: bool,
    ) -> Result<()> {
        let before: HashMap<ItemId, Item> = self
            .items(&meta.id)?
            .into_iter()
            .map(|i| (i.id.clone(), i))
            .collect();
        let tx = self.write()?;
        let project = meta.id.as_str();
        // A project deleted and recreated under the same number has a new ID.
        tx.execute(
            "DELETE FROM project WHERE owner_login = ?1 COLLATE NOCASE AND number = ?2 AND id <> ?3",
            params![meta.owner, meta.number, project],
        )?;
        tx.execute(
            &format!(
                "INSERT INTO project (id, owner_login, owner_kind, number, title, url, updated_at,
                                      meta_synced_at, items_synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, {NOW}, {NOW})
                 ON CONFLICT (id) DO UPDATE SET
                   owner_login = excluded.owner_login, owner_kind = excluded.owner_kind,
                   number = excluded.number, title = excluded.title, url = excluded.url,
                   updated_at = excluded.updated_at, meta_synced_at = excluded.meta_synced_at,
                   items_synced_at = excluded.items_synced_at"
            ),
            params![
                project,
                meta.owner,
                if meta.owner_is_org { "org" } else { "user" },
                meta.number,
                meta.title,
                meta.url,
                meta.updated_at,
            ],
        )?;
        // ponytail: delete and reinsert instead of a per-row upsert. Same end state, and the
        // cascades clear values, assignees and labels. Fine at 1000 items.
        for table in ["item", "view", "field"] {
            tx.execute(
                &format!("DELETE FROM {table} WHERE project_id = ?1"),
                [project],
            )?;
        }
        write_meta(&tx, meta)?;
        write_items(&tx, meta, items)?;
        if viewer {
            set_kv(&tx, "viewer_login", &meta.owner)?;
        }
        // Our own acked moves come back in this snapshot. They are not news from the server.
        let acked: Vec<ItemId> = tx
            .prepare_cached(
                "SELECT item_id FROM pending_mutation
                 WHERE project_id = ?1 AND status = 'acked' AND item_id IS NOT NULL",
            )?
            .query_map([project], |r| r.get(0).map(ItemId))?
            .collect::<rusqlite::Result<_>>()?;
        let changed: Vec<&ItemId> = if before.is_empty() {
            Vec::new()
        } else {
            items
                .iter()
                .filter(|i| before.get(&i.id) != Some(*i) && !acked.contains(&i.id))
                .map(|i| &i.id)
                .collect()
        };
        set_kv(
            &tx,
            &changed_key(&meta.id),
            &serde_json::to_string(&changed).expect("ids serialize"),
        )?;
        settle_acked(&tx, &meta.id, project_board(meta, None, items).ok())?;
        tx.commit()?;
        Ok(())
    }

    /// `BEGIN IMMEDIATE`, so a writer waits on `busy_timeout` instead of failing on upgrade.
    fn write(&mut self) -> Result<Transaction<'_>> {
        Ok(self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?)
    }

    /// The cached metadata of the project: fields, options and views.
    pub fn meta(&self, project: &ProjectId) -> Result<Option<ProjectMeta>> {
        let id = project.as_str();
        let Some(mut meta) = self
            .conn
            .query_row(
                "SELECT number, title, url, owner_login, owner_kind, updated_at
                 FROM project WHERE id = ?1",
                [id],
                |r| {
                    Ok(ProjectMeta {
                        id: project.clone(),
                        number: r.get(0)?,
                        title: r.get(1)?,
                        url: r.get(2)?,
                        owner: r.get(3)?,
                        owner_is_org: r.get::<_, String>(4)? == "org",
                        updated_at: r.get(5)?,
                        fields: Vec::new(),
                        views: Vec::new(),
                    })
                },
            )
            .optional()?
        else {
            return Ok(None);
        };

        let mut options: HashMap<String, Vec<SelectOption>> = HashMap::new();
        let mut statement = self.conn.prepare_cached(
            "SELECT o.field_id, o.id, o.name, o.color FROM field_option o
             JOIN field f ON f.id = o.field_id WHERE f.project_id = ?1 ORDER BY o.position",
        )?;
        for row in statement.query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                SelectOption {
                    id: OptionId(r.get(1)?),
                    name: r.get(2)?,
                    color: r.get(3)?,
                },
            ))
        })? {
            let (field, option) = row?;
            options.entry(field).or_default().push(option);
        }

        let mut statement = self.conn.prepare_cached(
            "SELECT id, name, data_type FROM field WHERE project_id = ?1 ORDER BY position",
        )?;
        meta.fields = statement
            .query_map([id], |r| {
                let id: String = r.get(0)?;
                let data_type: String = r.get(2)?;
                let single_select = data_type == "SINGLE_SELECT";
                Ok(Field {
                    options: single_select.then(|| options.remove(&id).unwrap_or_default()),
                    id: FieldId(id),
                    name: r.get(1)?,
                    data_type,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;

        let mut statement = self.conn.prepare_cached(
            "SELECT id, number, name, layout, filter, column_field_id, manual_order FROM view
             WHERE project_id = ?1 ORDER BY rowid",
        )?;
        meta.views = statement
            .query_map([id], |r| {
                let layout = match r.get::<_, String>(3)?.as_str() {
                    "BOARD_LAYOUT" => ViewLayout::Board,
                    "TABLE_LAYOUT" => ViewLayout::Table,
                    _ => ViewLayout::Roadmap,
                };
                Ok(View {
                    id: ViewId(r.get(0)?),
                    number: r.get(1)?,
                    name: r.get(2)?,
                    layout,
                    filter: r.get(4)?,
                    group_by: r.get::<_, Option<String>>(5)?.map(FieldId),
                    manual_order: r.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(Some(meta))
    }

    fn items(&self, project: &ProjectId) -> Result<Vec<Item>> {
        let id = project.as_str();
        let mut statement = self.conn.prepare_cached(
            "SELECT id, kind, content_id, title, number, url, repo, state, is_draft_pr,
                    is_archived, updated_at
             FROM item WHERE project_id = ?1 ORDER BY position",
        )?;
        let mut rows: Vec<ItemRow> = statement
            .query_map([id], |r| {
                Ok(ItemRow {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    content_id: r.get(2)?,
                    title: r.get(3)?,
                    number: r.get(4)?,
                    url: r.get(5)?,
                    repo: r.get(6)?,
                    state: r.get(7)?,
                    is_draft_pr: r.get(8)?,
                    archived: r.get(9)?,
                    updated_at: r.get(10)?,
                    single_selects: Vec::new(),
                    assignees: Vec::new(),
                    labels: Vec::new(),
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        let index: HashMap<String, usize> = rows
            .iter()
            .enumerate()
            .map(|(i, row)| (row.id.clone(), i))
            .collect();

        let mut statement = self.conn.prepare_cached(
            "SELECT v.item_id, v.field_id, v.option_id FROM item_field_value v
             JOIN item i ON i.id = v.item_id
             WHERE i.project_id = ?1 AND v.option_id IS NOT NULL ORDER BY v.rowid",
        )?;
        for row in
            statement.query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?)))?
        {
            let (item, field, option) = row?;
            rows[index[&item]]
                .single_selects
                .push((FieldId(field), OptionId(option)));
        }

        let mut statement = self.conn.prepare_cached(
            "SELECT a.item_id, u.id, u.login, u.avatar_url FROM item_assignee a
             JOIN item i ON i.id = a.item_id JOIN gh_user u ON u.id = a.user_id
             WHERE i.project_id = ?1 ORDER BY a.rowid",
        )?;
        for row in statement.query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                User {
                    id: UserId(r.get(1)?),
                    login: r.get(2)?,
                    avatar_url: r.get(3)?,
                },
            ))
        })? {
            let (item, user) = row?;
            rows[index[&item]].assignees.push(user);
        }

        let mut statement = self.conn.prepare_cached(
            "SELECT l.item_id, l.name, l.color FROM item_label l
             JOIN item i ON i.id = l.item_id WHERE i.project_id = ?1 ORDER BY l.rowid",
        )?;
        for row in statement.query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                Label {
                    name: r.get(1)?,
                    color: r.get(2)?,
                },
            ))
        })? {
            let (item, label) = row?;
            rows[index[&item]].labels.push(label);
        }

        rows.into_iter().map(ItemRow::into_item).collect()
    }
}

fn migrate(conn: &mut Connection) -> Result<()> {
    let version = |conn: &Connection| -> Result<usize> {
        let version: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        Ok(version as usize)
    };
    if version(conn)? >= MIGRATIONS.len() {
        return Ok(());
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    // Another process may have migrated while this one waited for the lock.
    for (sql, next) in MIGRATIONS.iter().zip(1u32..).skip(version(&tx)?) {
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", next)?;
    }
    tx.commit()?;
    Ok(())
}

/// The `kv` key holding the item IDs the last sync of `project` changed.
fn changed_key(project: &ProjectId) -> String {
    format!("changed:{project}")
}

fn set_kv(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO kv (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

fn write_meta(tx: &Transaction, meta: &ProjectMeta) -> Result<()> {
    let project = meta.id.as_str();
    let mut field = tx.prepare_cached(
        "INSERT INTO field (id, project_id, name, data_type, position) VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;
    let mut option = tx.prepare_cached(
        "INSERT INTO field_option (field_id, id, name, color, position) VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;
    for (position, f) in (0u32..).zip(&meta.fields) {
        field.execute(params![
            f.id.as_str(),
            project,
            f.name,
            f.data_type,
            position
        ])?;
        for (position, o) in (0u32..).zip(f.options.iter().flatten()) {
            option.execute(params![
                f.id.as_str(),
                o.id.as_str(),
                o.name,
                o.color,
                position
            ])?;
        }
    }
    let mut view = tx.prepare_cached(
        "INSERT INTO view (id, project_id, number, name, layout, filter, column_field_id, manual_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;
    for v in &meta.views {
        let layout = match v.layout {
            ViewLayout::Board => "BOARD_LAYOUT",
            ViewLayout::Table => "TABLE_LAYOUT",
            ViewLayout::Roadmap => "ROADMAP_LAYOUT",
        };
        // The foreign key needs a field the fetch returned.
        let group_by = v
            .group_by
            .as_ref()
            .filter(|id| meta.fields.iter().any(|f| &f.id == *id))
            .map(FieldId::as_str);
        view.execute(params![
            v.id.as_str(),
            project,
            v.number,
            v.name,
            layout,
            v.filter,
            group_by,
            v.manual_order
        ])?;
    }
    Ok(())
}

fn write_items(tx: &Transaction, meta: &ProjectMeta, items: &[Item]) -> Result<()> {
    let mut item = tx.prepare_cached(&format!(
        "INSERT INTO item (id, project_id, position, kind, content_id, title, number, url, repo,
                           state, is_draft_pr, is_archived, updated_at, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, {NOW})"
    ))?;
    let mut value = tx.prepare_cached(
        "INSERT INTO item_field_value (item_id, field_id, option_id) VALUES (?1, ?2, ?3)",
    )?;
    let mut user = tx.prepare_cached(
        "INSERT INTO gh_user (id, login, avatar_url) VALUES (?1, ?2, ?3)
         ON CONFLICT (id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url",
    )?;
    let mut assignee =
        tx.prepare_cached("INSERT INTO item_assignee (item_id, user_id) VALUES (?1, ?2)")?;
    let mut label =
        tx.prepare_cached("INSERT INTO item_label (item_id, name, color) VALUES (?1, ?2, ?3)")?;

    for (position, i) in (0u32..).zip(items) {
        let id = i.id.as_str();
        let (kind, content_id, number, url, repo, state, is_draft, assignees, labels) =
            match &i.content {
                ItemContent::Draft { id, assignees, .. } => (
                    "DRAFT_ISSUE",
                    Some(id),
                    None,
                    None,
                    None,
                    None,
                    false,
                    &assignees[..],
                    &[][..],
                ),
                ItemContent::Issue {
                    id,
                    number,
                    url,
                    repo,
                    state,
                    assignees,
                    labels,
                    ..
                } => (
                    "ISSUE",
                    Some(id),
                    Some(number),
                    Some(url),
                    Some(repo),
                    Some(match state {
                        IssueState::Open => "OPEN",
                        IssueState::Closed => "CLOSED",
                    }),
                    false,
                    &assignees[..],
                    &labels[..],
                ),
                ItemContent::PullRequest {
                    id,
                    number,
                    url,
                    repo,
                    state,
                    is_draft,
                    assignees,
                    labels,
                    ..
                } => (
                    "PULL_REQUEST",
                    Some(id),
                    Some(number),
                    Some(url),
                    Some(repo),
                    Some(match state {
                        PullRequestState::Open => "OPEN",
                        PullRequestState::Closed => "CLOSED",
                        PullRequestState::Merged => "MERGED",
                    }),
                    *is_draft,
                    &assignees[..],
                    &labels[..],
                ),
                ItemContent::Redacted => (
                    "REDACTED",
                    None,
                    None,
                    None,
                    None,
                    None,
                    false,
                    &[][..],
                    &[][..],
                ),
            };
        let title = match i.content {
            ItemContent::Redacted => "",
            ref content => content.title(),
        };
        item.execute(params![
            id,
            meta.id.as_str(),
            position,
            kind,
            content_id.map(ContentId::as_str),
            title,
            number,
            url,
            repo,
            state,
            is_draft,
            i.archived,
            i.updated_at,
        ])?;
        // ponytail: single-select values only, the only kind the domain carries. Text,
        // number, date and iteration values come with the phase that shows them.
        for (field, option) in &i.single_selects {
            if meta.fields.iter().any(|f| &f.id == field) {
                value.execute(params![id, field.as_str(), option.as_str()])?;
            }
        }
        for u in assignees {
            user.execute(params![u.id.as_str(), u.login, u.avatar_url])?;
            assignee.execute(params![id, u.id.as_str()])?;
        }
        for l in labels {
            label.execute(params![id, l.name, l.color])?;
        }
    }
    Ok(())
}

/// Counts one more sync for each acked row, and deletes those that reached `ACKED_SYNCS`
/// or that the snapshot reflects. An intent is reflected when replaying it changes nothing.
/// A reflected row also retires the older acked rows on its card, which it supersedes.
fn settle_acked(tx: &Transaction, project: &ProjectId, server: Option<Board>) -> Result<()> {
    let acked: Vec<(i64, String, i64)> = tx
        .prepare_cached(
            "SELECT seq, intent, acked_at_sync FROM pending_mutation
             WHERE project_id = ?1 AND status = 'acked' ORDER BY seq",
        )?
        .query_map([project.as_str()], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let intents = acked
        .iter()
        .map(|(_, json, _)| decode_intent(json))
        .collect::<Result<Vec<_>>>()?;
    let reflected: Vec<bool> = intents
        .iter()
        .map(|intent| {
            server
                .as_ref()
                .is_some_and(|board| intent::apply(board.clone(), intent) == *board)
        })
        .collect();
    for (k, ((seq, _, syncs), intent)) in acked.iter().zip(&intents).enumerate() {
        let settled = (k..intents.len())
            .any(|later| reflected[later] && intents[later].item_id() == intent.item_id());
        if settled || syncs + 1 >= ACKED_SYNCS {
            tx.execute("DELETE FROM pending_mutation WHERE seq = ?1", [seq])?;
        } else {
            tx.execute(
                "UPDATE pending_mutation SET acked_at_sync = ?2 WHERE seq = ?1",
                [*seq, syncs + 1],
            )?;
        }
    }
    // A draft a dead process left in flight: done when the snapshot shows it, else sent again.
    let unknown: Vec<(i64, String)> = tx
        .prepare_cached(
            "SELECT seq, intent FROM pending_mutation WHERE project_id = ?1 AND status = 'unknown'",
        )?
        .query_map([project.as_str()], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    for (seq, json) in unknown {
        let intent = decode_intent(&json)?;
        let created = server
            .as_ref()
            .is_some_and(|board| intent::apply(board.clone(), &intent) == *board);
        tx.execute(
            if created {
                "DELETE FROM pending_mutation WHERE seq = ?1"
            } else {
                "UPDATE pending_mutation SET status = 'pending' WHERE seq = ?1"
            },
            [seq],
        )?;
    }
    Ok(())
}

fn encode_intent(intent: &Intent) -> String {
    serde_json::to_string(intent).expect("an intent serializes")
}

fn decode_intent(json: &str) -> Result<Intent> {
    serde_json::from_str(json).map_err(|e| Error::Cache(format!("bad intent {json}: {e}")))
}

struct ItemRow {
    id: String,
    kind: String,
    content_id: Option<String>,
    title: String,
    number: Option<u32>,
    url: Option<String>,
    repo: Option<String>,
    state: Option<String>,
    is_draft_pr: bool,
    archived: bool,
    updated_at: String,
    single_selects: Vec<(FieldId, OptionId)>,
    assignees: Vec<User>,
    labels: Vec<Label>,
}

impl ItemRow {
    fn into_item(self) -> Result<Item> {
        let missing = |column: &str| Error::Cache(format!("item {} has no {column}", self.id));
        let content_id = || {
            self.content_id
                .clone()
                .map(ContentId)
                .ok_or_else(|| missing("content_id"))
        };
        let number = || self.number.ok_or_else(|| missing("number"));
        let url = || self.url.clone().ok_or_else(|| missing("url"));
        let repo = || self.repo.clone().ok_or_else(|| missing("repo"));
        let content = match self.kind.as_str() {
            "DRAFT_ISSUE" => ItemContent::Draft {
                id: content_id()?,
                title: self.title.clone(),
                assignees: self.assignees.clone(),
            },
            "ISSUE" => ItemContent::Issue {
                id: content_id()?,
                number: number()?,
                title: self.title.clone(),
                url: url()?,
                repo: repo()?,
                state: match self.state.as_deref() {
                    Some("CLOSED") => IssueState::Closed,
                    _ => IssueState::Open,
                },
                assignees: self.assignees.clone(),
                labels: self.labels.clone(),
            },
            "PULL_REQUEST" => ItemContent::PullRequest {
                id: content_id()?,
                number: number()?,
                title: self.title.clone(),
                url: url()?,
                repo: repo()?,
                state: match self.state.as_deref() {
                    Some("CLOSED") => PullRequestState::Closed,
                    Some("MERGED") => PullRequestState::Merged,
                    _ => PullRequestState::Open,
                },
                is_draft: self.is_draft_pr,
                assignees: self.assignees.clone(),
                labels: self.labels.clone(),
            },
            _ => ItemContent::Redacted,
        };
        Ok(Item {
            id: ItemId(self.id),
            archived: self.archived,
            updated_at: self.updated_at,
            single_selects: self.single_selects,
            content,
        })
    }
}
