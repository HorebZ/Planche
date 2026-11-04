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
bun run setup:signing
bun run dev
```

`bun install` at the root installs the workspace tools and the `app/` dependencies.
`bun run dev` at the root loads `.env` through Bun and passes its variables to Rust.
The file is ignored by Git. Use a classic PAT in `PLANCHE_TOKEN` to skip GitHub
sign-in during development; it never needs the macOS Keychain. Keep this file
private (`chmod 600 .env`). Never name a credential `VITE_*`: those variables are
exposed to the webview.

`bun run setup:signing` creates a free, self-signed code-signing identity in your
default user Keychain. It grants `/usr/bin/codesign` access to that signing key;
it changes neither the GitHub credentials nor system certificate trust. The
temporary private key is removed after import. The public certificate and its
fingerprint remain in the ignored `.local/signing/` directory. Repeating setup
reuses the same certificate; restore a missing identity instead of regenerating it.
Back up the identity **with its private key** using Keychain Access before sharing
builds. Keep the same identity on every machine that builds updates.

`bun run dev` signs the executable before Cargo launches it, including after a
Rust rebuild. Alpha builds use the same identity. Once you authorize the newly
signed app with **Always Allow**, its stable signature lets Keychain recognize
later builds. A locked login Keychain still needs to be unlocked; macOS can ask
for both unlock and app authorization on the first access. This does not enable
Touch ID or notarization and needs no Apple Developer subscription. To use an
existing signing identity instead, set `APPLE_SIGNING_IDENTITY` in `.env`.
The first signature may ask you to allow `codesign` to use the new signing key.
To check the native runner after setup, run
`PLANCHE_TEST_SIGNING=1 bun test scripts/macos-signing.integration.test.ts`.
It rebuilds two tiny programs and checks that their code hashes differ while their
designated requirements remain identical. This opt-in test uses the real Keychain.

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

For the first small tester group, the release script uses the stable local signature
created by `bun run setup:signing` when `APPLE_SIGNING_IDENTITY` is absent.
This is free, but the downloaded app is not
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

Direct Tauri commands bypass the root signing workflow. Use root `bun run dev`
and `bun run release:alpha` when testing Keychain authorization across builds.

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

The desktop app uses GitHub Device Flow: choose **Sign in with GitHub** to copy
the verification code and open GitHub, then paste the code and authorize Planche.
Only Rust makes OAuth and API requests; access tokens, refresh tokens and private
device codes never reach the webview.

#### Personal OAuth and optional organization connection

The default **Sign in with GitHub** flow uses `PLANCHE_GITHUB_CLIENT_ID` and
requests only `project`. Register an OAuth App, enable Device Flow and keep token
expiration disabled for this connection. No client secret is used. The public
profile and public issues do not need `repo` or `read:org`.

`project` grants access to both user and organization Projects on GitHub; there is
no personal-projects-only OAuth scope. Planche routes organization project requests
exclusively through its companion GitHub App. This routing does not remove the
organization-project rights encoded in the OAuth token itself. Private personal
repository cards may be redacted because project access does not grant private
repository access. Use the explicit PAT mode when full compatibility is required.

An existing OAuth authorization can retain previously granted broad scopes.
Planche rejects those grants: revoke the old authorization under GitHub Settings
→ Applications → Authorized OAuth Apps, then sign in again. No authorization is
revoked automatically, and existing saved token sessions are preserved as token
mode until the user reconnects.

After personal sign-in, **Connect organizations…** is available in onboarding and
the sidebar account menu when this build includes a GitHub App Client ID. It starts
a separate Device Flow and requires the same GitHub account. Cancelled or rejected
organization authorization keeps the personal session. Both connections share one
Keychain item, so restoring them does not add a second credential read. Organization
access and refresh tokens rotate without changing the primary offline identity.
A refusal never falls back to a broad OAuth token or PAT.

#### GitHub App for organization projects

Register a [GitHub App](https://github.com/settings/apps/new) rather than an OAuth
App. Registration is free and unrelated to Apple Developer membership. The App ID,
the GitHub App's Client ID and a legacy OAuth App's Client ID are different values.
The Client ID alone does not grant permissions: the registration and installation
control them.

1. Set a unique app name and the homepage URL to `https://github.com/HorebZ/Planche`.
2. Enable **Device Flow**, keep **Expire user authorization tokens** enabled, and
   disable **Active** under Webhooks. No webhook server, callback server, client
   secret or private key is needed. Leave **Request user authorization (OAuth)
   during installation** unchecked; Planche starts Device Flow itself.
3. Set only the following permissions:

   | Category | Permission | Access | Used by Planche |
   | --- | --- | --- | --- |
   | Organization | Projects | Read and write | List boards, move/archive cards, edit statuses and create drafts |
   | Repository | Issues | Read and write | Read issues, descriptions and activity; change assignees |
   | Repository | Pull requests | Read and write | Read PR cards and linked PRs; change PR assignees |
   | Repository | Metadata | Read-only (implicit) | Repository identity |

   Leave **Contents**, Actions, Administration and all other optional permissions
   at **No access**. Members permission is unnecessary: Planche discovers approved
   organizations through `/user/installations`, not organization membership APIs.
4. Choose **Any account** for installation if the app must be installed in other
   organizations. This makes the integration installable; its repository does not
   have to move into those organizations.
5. Install the app on the target organization and choose **Only select repositories**.
   An organization owner must approve organization Projects permission. Repository
   selection limits repository data; the organization Projects permission is not
   a per-project allowlist. GitHub still enforces the signed-in user's own access.
6. Copy the app's public **Client ID** into `PLANCHE_GITHUB_APP_CLIENT_ID` in the
   ignored root `.env`, alongside the primary `PLANCHE_GITHUB_CLIENT_ID`. Leave
   `PLANCHE_TOKEN` empty and restart `bun run dev`. Sign in with OAuth first, then
   choose **Connect organizations…** and complete the second authorization.

The project picker combines personal OAuth projects with active organization
installations of the GitHub App. The App user token is also used for issue reads
and assignments, including public resources permitted by GitHub. OAuth alone can
read public issues; its issue mutation controls remain disabled. Projects whose
`viewerCanUpdate` is false remain readable, with dragging and draft creation
disabled and new project mutations rejected before entering the outbox. Existing
queued actions are preserved. App and PAT modes never implicitly replace each
other. A PAT login replaces the whole dual connection; logout removes both.

No Contents permission means no general repository-file access. Pull request
permissions can still expose code in PR diffs through GitHub's API, although
Planche does not fetch diffs. See [Get a pull request](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request).

The GitHub App flow requests only `offline_access`, which enables token expiration
and adds no repository permissions. Access tokens expire after eight hours and
are refreshed before expiry through the shared Rust GitHub client. Device Flow
refresh uses the public Client ID and refresh token, with no client secret.
The full rotating session is stored in the existing Keychain item. A stable
fingerprint of the initially verified credential keeps offline account restoration
working across rotations; only the current access token is sent to GitHub.
`auth/session.lock` contains no credentials and serializes refreshes across the
app and CLI. Failed refresh or Keychain access leaves pending mutations queued.
A refresh token that expires or is revoked requires signing in again.

See [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
[Device Flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)
and [token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).
No additional GraphQL query was added to the sync loop. `viewerCanUpdate` is
read in the existing Project metadata fragment; refresh and installation discovery
use OAuth/REST endpoints. Owner kind is resolved once when opening an OAuth
project so the correct connection is fixed before the engine starts.
On 2026-11-04, the live `ProjectBoard` query on `@me/2` cost 5 points both before
and after adding `viewerCanUpdate`.

#### Classic PAT alternative

**Use a personal access token** selects a separate connection with `repo`,
`read:org` and `project`, preserving all previous features. The `repo` scope
also permits reading and writing code; GitHub provides no issues-only OAuth
scope for private repositories. A PAT does not bypass user rights or organization
policies. Fine-grained PATs remain unsupported because they cannot cover personal
Projects and several resource owners in the same connection.

To package the macOS app, load the Client ID from the root `.env` at build time:

```sh
bun run --cwd app --env-file=../.env tauri build
```

Only the public Client IDs are embedded in the Rust executable. The `.env` file
and `PLANCHE_TOKEN` are not bundled. Installed apps need no `.env`; each user
authorizes their own GitHub account.

For an organization using SAML SSO, establish its SSO session in the browser
before authorizing Planche. An organization administrator may need to approve
the integration or its installation. If an organization is inaccessible, the project picker keeps
other owners selectable and explains how to reconnect after authorization.
See [GitHub's Device Flow documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
and [organization access rules](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps#oauth-apps-and-organizations).

The token is stored encrypted in the classic macOS login Keychain under service
`dev.planche.app.auth.login-keychain.v1`, account `github.com`, with synchronization
disabled. This uses the file-based Keychain rather than the data protection
Keychain: no Touch ID, access-group entitlement, provisioning profile, or paid
Apple Developer membership is required. The CLI uses the same item. macOS may ask
for permission or the login Keychain password when a different executable accesses
it, including after unsigned or ad hoc development rebuilds. Rust caches the
session for the process; GitHub App refresh writes a rotated session back to the
Keychain only when needed. A refused access leaves the startup lock visible, and only an
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
   the saved credential must remain readable after authorization.
6. With a test GitHub App and only the listed permissions, check an organization
   board, issue descriptions/activity, linked PRs, issue and PR assignment, card
   moves, archive/unarchive, draft creation and offline restoration. Reopen a
   session past access-token expiry and confirm refresh works without a client
   secret, including simultaneous CLI use. An uninstalled or suspended organization
   must not appear. Automated tests use fake Keychain/refresh data and do not modify
   the real login Keychain.

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
