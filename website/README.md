# Planche website

Static landing page introducing repository Planches: calculated issue boards for
public repositories and repositories the connected account can access, without
setting up a GitHub Project. Preserve the supplied landing design.
No build step, JavaScript, framework, environment variables or app dependencies
are required to serve it.

From the repository root:

```sh
bun run dev:website
```

Open http://localhost:1421. Python 3 is used only by this optional preview command,
which runs its standard HTTP server. You can also open `index.html` directly.
The site itself does not run Python. For hosting, publish this directory as-is,
including `assets/`; relative asset paths also work under a subdirectory.
Deployment and domain configuration are not set up yet.

- `index.html`: landing page, navigation, release links and the three latest updates.
- `changelog.html`: full dated changelog, with a permanent anchor for each entry.
- `styles.css`: layout, typography and responsive styles.
- `tokens.css`: the marketing site's colors, shadows and motion values.
- `assets/`: local Inter / Inter Tight fonts, SVG icons and static demo images.

The interface SVG symbols are embedded in `index.html` so icons also render when
opening the HTML file directly, without an HTTP server.

Download buttons point to the repository's releases page, which includes alpha
prereleases. Update these links if a dedicated download destination is introduced.
The changelog is maintained manually in `changelog.html`; update it when shipping
changes and keep the three latest entries on the homepage in sync.
Stylesheet and app screenshot URLs use `?v=` with the first twelve characters of
the file's SHA-256 hash so browsers load updated assets. Update these references
in both HTML pages when an asset changes; the website test checks each fingerprint.
The mockup's placeholder Privacy link was omitted until a policy page exists.

All screenshots are WebKit captures of the current app frontend in dark mode,
with reduced motion and demonstration data from the existing mock backend.
All captures use 2× resolution. Project board and palette captures use a
1440 × 900 viewport.

- `repository-board.png`: the homepage hero, captured at 1800 × 900 so all five
  computed columns fit. From `?mock=showcase`, open `HorebZ/Planche` in the sidebar
  and select **Planche**. This scenario supplies six saved repositories and sixteen
  issues with varied titles, labels, authors and metadata. The column counts are
  2 / 4 / 3 / 3 / 4, leaving space below the cards.
- `repository-detail.png`: the same repository with issue #122 open in its native
  detail panel, at 1440 × 900.
- `board.png`: the GitHub Projects board from `?mock=board`, with no selected card,
  used by the root README export.
- `board-readme.png`: a transparent WebKit export of `board.png` with CSS perspective
  and fade applied, for the root README where GitHub strips CSS. Refresh this export
  whenever `board.png` changes.
- `palette.png`: `?mock=showcase`, on the project board with a card focused and ⌘K open.
- `detail.png`: the previous GitHub Projects detail capture, retained as a reference.
- `drag.png`: a 624 × 360 crop of a card being dragged between project columns in
  the same showcase scenario.

Capture the actual frontend when updating these images; do not draw additional
controls or features into them. The hero's perspective tilt and fade are CSS.
Keep the copy scoped to features available in the alpha. The visible alpha note
records the main limitations; expand the page when those features ship.
Repository columns are computed from loaded issues rather than manually moved.
Keep GitHub Projects actions clearly scoped to project boards, and describe private
repository support as subject to the connected account's permissions.

The supplied mockups are preserved as design objectives in `references/`:
[`objectif.png`](references/objectif.png),
[`objectif-palette.png`](references/objectif-palette.png),
[`objectif-detail.png`](references/objectif-detail.png) and
[`objectif-drag.png`](references/objectif-drag.png). They are not displayed on the
site. The export's bundler, component runtime and React copies are not shipped.

Font license notices from the export are preserved in `assets/fonts/LICENSE.txt`.
Lucide and [Bootstrap Icons](https://github.com/twbs/icons) notices are in
`assets/LICENSE-icons.txt`. The Apple and GitHub button logos come from Bootstrap Icons.

`bun run check` includes formatting checks and a static check for broken local
links, section anchors, SVG symbols and stylesheet assets. Layout changes should
also be checked in WebKit at desktop and mobile widths.
