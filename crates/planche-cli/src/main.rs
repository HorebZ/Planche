use std::io::{BufRead, IsTerminal};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use clap::{Parser, Subcommand};
use planche_core::cache::Cache;
use planche_core::domain::{Board, ItemContent, ProjectId, ProjectList, RateUsage};
use planche_core::github::{GithubClient, ops};
use planche_core::intent::{self, Intent, Placement};
use planche_core::sync::{
    self, Sent, SyncCommand, SyncConfig, SyncEvent, SyncInterval, SystemClock,
};
use planche_core::{Error, auth};
use serde::Serialize;
use tokio::sync::broadcast::error::RecvError;

/// GitHub Projects from the terminal.
#[derive(Parser)]
#[command(name = "planche", version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Store and check the GitHub token
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    /// List the projects the token can see
    Projects {
        /// Only this owner's projects (`@me` for yourself)
        #[arg(long)]
        owner: Option<String>,
    },
    /// Print a project board from the cache, then refresh it from GitHub
    Board {
        /// The project, as `<owner>/<number>` (`@me/<number>` for yours)
        project: String,
        /// Use this board view's columns instead of the first board view
        #[arg(long)]
        view: Option<u32>,
        /// Print the board as JSON
        #[arg(long)]
        json: bool,
        /// Print the cached board without calling GitHub
        #[arg(long)]
        offline: bool,
    },
    /// Move a card to a column, keeping its position unless `--top` or `--after` is given
    Move {
        /// The project, as `<owner>/<number>` (`@me/<number>` for yours)
        project: String,
        /// The card: `#123`, `repo#123`, an item ID, or the start of its title
        item: String,
        /// The column name, or `none` to clear the field
        column: String,
        /// Put the card at the top of the column
        #[arg(long, conflicts_with = "after")]
        top: bool,
        /// Put the card right after this one, named like `item`
        #[arg(long)]
        after: Option<String>,
    },
    /// Send queued moves and refresh the cache
    Sync {
        /// The project, as `<owner>/<number>` (`@me/<number>` for yours)
        project: String,
        /// Keep running, and sync on the interval
        #[arg(long)]
        watch: bool,
        /// 1m, 5m, 15m or manual. Defaults to the `sync_interval` setting, else 5m
        #[arg(long)]
        interval: Option<SyncInterval>,
    },
}

#[derive(Subcommand)]
enum AuthCommand {
    /// Read a classic personal access token from stdin and store it in the keychain
    Login,
}

enum Failure {
    Usage(String),
    Core(Error),
    /// Already reported.
    Exit(u8),
}

impl From<Error> for Failure {
    fn from(error: Error) -> Self {
        Self::Core(error)
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    match run(Cli::parse().command).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(Failure::Usage(message)) => {
            eprintln!("error: {message}");
            ExitCode::from(2)
        }
        Err(Failure::Core(error)) => {
            eprintln!("error: {error}");
            ExitCode::from(exit_code(&error))
        }
        Err(Failure::Exit(code)) => ExitCode::from(code),
    }
}

fn exit_code(error: &Error) -> u8 {
    match error {
        Error::Network(_) => 3,
        Error::NotSignedIn
        | Error::Unauthorized
        | Error::MissingScopes(_)
        | Error::ClassicTokenRequired
        | Error::ProjectNotFound { .. }
        | Error::ViewNotFound(_)
        | Error::ViewNotBoard(_)
        | Error::NoStatusField
        | Error::UnsupportedColumnField(_)
        | Error::CardNotFound(_)
        | Error::AmbiguousCard { .. }
        | Error::UnknownColumn { .. }
        | Error::NotCached { .. } => 2,
        _ => 1,
    }
}

async fn run(command: Command) -> Result<(), Failure> {
    match command {
        Command::Auth {
            command: AuthCommand::Login,
        } => {
            let token = read_token()
                .map_err(|e| Failure::Usage(format!("could not read the token: {e}")))?;
            if token.is_empty() {
                return Err(Failure::Usage("no token given on stdin".into()));
            }
            let viewer = auth::login(&token).await?;
            println!("Signed in as {}", viewer.login);
        }
        Command::Projects { owner } => {
            let client = GithubClient::new(auth::load_token()?)?;
            let mut list = ops::list_projects(&client).await?;
            if let Some(owner) = owner {
                let viewer_login = list.owners[0].login.clone();
                let wanted = if owner == "@me" { viewer_login } else { owner };
                list.owners
                    .retain(|o| o.login.eq_ignore_ascii_case(&wanted));
                list.sso_blocked.retain(|o| o.eq_ignore_ascii_case(&wanted));
            }
            print_projects(&list);
        }
        Command::Board {
            project,
            view,
            json,
            offline,
        } => board(&project, view, json, offline).await?,
        Command::Move {
            project,
            item,
            column,
            top,
            after,
        } => move_card(&project, &item, &column, top, after.as_deref()).await?,
        Command::Sync {
            project,
            watch,
            interval,
        } => sync_project(&project, watch, interval).await?,
    }
    Ok(())
}

async fn board(project: &str, view: Option<u32>, json: bool, offline: bool) -> Result<(), Failure> {
    let (owner, number) = parse_project(project)?;
    let mut cache = Cache::open_default()?;
    let cached = match cache.project_id(owner, number)? {
        Some(id) => cache.board(&id, view)?.map(|board| (id, board)),
        None => None,
    };
    if offline {
        let (id, board) = cached.ok_or_else(|| Error::NotCached {
            owner: owner.to_owned(),
            number,
        })?;
        return show_board(&cache, &id, &board, json, None);
    }
    if let (Some((id, board)), false) = (&cached, json) {
        show_board(&cache, id, board, false, None)?;
    }

    let refreshed = async {
        let client = GithubClient::new(auth::load_token()?)?;
        let sent = flush_known(&mut cache, &client, owner, number).await;
        let report = sync::full_sync(&mut cache, &client, owner, number, |_, _, _| {}).await?;
        Ok::<_, Error>((report.project, client.usage(), sent))
    }
    .await;
    match refreshed {
        Ok((id, usage, sent)) => {
            let board = cache.board(&id, view)?.expect("a synced project is cached");
            log_sent(&cache, &id, sent);
            match cached {
                Some((_, before)) if !json && before == board => {
                    println!("Up to date with GitHub. {}", rate_limit(usage));
                }
                Some(_) if !json => {
                    println!("\nUpdated from GitHub:\n");
                    show_board(&cache, &id, &board, false, Some(usage))?;
                }
                _ => show_board(&cache, &id, &board, json, Some(usage))?,
            }
        }
        Err(error) => {
            let Some((id, board)) = cached else {
                return Err(error.into());
            };
            if json {
                show_board(&cache, &id, &board, true, None)?;
            }
            eprintln!("warning: showing the cached board, the refresh failed: {error}");
        }
    }
    Ok(())
}

/// Sends what is queued for a project already in the cache. A transient error leaves it queued.
async fn flush_known(
    cache: &mut Cache,
    client: &GithubClient,
    owner: &str,
    number: u32,
) -> Vec<Sent> {
    let mut sent = Vec::new();
    if let Ok(Some(id)) = cache.project_id(owner, number) {
        let _ = sync::flush(cache, client, &id, |s| sent.push(s)).await;
    }
    sent
}

async fn move_card(
    project: &str,
    item: &str,
    column: &str,
    top: bool,
    after: Option<&str>,
) -> Result<(), Failure> {
    let (owner, number) = parse_project(project)?;
    let client = GithubClient::new(auth::load_token()?)?;
    let mut cache = Cache::open_default()?;
    let id = match cache.project_id(owner, number)? {
        Some(id) => id,
        None => {
            sync::full_sync(&mut cache, &client, owner, number, |_, _, _| {})
                .await?
                .project
        }
    };
    let board = cache.board(&id, None)?.expect("the project is cached");
    let card = intent::find_card(&board, item)?;
    let target = intent::find_column(&board, column)?;
    let (placement, where_) = match after {
        Some(after) => {
            let anchor = intent::find_card(&board, after)?;
            if anchor.item_id == card.item_id {
                return Err(Failure::Usage("a card cannot go after itself".into()));
            }
            (
                Placement::After(anchor.item_id.clone()),
                format!(", after \"{}\"", anchor.title()),
            )
        }
        None if top => (Placement::Top, ", at the top".to_owned()),
        None => (Placement::Keep, String::new()),
    };
    let move_card = Intent::move_card(&board, &card.item_id, target, placement);
    let column_name = target.map_or_else(|| format!("No {}", board.field.name), |c| c.name.clone());
    let seq = cache.enqueue(&move_card)?;

    let mut sent = Vec::new();
    let flushed = sync::flush(&mut cache, &client, &id, |s| sent.push(s)).await;
    let mine = sent.iter().position(|s| match s {
        Sent::Ok(m) | Sent::Failed(m, _) => m.seq == seq,
    });
    let mine = mine.map(|i| sent.remove(i));
    log_sent(&cache, &id, sent);
    match (mine, flushed) {
        (Some(Sent::Ok(_)), _) => {
            println!("Moved \"{}\" to {column_name}{where_}", card.title());
        }
        (Some(Sent::Failed(_, error)), _) => {
            eprintln!("mutation failed, rolled back: {error}");
            return Err(Failure::Exit(exit_code(&error)));
        }
        (None, Err(error)) => {
            println!(
                "Queued \"{}\" to {column_name}{where_}, pending={}. GitHub is unreachable ({error}). \
                 `planche sync` sends it",
                card.title(),
                cache.pending_count(&id)?
            );
        }
        (None, Ok(())) => {
            // Another process claimed the row first, such as `planche sync --watch`.
            println!("Queued \"{}\" to {column_name}{where_}", card.title());
        }
    }
    Ok(())
}

async fn sync_project(
    project: &str,
    watch: bool,
    interval: Option<SyncInterval>,
) -> Result<(), Failure> {
    let (owner, number) = parse_project(project)?;
    let client = GithubClient::new(auth::load_token()?)?;
    let cache = Cache::open_default()?;
    // A second connection names the cards in the log. The engine owns the first.
    let reader = Cache::open_default()?;
    let mut config = SyncConfig::load(&cache, owner, number)?;
    if let Some(interval) = interval {
        config.interval = interval;
    }
    let engine = sync::spawn(cache, client, config, Arc::new(SystemClock));
    let mut events = engine.subscribe();
    engine.send(SyncCommand::Now).await;
    loop {
        let event = match events.recv().await {
            Ok(event) => event,
            Err(RecvError::Lagged(_)) => continue,
            Err(RecvError::Closed) => return Ok(()),
        };
        let project = reader.project_id(owner, number)?;
        let describe = |intent: &Intent| match &project {
            Some(id) => describe(&reader, id, intent),
            None => intent.item_id().to_string(),
        };
        match event {
            SyncEvent::Status(_) => {}
            SyncEvent::Synced { report, next_in } => {
                let remaining = report
                    .usage
                    .remaining
                    .map_or("?".to_owned(), |r| r.to_string());
                let next_in = next_in.map_or("manual".to_owned(), |d| format!("{}s", d.as_secs()));
                println!(
                    "{} sync ok items={} cost={} remaining={remaining} next_in={next_in}",
                    clock(),
                    report.items,
                    report.cost,
                );
                for change in &report.changes {
                    let name = |c: &Option<String>| c.clone().unwrap_or_else(|| "(gone)".into());
                    println!(
                        "{} changed \"{}\": {} -> {}",
                        clock(),
                        change.title,
                        name(&change.from),
                        name(&change.to)
                    );
                }
                if !watch {
                    return Ok(());
                }
            }
            SyncEvent::SyncFailed { error, retry_in } => {
                println!(
                    "{} sync failed: {error}, retry in {}s",
                    clock(),
                    retry_in.as_secs()
                );
                if !watch {
                    return Err(Failure::Exit(exit_code(&error)));
                }
            }
            SyncEvent::MutationOk(mutation) => {
                println!("{} mutation ok: {}", clock(), describe(&mutation.intent));
            }
            SyncEvent::MutationFailed { mutation, error } => {
                println!(
                    "{} mutation failed, rolled back: {} ({error})",
                    clock(),
                    describe(&mutation.intent)
                );
            }
        }
    }
}

/// Logs the outcome of queued moves sent along the way.
fn log_sent(cache: &Cache, project: &ProjectId, sent: Vec<Sent>) {
    for sent in sent {
        match sent {
            Sent::Ok(m) => println!("mutation ok: {}", describe(cache, project, &m.intent)),
            Sent::Failed(m, error) => println!(
                "mutation failed, rolled back: {} ({error})",
                describe(cache, project, &m.intent)
            ),
        }
    }
}

/// `"<card title>" to <column>`, from the displayed board.
fn describe(cache: &Cache, project: &ProjectId, intent: &Intent) -> String {
    let Intent::MoveCard { item_id, to, .. } = intent;
    let Ok(Some(board)) = cache.board(project, None) else {
        return item_id.to_string();
    };
    let title = board
        .columns
        .iter()
        .flat_map(|c| &c.cards)
        .find(|c| &c.item_id == item_id)
        .map_or_else(|| item_id.to_string(), |c| format!("\"{}\"", c.title()));
    let column = match to {
        None => format!("No {}", board.field.name),
        Some(option) => board
            .columns
            .iter()
            .find(|c| c.option_id.as_ref() == Some(option))
            .map_or_else(|| option.to_string(), |c| c.name.clone()),
    };
    format!("{title} to {column}")
}

/// UTC wall time as `HH:MM:SS`, for the sync log.
fn clock() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!(
        "{:02}:{:02}:{:02}",
        secs / 3600 % 24,
        secs / 60 % 60,
        secs % 60
    )
}

fn read_token() -> std::io::Result<String> {
    if std::io::stdin().is_terminal() {
        return rpassword::prompt_password("GitHub token: ").map(|t| t.trim().to_owned());
    }
    let mut line = String::new();
    std::io::stdin().lock().read_line(&mut line)?;
    Ok(line.trim().to_owned())
}

fn parse_project(project: &str) -> Result<(&str, u32), Failure> {
    project
        .rsplit_once('/')
        .and_then(|(owner, number)| Some((owner, number.parse().ok()?)))
        .filter(|(owner, _)| !owner.is_empty())
        .ok_or_else(|| Failure::Usage(format!("expected <owner>/<number>, got `{project}`")))
}

fn print_projects(list: &ProjectList) {
    for owner in &list.owners {
        println!("{}", owner.login);
        if owner.projects.is_empty() {
            println!("  (no projects)");
        }
        for project in &owner.projects {
            let closed = if project.closed { "  (closed)" } else { "" };
            println!("  #{:<4} {}{closed}", project.number, project.title);
        }
    }
    if !list.sso_blocked.is_empty() {
        println!();
        println!(
            "Not authorized for SAML SSO: {}",
            list.sso_blocked.join(", ")
        );
        println!(
            "Authorize the token for these organizations at https://github.com/settings/tokens"
        );
    }
}

/// Prints the board, then the cache state and, after a refresh, the rate limit.
fn show_board(
    cache: &Cache,
    project: &ProjectId,
    board: &Board,
    json: bool,
    usage: Option<RateUsage>,
) -> Result<(), Failure> {
    let pending = cache.pending_count(project)?;
    let synced_at = cache.synced_at(project)?;
    if json {
        #[derive(Serialize)]
        struct Output<'a> {
            #[serde(flatten)]
            board: &'a Board,
            pending: u32,
            synced_at: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            rate_limit: Option<RateUsage>,
        }
        let output = Output {
            board,
            pending,
            synced_at,
            rate_limit: usage,
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&output).expect("board serializes")
        );
        return Ok(());
    }
    print_board(board);
    println!();
    println!(
        "pending={pending}, synced {}",
        synced_at.as_deref().unwrap_or("never")
    );
    if let Some(usage) = usage {
        println!("{}", rate_limit(usage));
    }
    Ok(())
}

fn rate_limit(usage: RateUsage) -> String {
    let remaining = usage.remaining.map_or("?".to_owned(), |r| r.to_string());
    let limit = usage.limit.map_or("?".to_owned(), |l| l.to_string());
    format!("rate limit {remaining}/{limit}, cost {}", usage.cost_total)
}

fn print_board(board: &Board) {
    let view = board.view.as_ref().map_or(String::new(), |v| {
        format!(", view {} \"{}\"", v.number, v.name)
    });
    println!(
        "{}{view}, columns by {}",
        board.project.title, board.field.name
    );
    for column in &board.columns {
        println!();
        println!("{} ({})", column.name, column.cards.len());
        for card in &column.cards {
            let (reference, repo) = match &card.content {
                ItemContent::Issue { number, repo, .. } => (format!("#{number}"), repo.as_str()),
                ItemContent::PullRequest { number, repo, .. } => {
                    (format!("PR #{number}"), repo.as_str())
                }
                ItemContent::Draft { .. } => ("draft".to_owned(), ""),
                ItemContent::Redacted => (String::new(), ""),
            };
            let repo = if repo.is_empty() {
                String::new()
            } else {
                format!("  {repo}")
            };
            println!("  {reference:<7} {}{repo}", card.title());
        }
    }
}
