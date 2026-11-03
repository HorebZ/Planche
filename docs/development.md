# Developing Planche

[Back to the project](../README.md)

Run commands from the repository root unless a section specifies otherwise.
For the current app scope and installation instructions, see the root README.

## Requirements

- macOS 15 or later
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

### Website

The public landing page lives in [`website/`](../website/), independently of the
desktop app. Run `bun run dev:website` from the root and open
http://localhost:1421. This optional preview command uses Python 3's standard HTTP
server. You can also open `website/index.html` directly; serving the site requires
neither Python nor a build step.
Any static host can serve the contents of `website/` directly. See
[`website/README.md`](../website/README.md) for assets and link maintenance.

### Installable alpha

The alpha requires macOS 15 or later. A DMG installs `Planche.app` into Applications;
the installed app needs neither Bun, Rust, a development server nor an `.env` file.
On first launch, sign in with GitHub. The session, preferences, cache and queued
actions stay outside the application bundle and survive replacement of the app.

For the first small tester group, the release script uses an ad hoc macOS signature
when `APPLE_SIGNING_IDENTITY` is absent. This is free, but the downloaded app is not
notarized: after trying to open it, testers may need **System Settings → Privacy &
Security → Open Anyway**. Managed Macs can prohibit that exception. A Developer ID
certificate and notarization credentials can be supplied later to the same build.

Build locally from the root:

```sh
python3 -m venv .local/dmg-tools
.local/dmg-tools/bin/python -m pip install -r scripts/dmg-requirements.txt
bun run release:alpha
```

The first two commands install the DMG build tools once, outside the application.
Packaged builds regenerate the native icons from
`app/src/assets/brand/planche-icon.svg`. Use `bun run --cwd app icons` to regenerate
them independently.

The command checks the repository, builds a native bundle with the public OAuth
Client ID, verifies its macOS signature, signs and verifies an updater archive,
tests replacing an isolated copy of the app, and creates a DMG styled as a small
Todo → Done board. Dragging Planche from Todo to the Applications shortcut in Done
copies the app into Applications. The background is static; Finder handles the
actual copy. The builder checks the image, saved Finder layout, shortcut and
bundled app signature without automating Finder. Files are written to
`target/release/alpha/<version>/`. The build is for the
current Mac's architecture: Apple Silicon produces `aarch64`, Intel `x86_64`.
Universal archives are not supported by the updater yet.

The original update key is kept locally at `.local/release/alpha.key`, excluded
from Git, with directory permissions `0700` and file permissions `0600`. **Back up
that private key in a password manager before sharing the alpha.** Never commit
it or regenerate the public key for an existing installed alpha. To use a restored
or CI key, provide `TAURI_SIGNING_PRIVATE_KEY_PATH` or `TAURI_SIGNING_PRIVATE_KEY`,
and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if needed. Only the public key in
`crates/planche-core/alpha-updater.pub` is bundled. The private update key is
independent of Apple signing and of Git commit signing.

The app checks the public `alpha/latest.json` release feed after startup without
waiting for GitHub sign-in. **Check for updates** is available in onboarding and
Settings. A downloaded update is verified before installation; **Later** keeps
the current app running. Installation waits for the sync writer to stop, blocks
new actions, refuses to restart while an unsent draft exists, replaces only the
app bundle and then restarts. Failed downloads or signatures leave the app intact.

To publish a prepared release, commit and push its code, rebuild from that clean
commit, then run:

```sh
bun run publish:alpha
```

This publishes a versioned prerelease with the DMG and signed archive, then updates
`latest.json` on the rolling `alpha` prerelease. Downloads are public and never use
the app user's GitHub token. Existing versioned releases are not overwritten; bump
the alpha version in the workspace Cargo manifest, Tauri Cargo manifest, Tauri
config and `app/package.json` for the next release. The updater accepts only newer
versions signed by the embedded key and checks the signed version against the
manifest. The first unpublished alpha treats a missing feed as no update.

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

The token is stored encrypted in the classic macOS login Keychain under service
`dev.planche.app.auth.login-keychain.v1`, account `github.com`, with synchronization
disabled. This uses the file-based Keychain rather than the data protection
Keychain: no Touch ID, access-group entitlement, provisioning profile, or paid
Apple Developer membership is required. The CLI uses the same item. macOS may ask
for permission or the login Keychain password when a different executable accesses
it, including after unsigned or ad hoc development rebuilds. Rust caches a
successfully read token for the process so background sync does not repeatedly
access the Keychain. A refused access leaves the startup lock visible, and only an
explicit **Retry** attempts access again.

On upgrade, Planche reads the legacy
`~/Library/Application Support/dev.planche.app/auth/token` file only when the
Keychain item does not exist. It writes the token into the Keychain, reads it back,
checks that the copy matches, and only then removes the file. A failed write,
cancelled access, or mismatched read preserves the file for retry without opening
a plaintext session. An existing Keychain session takes precedence over a leftover
legacy file. Signing out removes both saved credentials but leaves the board cache
intact. This does not revoke the token on GitHub. Older Keychain services are left
untouched and are not read.

`PLANCHE_TOKEN` takes priority over the saved token. It is read at runtime, never
embedded in the executable or webview, and startup does not copy it into the
Keychain. With this override, remove it from `.env` and restart to switch accounts
or stay signed out. Direct `cargo run` commands do not load `.env`; use
`bun --env-file=.env exec 'cargo run -p planche-cli -- projects'` from the root, or
export the variable in your terminal.

Before distributing a build, verify on a real Mac with `PLANCHE_TOKEN` unset:

1. Sign in with a disposable GitHub credential, quit, and relaunch. Authorize
   Keychain access if macOS prompts; the session must reopen without Touch ID.
2. If prompted, refuse access. The lock must remain with no automatic retry;
   press **Retry** and allow access. Sync must run without repeated prompts.
3. Upgrade a legacy file session. Failed migration must preserve the file;
   successful migration must remove it. Never print or capture the credential.
4. Sign out and restart. The app must show onboarding and not restore a session.
5. Rebuild or update the app and use the CLI. macOS may request access again, but
   the saved credential must remain readable after authorization. Automated tests
   use fake Keychain operations and do not modify the real login Keychain.

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
website/               Static public site, styles, fonts and demo images
```
