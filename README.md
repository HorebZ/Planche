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
cp .env.example .env
# Optionally set PLANCHE_TOKEN in .env for local development.
bun run dev
```

`bun install` at the root installs the workspace tools and the `app/` dependencies.
`bun run dev` at the root loads `.env` through Bun and passes its variables to Rust.
The file is ignored by Git. Use a classic PAT in `PLANCHE_TOKEN` to skip GitHub
sign-in during development; it never needs the macOS Keychain. Keep this file
private (`chmod 600 .env`). Never name a credential `VITE_*`: those variables are
exposed to the webview.

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

The command-line client runs from the root. It shares the desktop GitHub session, or accepts a classic personal access token with the `repo`, `read:org` and `project` scopes using `auth login`.

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

### GitHub sign-in and local sessions

The desktop app uses GitHub OAuth Device Flow: choose **Sign in with GitHub** to copy
the verification code and open GitHub, then paste the code and authorize Planche.
Click the code to copy it again while waiting. Only Rust makes the OAuth
and API requests; neither the access token nor the private device code reaches
the webview. The scopes are `repo`, `read:org` and `project`. A classic PAT is still
available through **Use a personal access token**.

Register an [OAuth App](https://github.com/settings/applications/new) for Planche
once (free; unrelated to Apple Developer membership):

1. Set **Application name** to `Planche`, **Homepage URL** to
   `https://github.com/HorebZ/Planche`, and **Authorization callback URL** to
   `http://127.0.0.1`. GitHub requires this field, but Device Flow does not use it.
2. Click **Register application**, then enable **Device Flow** in the app settings
   and save. Keep token expiration disabled;
   this version supports long-lived tokens and rejects expiring ones until token
   refresh is implemented.
3. Copy **Client ID** into `PLANCHE_GITHUB_CLIENT_ID` in the root `.env`. Leave
   `PLANCHE_TOKEN` empty when testing OAuth and restart with `bun run dev`.
   No client secret is needed.

Development and packaged releases use the same OAuth App and Client ID. Keep
Device Flow enabled and the callback URL at `http://127.0.0.1`; no GitHub
configuration change is needed for a release. Authorization happens on
`https://github.com/login/device`, and Planche polls GitHub for the result.
There is no redirect to a local IP, no local authentication server and no port
to open.

To package the macOS app, load the Client ID from the root `.env` at build time:

```sh
bun run --cwd app --env-file=../.env tauri build
```

Only the public Client ID is embedded in the Rust executable. The `.env` file
and `PLANCHE_TOKEN` are not bundled. Installed apps need no `.env`; each user
authorizes their own GitHub account.

For an organization using SAML SSO, establish its SSO session in the browser
before authorizing Planche. An organization administrator may need to approve
this OAuth App. If an organization is inaccessible, the project picker keeps
other owners selectable and explains how to reconnect after authorization.
See [GitHub's Device Flow documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
and [organization access rules](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps#oauth-apps-and-organizations).

The token is saved unencrypted at
`~/Library/Application Support/dev.planche.app/auth/token`, in a `0700` directory
with file mode `0600`. Writes replace the file atomically. This session is shared
with the CLI and survives rebuilds and version changes without Apple signing,
Touch ID or a Keychain password. Other programs running as your user can read it.
GitHub can still expire or revoke the token; sign in again if that happens.
Signing out removes the saved token but leaves the board cache intact.

`PLANCHE_TOKEN` takes priority over the saved token. It is read at runtime, never
embedded in the executable or webview, and startup does not copy it into the
session file. With this override, remove it from `.env` and restart to switch
accounts or stay signed out. Direct `cargo run` commands do not load `.env`;
use `bun --env-file=.env exec 'cargo run -p planche-cli -- projects'` from the root, or export the
variable in your terminal.

Existing Keychain credentials are left untouched and are no longer read. After
upgrading from the Keychain version, sign in once through GitHub or set
`PLANCHE_TOKEN`. This avoids a migration prompt.

The remembered account is tied to a SHA-256 fingerprint of the verified token.
An unknown token requires one online identity check; subsequent launches can
restore its saved identity offline. Cached boards remain hidden until the
account is restored, and synchronization starts only after authentication.

The board lives in a SQLite cache at `~/Library/Application Support/dev.planche.app/cache.sqlite`. `PLANCHE_CACHE` overrides the path. `board` prints the cached board at once, then refreshes it from GitHub. A move shows at once and goes into a queue. When GitHub is unreachable, the move stays queued, and the next `sync` sends it.

Opening an issue in the desktop app reads its saved description immediately and
revalidates it on each online opening. The app renders descriptions as CommonMark
and caches them separately by GitHub host, account and issue ID. Offline copies are
marked as saved; a refused or missing issue removes the saved text. Pull requests and drafts keep their explicit
GitHub fallback. Raw HTML is ignored; images remain unloaded text placeholders.
Links allow HTTP, HTTPS and mailto and open externally. A rendering error falls
back to plain text. GitHub-specific extensions such as task lists and tables are
not enabled.

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
