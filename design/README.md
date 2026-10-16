# design/ — Planche v2

Tout le design de Planche, prêt à être consommé par le code. **Ce dossier est en lecture seule pour l'app** : on importe depuis lui, on ne le modifie pas à la main (il est régénéré depuis le projet de design).

## Arborescence
```
design/
├── AGENTS.md            ← à lire en premier par un agent de code (règles + ordre de lecture)
├── README.md            ← ce fichier
├── SPEC.md              ← spécification complète : fenêtre, écrans, interactions, état, API GitHub
├── tokens/
│   ├── planche-tokens.css    ← SOURCE DE VÉRITÉ (variables --pl-*, clair + [data-theme="dark"])
│   ├── tailwind.preset.js    ← preset Tailwind + alias shadcn/ui en commentaire
│   └── tokens.json           ← mêmes tokens au format DTCG (Style Dictionary, Figma Tokens…)
├── glyphs/
│   ├── PlancheGlyph.tsx      ← StatusGlyph, PriorityGlyph, ProgressRing (React, à copier tel quel)
│   └── *.svg                 ← 7 statuts + 5 priorités, 14×14, couleurs via var(--pl-*) avec repli clair
├── screens/
│   ├── light/01…16-*.png     ← 16 écrans de référence @2x (3040×1960, onboarding 1720×1240)
│   └── dark/01…16-*.png
├── brand/
│   ├── icon/                 ← icône d'app SVG + PNG 16 → 2048 (variante flat incluse)
│   ├── logotype/             ← wordmark + lockup vectorisés (ink, black, white, paper) + PNG
│   ├── menubar/              ← glyphe template (isTemplate = true) SVG + PNG 1x/2x/3x
│   └── macos/                ← AppIcon.appiconset (Xcode), AppIcon.iconset, AppIcon.icns
└── prototype/                ← maquettes HTML interactives (référence, à ne pas porter)
    ├── Planche Ecrans v2.dc.html   ← les 16 écrans, clair + sombre, + planche des statuts
    ├── PlancheWindow v2.dc.html    ← markup + données d'exemple de chaque écran (prop screen)
    ├── PlancheKit v2.dc.html       ← composants et leurs états
    ├── PlancheGlyph.dc.html        ← glyphes (source des SVG)
    ├── Planche Tokens.dc.html      ← planche des tokens
    ├── Planche Identite.dc.html    ← identité (direction A « Cases »)
    └── support.js                  ← runtime des .dc.html uniquement
```

## Brancher dans l'app
1. `import '../design/tokens/planche-tokens.css'` une fois (point d'entrée de la webview).
2. `tailwind.config` : `presets: [require('./design/tokens/tailwind.preset.js')]`, et `content` qui couvre `src/**`.
3. Thème : `document.documentElement.dataset.theme = 'light' | 'dark'` (suivre `prefers-color-scheme` en mode System).
4. Glyphes : `import { StatusGlyph, PriorityGlyph, ProgressRing } from '../design/glyphs/PlancheGlyph'` (ou copier le fichier dans `src/components`).
5. Icône d'app : `design/brand/macos/AppIcon.icns` est déjà généré ; glisser `AppIcon.appiconset` dans `Assets.xcassets`.

## Voir les maquettes
`npx serve design` puis ouvrir `/prototype/Planche Ecrans v2.dc.html`. Les fichiers se chargent entre eux : ils ne marchent pas en `file://`.

## Mettre à jour
Supprimer `design/` et le remplacer en entier par la nouvelle version. Rien dans ce dossier ne doit être édité côté app.
