<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/brand/logotype/planche-lockup-paper.svg">
    <img src="design/brand/logotype/planche-lockup-ink.svg" width="360" alt="Planche">
  </picture>
</h1>

<p align="center">A native macOS client for GitHub Projects.</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white" alt="Platform: macOS">
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white" alt="Tauri 2"></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-stable-CE422B?logo=rust&logoColor=white" alt="Rust"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 6"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4"></a>
  <a href="https://www.radix-ui.com"><img src="https://img.shields.io/badge/Radix_UI-161618?logo=radixui&logoColor=white" alt="Radix UI"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3-FBF0DF?logo=bun&logoColor=black" alt="Bun 1.3"></a>
</p>

---

Planche shows your GitHub Projects (v2) boards in a native macOS window. Cards move between columns with drag and drop or the keyboard, a command palette (⌘K) reaches every action, and a local cache keeps the board usable offline.

> [!NOTE]
> Planche is in early development. The design system is done; the board is next. See the [roadmap](https://github.com/HorebZ/Planche/issues/1).

## Requirements

- macOS
- [Bun](https://bun.sh) 1.3 or later
- [Rust](https://rustup.rs) (stable)
- Xcode Command Line Tools: `xcode-select --install`

## Getting started

```sh
git clone https://github.com/HorebZ/Planche.git
cd Planche
bun install
cd app && bun run tauri dev
```

`bun install` at the root installs the workspace tools and the `app/` dependencies.

## Development

Run these commands from `app/`.

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `bun run tauri dev`   | Run the desktop app with hot reload             |
| `bun run dev`         | Run the frontend only, at http://localhost:1420 |
| `bun run tauri build` | Build the macOS app bundle                      |

While `bun run dev` is running, http://localhost:1420/playground shows every UI component in every state, in light and dark mode. The playground is excluded from production builds.

The command-line client runs from the root. It needs a classic personal access token with the `repo`, `read:org` and `project` scopes, stored in the macOS Keychain on sign-in.

```sh
cargo run -p planche-cli -- auth login              # paste the token
cargo run -p planche-cli -- projects                # your projects and your organizations'
cargo run -p planche-cli -- board @me/2             # a board, columns by Status
cargo run -p planche-cli -- board my-org/5 --view 3 --json
cargo run -p planche-cli -- move @me/2 "#11" "In Progress"     # keeps the card's position
cargo run -p planche-cli -- move @me/2 "#11" Done --after "#2" # or --top
cargo run -p planche-cli -- board @me/2 --offline   # the cached board, without the network
cargo run -p planche-cli -- sync @me/2              # send queued moves, then refresh the cache
cargo run -p planche-cli -- sync --watch @me/2 --interval 1m   # 1m, 5m, 15m or manual
```

`PLANCHE_TOKEN` overrides the stored token.

The board lives in a SQLite cache at `~/Library/Application Support/dev.planche.app/cache.sqlite`. `PLANCHE_CACHE` overrides the path. `board` prints the cached board at once, then refreshes it from GitHub. A move shows at once and goes into a queue. When GitHub is unreachable, the move stays queued, and the next `sync` sends it.

In debug builds, `PLANCHE_FAULT` injects failures: `fail_page_2`, `fail_mutations`, `hang_before_ack` and `ratelimit_low`.

## Testing

Run these commands from the root.

```sh
bun run check                             # Rust fmt, clippy and tests, lint, app checks, GraphQL validation
bunx playwright install webkit            # first time only
bun run --cwd app test:e2e                # end-to-end tests in WebKit
```

UI styles must come from the design tokens in `app/src/styles/tokens.css`. The design check fails on hardcoded colors, default Tailwind palette classes, and `dark:` utilities.

GraphQL documents in `crates/planche-core/graphql/` are validated against GitHub's public schema. `bun run update:schema` refreshes it.

## Project structure

```
crates/
  planche-core/        Domain, GitHub client, cache and sync engine
  planche-cli/         Command-line client
app/
  src/components/ui/   UI components
  src/playground/      Component playground
  src/styles/          Design tokens and Tailwind theme
  e2e/                 Playwright tests
  src-tauri/           Tauri shell
design/                Design handoff, the visual source of truth
scripts/               GraphQL validation, schema update
```
