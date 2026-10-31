<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="app/src/assets/brand/planche-lockup-paper.svg">
    <img src="app/src/assets/brand/planche-lockup-ink.svg" width="360" alt="Planche">
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

### Frontend code style

`app/biome.json` defines the frontend convention; `.editorconfig` supplies matching editor defaults.

- Indent with 2 spaces, use LF line endings, and wrap code at 100 columns where possible.
- Use double quotes, semicolons, trailing commas in multiline structures, and parentheses around arrow parameters.
- Put JSX attributes on separate lines when an element has multiple attributes.
- Always use braces for conditions and loops, including early returns.
- Separate logical steps with one blank line; keep related declarations together. Biome preserves these groups and collapses repeated blank lines.
- Let Biome organize imports and check Tailwind class ordering.
- Use concise role suffixes when useful: `.types.ts`, `.models.ts`, `.service.ts`, `.routes.ts` and `.fixtures.ts`. Avoid adding a suffix when the filename already makes its role clear.

Run `bun run format` to format Rust and TypeScript across the repository with rustfmt and Biome. `bun run lint` checks the web code without changing files and runs as part of `bun run check`. The frontend-only commands are `bun run --cwd app format` and `bun run --cwd app lint`. The generated `app/src/ipc/bindings.types.ts` keeps the generator's formatting and is excluded from Biome.

Separate logical steps with a blank line. In tests, keep setup, action, and assertions distinct, with related assertions together. Biome and rustfmt preserve these blank lines but do not insert them; maintain this spacing when adding or editing code.

### Command-line client

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

The desktop window opens locked before accessing the token. On macOS builds signed
with a provisioning profile that permits Keychain access, the token is stored in
the Data Protection Keychain with user presence required: macOS offers Touch ID
with the Mac password as a fallback. The first unlock migrates an existing token
from the legacy Keychain; macOS may ask for the old item's password permission
during this one-time migration. The token is then kept in memory for the session.
Cancelling authentication keeps the window locked until you choose to retry.
Background commands use only the unlocked session and never open the Keychain.
The remembered account is tied to a SHA-256 fingerprint of the verified token,
including a token supplied through `PLANCHE_TOKEN`. After upgrading from an older
cache or changing to an unknown token, one online identity check is required;
subsequent launches with that token can use its saved identity offline.
Sync starts after authentication succeeds; waiting, refocusing the window, or
reconnecting the network does not launch another authentication request.
The protected token belongs to the signed app's access group. An unsigned CLI
uses a separate legacy entry; after desktop migration, sign in again with
`planche auth login` or use `PLANCHE_TOKEN` for CLI commands.

Ad-hoc development builds cannot access the protected store and use the legacy
Keychain instead. They make one read at startup, after the window is visible;
rebuilding can cause macOS to ask for permission again because the binary's
signature changes. `PLANCHE_TOKEN` bypasses Keychain authentication for development.

The board lives in a SQLite cache at `~/Library/Application Support/dev.planche.app/cache.sqlite`. `PLANCHE_CACHE` overrides the path. `board` prints the cached board at once, then refreshes it from GitHub. A move shows at once and goes into a queue. When GitHub is unreachable, the move stays queued, and the next `sync` sends it.

Opening an issue in the desktop app reads its saved description immediately and
revalidates it on each online opening. Descriptions are plain text, cached separately
by GitHub host, account and issue ID. Offline copies are marked as saved; a refused
or missing issue removes the saved text. Pull requests and drafts keep their explicit
GitHub fallback. Markdown rendering is tracked in #35.

In debug builds, `PLANCHE_FAULT` injects failures: `fail_page_2`, `fail_mutations`, `hang_before_ack` and `ratelimit_low`.

## Testing

Run these commands from the root.

```sh
bun run check                             # Rust fmt, clippy and tests, lint, app checks, GraphQL validation
bun run --cwd app test                    # colocated unit and React integration tests
bunx playwright install webkit            # first time only
bun run --cwd app test:e2e                # critical browser journeys in WebKit
bun run --cwd app test:visual             # CSS, themes, contrast, layout and screenshots (on demand)
bun run --cwd app test:perf               # performance budgets (on demand, one worker)
bun run --cwd app test:video              # keyboard walkthrough recording (on demand)
```

Behavior belongs in unit and integration tests beside the implementation. Vitest runs
`Name.test.ts` and `Name.test.tsx`; React integration tests use happy-dom and mock only
the Tauri boundary. Rust tests live in adjacent `module.test.rs` or
`module.integration.test.rs` files, loaded with `#[cfg(test)]`. Cache and sync
integration tests use SQLite and a fake GitHub, without network access.

The small `Name.e2e.ts` suite covers startup authentication, onboarding, draft input,
drag and drop, Undo, keyboard focus, and scrolling to virtualized search results.
WebKit rendering checks live in `Name.visual.e2e.ts` and run separately; light and
dark variants belong there rather than in behavioral tests. Performance and video
checks also stay opt-in. All browser tests are beside the feature they exercise.

`bun run check` type-checks all tests. `bun run --cwd app build` uses
`tsconfig.build.json` to exclude tests and the React test helpers; Vite bundles only
the application entry graph. The mock backend is loaded only in development or an
explicit `VITE_MOCK=1` build. Rust excludes test modules from normal builds.

Reusable fixtures live in `_fixtures/` beside the file that declares their types.
Frontend domain types are generated from Rust into `app/src/ipc/bindings.types.ts`,
so their fixtures live in `app/src/ipc/_fixtures/`. The `ipc/` directory also contains
the queries and events used to communicate with Rust. Fixture code uses the suffix
`<name>.fixtures.ts`, including mocks: `user.fixtures.ts`, `board.fixtures.ts`,
`backend.fixtures.ts` and `scenarios.fixtures.ts`. The generic helper stays in
`factory.ts`, without dedicated tests. `fixtureFactory(defaults)` returns fresh, deeply
cloned data on every call; `Partial<T>` overrides replace top-level fields, including
whole nested objects and arrays. For example, `issue({ assignees: [user({ login: "lea" })] })`
creates an issue without sharing mutable data with another test. Cards have a factory
per variant; factories use deterministic defaults and need no builder or dependency.

Rust uses `<name>.fixtures.rs` functions from `crates/planche-core/src/_fixtures/` and struct update syntax,
such as `Board { columns, ..board() }`. The fixture modules compile only under
`#[cfg(test)]`; test values do not add `Default` implementations to domain types.
GitHub response JSON and the fake GitHub service live in
`crates/planche-core/src/github/_fixtures/`. `fixtures/move_cases.json` stays at the
root because Rust and TypeScript replay the same contract. Data specific to one test
stays in that test. TypeScript production roots, the design check and Tailwind exclude
`_fixtures/`; the dev/mock backend remains conditionally loaded.

UI styles must come from the design tokens in `app/src/styles/tokens.css`. The design check fails on hardcoded colors, default Tailwind palette classes, and `dark:` utilities.

GraphQL documents in `crates/planche-core/graphql/` are validated against GitHub's public schema. `bun run update:schema` refreshes it.

## Project structure

```
crates/
  planche-core/        Domain, GitHub client, cache and sync engine
  planche-cli/         Command-line client
app/
  src/assets/brand/    App icons and README logos
  src/components/ui/   UI components
  src/playground/      Component playground
  src/styles/          Design tokens and Tailwind theme
  src/**/*.test.ts(x)  Unit and React integration tests, beside their implementation
  src/**/*.e2e.ts      Focused WebKit journeys and optional rendering/performance checks
  src-tauri/           Tauri shell
scripts/               GraphQL validation, schema update
```
