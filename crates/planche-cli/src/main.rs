use std::process::ExitCode;

use clap::{Parser, Subcommand};

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
    Auth,
    /// List the projects the token can see
    Projects,
    /// Print a project board
    Board,
}

fn main() -> ExitCode {
    let name = match Cli::parse().command {
        Command::Auth => "auth",
        Command::Projects => "projects",
        Command::Board => "board",
    };
    eprintln!("planche {name}: not implemented yet");
    ExitCode::FAILURE
}
