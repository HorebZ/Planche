<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="app/src/assets/brand/planche-lockup-paper.svg">
    <img src="app/src/assets/brand/planche-lockup-ink.svg" width="360" alt="Planche">
  </picture>
</h1>

<p align="center"><strong>A native macOS client for GitHub Projects v2.</strong></p>

<p align="center">
  <a href="https://github.com/HorebZ/Planche/releases">Download the alpha</a> ·
  <a href="https://github.com/HorebZ/Planche/issues/1">Roadmap</a> ·
  <a href="https://github.com/HorebZ/Planche/issues">Report an issue</a> ·
  <a href="#contributing">Contribute</a>
</p>
<p align="center">Public alpha · macOS 15 or later</p>

<p align="center">
  <img src="website/assets/board-readme.png" width="1100" alt="The current Planche app in dark mode, showing its project sidebar and GitHub issue board.">
</p>
<p align="center"><sub>The interface is inspired by <a href="https://linear.app">Linear</a>, adapted to GitHub Projects.
</sub></p>

Manage your GitHub Projects in a dedicated macOS window, with keyboard shortcuts
and cached boards that stay available offline. Queued changes sync when GitHub
is reachable again.

- **Boards and lists** — move cards and filter by status, assignee, label or repository.
- **Issue details** — read descriptions and activity, post Markdown comments and change assignees.
- **Keyboard navigation** — J/K to navigate, S for status, C for a draft, ⌘K to search the loaded project.
- **Multiple accounts** — switch between saved GitHub accounts; credentials stay in macOS Keychain.

**Alpha limits:** saved GitHub view filters are not applied and labels are read-only.
Roadmap views, other project fields, repository issue lists, issue creation and
the full issue timeline still need GitHub.

## Install

1. Download the DMG for your Mac from [Releases](https://github.com/HorebZ/Planche/releases).
2. Open it and drag Planche into **Applications**.
3. Launch Planche, choose **Sign in with GitHub**, then select a project.

Requires **macOS 15+**. Updates are available in the app. The alpha is **not
notarized**: if macOS blocks it after the first launch attempt, use **System
Settings → Privacy & Security → Open Anyway**. Managed Macs may prohibit this.

For organization projects, choose **Connect organizations…** with the same GitHub
account. Private personal repository cards may be redacted with OAuth alone.
See [sign-in options and permissions](docs/development.md#github-sign-in-and-local-sessions)
for GitHub App setup and the classic PAT alternative.

## Develop

Requires macOS 15+, [Bun](https://bun.sh) 1.3+, [Rust](https://rustup.rs) stable
and Xcode Command Line Tools (`xcode-select --install`).

```sh
git clone https://github.com/HorebZ/Planche.git
cd Planche
bun install
cp .env.example .env
chmod 600 .env
# Configure GitHub sign-in in .env (see the development guide).
bun run setup:signing
bun run dev
```

Set `PLANCHE_GITHUB_CLIENT_ID` for OAuth, or `PLANCHE_TOKEN` for local testing with
a classic PAT. Never put credentials in a `VITE_` variable.
The [development guide](docs/development.md) covers authentication, the CLI, tests
and releases.

Built with **Tauri 2, React and Rust**. [`planche-core`](crates/planche-core/)
owns the GitHub client, SQLite cache and sync engine, shared by the app and CLI.

## Contributing

Bug reports and pull requests are welcome. Include reproduction steps, expected
behavior and your macOS version in [bug reports](https://github.com/HorebZ/Planche/issues).
Discuss larger changes in a [roadmap issue](https://github.com/HorebZ/Planche/issues/1)
before implementation.

Read [`AGENTS.md`](AGENTS.md) for architecture and code conventions, and run
`bun run check` before pushing.
