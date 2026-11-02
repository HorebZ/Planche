# Planche website

Static landing page imported from `lp-planche.html`. No build step, JavaScript,
framework, environment variables or app dependencies are required to serve it.

From the repository root:

```sh
bun run dev:website
```

Open http://localhost:1421. This uses Python 3's standard HTTP server. For hosting,
publish this directory as-is, including `assets/`; relative asset paths also work
under a subdirectory. Deployment and domain configuration are not set up yet.

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

`assets/board.png` is a WebKit capture of the current app frontend in dark mode,
at the native window size (1440 × 900, at 2× resolution), using the existing
`?mock=board` backend. The UI is the app's; the issues and projects are demo data.
To refresh it, capture this scenario with reduced motion and no selected card.
The landing applies the perspective tilt and fade in CSS.

The previous hero image is preserved unchanged as the design objective in
[`references/objectif.png`](references/objectif.png); it is not displayed on the site.
The command palette, drag and issue illustrations still come from the supplied
mockup. Replace their PNG files when updating these illustrations. The original
export's bundler, component runtime, React copies and remote font requests are not
shipped.

Font license notices from the export are preserved in `assets/fonts/LICENSE.txt`.
Lucide and [Bootstrap Icons](https://github.com/twbs/icons) notices are in
`assets/LICENSE-icons.txt`. The Apple and GitHub button logos come from Bootstrap Icons.

`bun run check` includes formatting checks and a static check for broken local
links, section anchors, SVG symbols and stylesheet assets. Layout changes should
also be checked in WebKit at desktop and mobile widths.
