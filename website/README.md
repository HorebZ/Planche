# Planche website

Static landing page imported from `lp-planche.html`. No build step, JavaScript,
framework, environment variables or app dependencies are required to serve it.

From the repository root:

```sh
bun run dev:website
```

Open http://localhost:1421. Python 3 is used only by this optional preview command,
which runs its standard HTTP server. You can also open `index.html` directly.
The site itself does not run Python. For hosting, publish this directory as-is,
including `assets/`; relative asset paths also work under a subdirectory.
Deployment and domain configuration are not set up yet.

- `index.html`: content, navigation, release links and dated changelog entries.
- `styles.css`: layout, typography and responsive styles.
- `tokens.css`: the marketing site's colors, shadows and motion values.
- `assets/`: local Inter / Inter Tight fonts, SVG icons and static demo images.

The interface SVG symbols are embedded in `index.html` so icons also render when
opening the HTML file directly, without an HTTP server.

Download buttons point to the repository's releases page, which includes alpha
prereleases. Update these links if a dedicated download destination is introduced.
The changelog is maintained manually; update its entries when shipping changes.
The mockup's placeholder Privacy link was omitted until a policy page exists.

All screenshots are WebKit captures of the current app frontend in dark mode,
with reduced motion and demonstration data from the existing mock backend.
Board, palette and detail captures use a 1440 × 900 viewport at 2× resolution.

- `board.png`: `?mock=board`, with no selected card.
- `board-readme.png`: a transparent WebKit export of `board.png` with the hero's
  CSS perspective and fade applied, for the root README where GitHub strips CSS.
  Refresh this export whenever `board.png` or the hero effect changes.
- `palette.png`: the same scenario, with a card focused and ⌘K open.
- `detail.png`: `?mock=markdown`, with an issue open and its description loaded.
- `drag.png`: a 624 × 360 crop of a card being dragged between columns.

Capture the actual frontend when updating these images; do not draw additional
controls or features into them. The hero's perspective tilt and fade are CSS.
Keep the copy scoped to features available in the alpha. The visible alpha note
records the main limitations; expand the page when those features ship.

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
