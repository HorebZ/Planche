use std::io::{BufRead, IsTerminal};
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use planche_core::domain::{Board, ItemContent, ProjectList, RateUsage};
use planche_core::github::{GithubClient, ops};
use planche_core::{Error, auth};
use serde::Serialize;

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
    /// Print a project board
    Board {
        /// The project, as `<owner>/<number>` (`@me/<number>` for yours)
        project: String,
        /// Use this board view's columns instead of the first board view
        #[arg(long)]
        view: Option<u32>,
        /// Print the board as JSON
        #[arg(long)]
        json: bool,
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
        | Error::UnsupportedColumnField(_) => 2,
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
        } => {
            let (owner, number) = parse_project(&project)?;
            let client = GithubClient::new(auth::load_token()?)?;
            let board = ops::fetch_board(&client, owner, number, view).await?;
            let usage = client.usage();
            if json {
                #[derive(Serialize)]
                struct Output<'a> {
                    #[serde(flatten)]
                    board: &'a Board,
                    rate_limit: RateUsage,
                }
                let output = Output {
                    board: &board,
                    rate_limit: usage,
                };
                println!(
                    "{}",
                    serde_json::to_string_pretty(&output).expect("board serializes")
                );
            } else {
                print_board(&board, usage);
            }
        }
    }
    Ok(())
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

fn print_board(board: &Board, usage: RateUsage) {
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
            println!("  {reference:<7} {}{repo}", card.title);
        }
    }
    println!();
    let remaining = usage.remaining.map_or("?".to_owned(), |r| r.to_string());
    let limit = usage.limit.map_or("?".to_owned(), |l| l.to_string());
    println!("rate limit {remaining}/{limit}, cost {}", usage.cost_total);
}
