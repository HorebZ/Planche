# Handoff : Planche — client macOS pour GitHub Projects

## Overview
Planche est un kanban personnel desktop (macOS) pour GitHub Projects : board par statut, cartes issues/PR, panneau de détail, palette ⌘K, synchro en arrière-plan, onboarding par token, réglages. Pilotable entièrement au clavier. Ce dossier contient l'identité retenue (direction **A « Cases »**), les 11 états d'écran en clair et sombre, et les design tokens.

## About the Design Files
Les fichiers de `design/` sont des **références de design en HTML** (prototypes statiques montrant l'apparence et le comportement attendus), **pas du code de production à copier**. La tâche est de **recréer ces écrans dans la codebase existante** : React + Tailwind + Radix/shadcn/ui, dans une webview WebKit, en suivant les patterns déjà en place dans le repo.

Pour les visualiser : ouvrir `design/Planche Ecrans.dc.html` dans un navigateur (servir le dossier en local, ex. `npx serve design`, car les fichiers se chargent entre eux). Les données d'exemple et la logique par état sont dans la classe JS en bas de `PlancheWindow.dc.html` (`renderVals()`), le markup est dans le template au-dessus.

## Fidelity
**High-fidelity.** Couleurs, typo, espacements, rayons, ombres et états sont définitifs. Recréer au pixel près avec les composants de la codebase. Les icônes UI des maquettes viennent de Material Symbols Rounded ; utiliser la librairie d'icônes du repo (ex. lucide-react) avec des équivalents.

---

## Structure de fenêtre (commune)
- Fenêtre 1440×900 de référence (min. conseillée 1100×700), `titleBarStyle: hiddenInset`, rayon 12 px. Boutons natifs (traffic lights) à x=17, y=17, 12 px, gap 8.
- Layout : `flex` horizontal → **Sidebar** 232 px fixe + **Main** `flex:1`.
- Police : pile système (`-apple-system` → SF Pro), 13/17 px par défaut, `letter-spacing:-0.003em`, `-webkit-font-smoothing:antialiased`. Mono : `ui-monospace` (SF Mono) pour numéros, repos, raccourcis, compteurs.
- **Focus clavier partout** : `:focus-visible { outline:none; box-shadow: 0 0 0 2px var(--pl-focus) }`. Sur fond accent : `0 0 0 2px var(--pl-bg), 0 0 0 4px var(--pl-focus)`.

### Sidebar (vibrancy)
- `background: var(--pl-sidebar)` + `backdrop-filter: blur(40px) saturate(1.8)` ; si la webview le permet, préférer une vraie NSVisualEffectView (material `.sidebar`) derrière une sidebar transparente. Bordure droite 1px `--pl-border`. Padding `44px 8px 8px` (44 = place des traffic lights), gap vertical 14.
- Contenu, de haut en bas :
  1. Sélecteur de compte (DropdownMenu) : h28, avatar 18, « camille-r » 600, icône unfold_more.
  2. Bouton recherche : h26, fond `--pl-hover` + ring inset 1px `--pl-border`, « Search or run… », kbd `⌘K` à droite. Ouvre la palette.
  3. Groupe **Projects** : titre 11px/600 `--pl-fg-3` h22 + bouton add. Items h26, rayon 6, padding 0 8, gap 8 : pastille 12×12 rayon 3 (couleur du projet), nom (ellipsis), compteur mono 10.5 `--pl-fg-3`. Actif : fond `--pl-active`, poids 600. Hover : `--pl-hover`.
  4. Groupe **Views** : Assigned to me (8), Review requested (2), Recently closed. Icône 16 px, texte `--pl-fg-2`.
  5. Spacer, puis pied h28 : point d'état 6 px + texte 11.5 (« Synced 2 min ago ») + bouton réglages 24×24.

### Main
- **Toolbar** h48, bordure basse 1px `--pl-border`, padding `0 12px 0 14px`, gap 8, c'est aussi la zone de drag de la fenêtre (`-webkit-app-region: drag`, et `no-drag` sur les contrôles).
  - Titre projet (bouton DropdownMenu) 14/650, `letter-spacing:-0.01em` + chevron.
  - ToggleGroup Board/List : conteneur fond `--pl-hover`, rayon 7, padding 2 ; items h22 rayon 5, 12/500 ; actif fond `--pl-surface` + `--pl-shadow-card`.
  - Séparateur 1×16. Bouton « Filter » + kbd `F`. Chip de filtre actif h22 rayon 5, ring inset 1px `--pl-border-strong` : « Repo is **planche/\*** » + bouton ×.
  - À droite : indicateur de synchro (voir États), pile d'avatars 20 px (chevauchement −4, ring 2px `--pl-bg`), bouton primaire « New issue » h26, fond `--pl-accent`, 12/600, kbd `C` sur fond `rgba(255,255,255,.22)`.
- **Board** : `display:flex; gap:10px; padding:12px 14px; align-items:flex-start`, scroll horizontal si besoin.
  - **Colonne** : largeur 228, padding 5, gap 5, rayon 10, fond `--pl-bg-sunken` (les colonnes sont des « cases » de BD, d'où le fond).
    - En-tête h28 : carré statut 8×8 rayon 2 (`--pl-s-*`), nom 12.5/600, compteur mono 11 `--pl-fg-3`, spacer, boutons 22×22 add + more_horiz.
    - Pied optionnel : « 9 more », h24, 12px `--pl-fg-3`.
  - **Carte** (dense) : fond `--pl-surface`, rayon 8, `box-shadow: var(--pl-shadow-card)`, padding `8px 9px`, gap 5, `tabindex=0`.
    - Ligne 1 : icône 14×17 + titre 13/17, poids 500, `text-wrap: pretty`, jusqu'à 2 lignes.
      - Issue ouverte : carré 11×11 rayon 3, contour inset 1.5px `--pl-fg-3`.
      - PR : icône merge 15 px `--pl-fg-3`.
      - Fermée : carré plein 12×12 `--pl-s-done` + check.
    - Ligne 2 (labels), indentée de 21 px : chips h16, padding 0 5, rayon 3, ring inset 1px `--pl-border-strong`, 10.5/500 `--pl-fg-2`, pastille ronde 6 px colorée. Pas de fonds colorés : lisible dans les deux thèmes.
    - Ligne 3, indentée de 21 px, h18, mono 10.5 `--pl-fg-3` : repo court (« app »), `#226` en `--pl-fg-2`, spacer, avatar 18 px.
    - États :
      - hover : ajoute `0 0 0 1px var(--pl-border-strong)` ;
      - focus : ring 2px `--pl-focus` ;
      - sélectionnée (ouverte dans le panneau) : overlay `--pl-accent-soft` + ring inset 1.5px `--pl-accent` ;
      - mise à jour par la synchro : point 6 px `--pl-accent` en haut à droite (8/8) ;
      - en attente (offline) : « Pending » + icône horloge en `--pl-warning` dans la ligne 3.

---

## Screens / Views
Toutes visibles dans `design/Planche Ecrans.dc.html` (colonne gauche clair, droite sombre). L'état correspond au prop `screen` de `PlancheWindow`.

1. **board** : écran principal. Focus clavier sur #226 (ring vermillon). Projet actif « Planche — v1.2 ». Colonnes : Backlog 6, Todo 3, In progress 3, In review 2, Done 12.
2. **drag** : la carte #214 est soulevée : `transform: rotate(-2deg) scale(1.02)`, `box-shadow: var(--pl-shadow-drag)`, au-dessus du board. À l'origine, carte « fantôme » (overlay `--pl-bg-sunken` à 72 %, ring 1px `--pl-border-strong`). Dans la colonne cible : placeholder de la hauteur de la carte, rayon 8, fond `--pl-accent-soft`, ring inset 1.5px `--pl-accent`. Colonne cible : ring inset 1px `--pl-accent`, compteur +1 en direct. Bulle d'info près du curseur (fond `--pl-fg`, texte `--pl-bg`, 11.5/500) : « Move to In progress · position 2 ». Barre d'aide en bas au centre (fond `--pl-elevated`, `--pl-shadow-pop`) : ←→ Column, ↑↓ Position, ↵ Drop, esc Cancel. Le même déplacement doit marcher au clavier (lib conseillée : dnd-kit avec KeyboardSensor).
3. **detail** : panneau latéral droit, 500 px, sous la toolbar (top 48 → bas), fond `--pl-elevated`, bordure gauche, ombre `-24px 0 48px -24px rgba(0,0,0,.25)`. Le board reste visible et interactif à gauche ; la carte ouverte est en état « sélectionnée ».
   - Header h40 : icône + `planche/app #226` (mono 11.5) ; à droite : précédent/suivant (K/J), copier le lien, ouvrir sur github.com, more, fermer (Esc).
   - Corps padding `18px 24px`, gap 14 :
     - titre 20/26 650 ;
     - méta 12 `--pl-fg-3` ;
     - grille de propriétés `88px 1fr` : Status (bouton DropdownMenu, ouvert dans la maquette, menu 216 px avec un champ « Move to… », 5 statuts, check sur l'actuel, raccourcis 1 à 5), Assignees, Labels, Milestone, Linked PR ;
     - séparateur ;
     - description markdown 13/20 avec checklist ;
     - séparateur ;
     - Activity : événements 12 px et commentaire dans un bloc `--pl-bg-sunken` rayon 8.
   - Pied : champ de commentaire h34 + « ⌘↵ Send ».
   - Animation d'entrée : translateX(16px)→0 + opacité, 200 ms.
4. **palette** : Radix Dialog (ou cmdk) au-dessus d'un voile `--pl-overlay`. Largeur 640, top 110 px, rayon 12.
   - Champ h50 : chip de contexte `#226` (fond `--pl-accent-soft`, texte `--pl-accent`), requête 16 px, kbd esc.
   - Groupes « Actions on #226 » et « Issues & pull requests », lignes h34 rayon 6. Ligne active : fond `--pl-active`. Les correspondances sont surlignées (600 + fond `--pl-accent-soft`). Raccourcis en kbd à droite ; résultats issues avec repo #num et chip de statut.
   - Pied h36 fond `--pl-bg-sunken` : ↑↓ Navigate, ↵ Run, ⌫ Clear #226, ? All shortcuts.
5. **États**
   - **5a loading** (chargement initial) : squelettes (blocs `--pl-skeleton`, animation d'opacité 1.4 s), titre projet en squelette, barre de progression indéterminée 2 px `--pl-accent` sous la toolbar, toolbar « Loading 142 items… » + spinner.
   - **5b syncing** (synchro de fond, discrète) : spinner 11 px + « Syncing 3 of 5… » 11.5 `--pl-fg-3` dans la toolbar, même barre 2 px, point accent sur les cartes modifiées. Ne bloque jamais l'interaction.
   - **5c error** (réseau) : bandeau sous la toolbar (marge `10px 14px 0`, rayon 8, fond `--pl-danger-soft`) avec l'icône wifi_off, « Can't reach api.github.com » 600 `--pl-danger`, « Changes are kept locally and will be pushed when you're back online. », compte à rebours mono « Retrying in 24s » et le bouton « Retry now ⌘R ». La toolbar affiche « Offline » en `--pl-danger` ; la sidebar affiche « Offline · 1 change pending ». Mises à jour optimistes conservées, avec badge Pending.
   - **5d empty** : colonnes vides (zone h64 ring 1px `--pl-border`, « Drop cards here »). Carte centrée 360 px (`--pl-elevated`, `--pl-shadow-pop`, rayon 12) contenant le pictogramme des 3 cases, « This board is empty », sous-texte, et deux boutons : « New issue C » (primaire, focus) et « Add from repo… A ».
6. **onboarding** (fenêtre 780×540, pas de sidebar d'app)
   - Grille `280px 1fr`. À gauche : panneau vibrancy avec l'icône 64 px, le wordmark « PLANCHE. » (`assets/logotype`), le tagline, et la version en bas.
   - À droite (padding `64px 48px 32px`) : « Step 1 of 2 », titre 24/30 700, texte explicatif, champ token h34 en mono, lien « Create a token with the right scopes ↗ », liste « Required scopes » (repo, read:org, project).
   - **6a vérification** : le champ a le focus (ring inset 1px `--pl-focus` + halo 3px `--pl-accent-soft`), « Checking… » + spinner, scope `project` en cours, « Continue » désactivé.
   - **6b validé** : « ✓ Valid » en `--pl-success`, bloc compte (avatar, « Signed in as camille-r · 5 projects found »), tous les scopes cochés, « Continue ↵ » actif et focus.
   - Erreur (token refusé) : voir l'input en état d'erreur dans `PlancheKit` (ring `--pl-danger` + message sous le champ).
7. **settings** : Dialog 760×560 centré sur voile.
   - Nav gauche 188 px (`--pl-bg-sunken`) : General ⌘1, Shortcuts ⌘2, Board ⌘3, Advanced ⌘4.
   - Contenu « General » en trois groupes (bordure 1px `--pl-border`, rayon 8, lignes séparées) :
     - **Account** : avatar, nom, login, fin du token, mention Keychain, « Replace token… », « Sign out » en danger ; scopes et quota API.
     - **Sync** : intervalle en ToggleGroup 1 min / **5 min** / 15 min / Manual (5 min a le focus clavier dans la maquette), switch « Sync when Mac wakes from sleep », « Last sync… » + « Sync now ⌘R ».
     - **Appearance** : 3 vignettes 112×70 (System, Light, Dark) ; la vignette sélectionnée a un ring 2px `--pl-accent`.

## Interactions & Behavior
- **Clavier** :
  - global : ⌘K palette, C nouvelle issue, F filtre, ⌘R synchro, ⌘, réglages, ? aide ;
  - board : J/K ou ↑↓ carte précédente/suivante, ←→ colonne, ↵ ouvrir le détail, Esc fermer, ⇧→/⇧← déplacer la carte d'une colonne, 1 à 5 changer de statut (dans le menu Status), I m'assigner, L labels, ⌘⇧C copier le lien, ⌘O ouvrir sur GitHub, ⌘Z annuler (toast « Undo »).
- **Radix** : DropdownMenu (projet, compte, statut), ContextMenu (clic droit sur une carte : Open, Move to ›, Assign to me, Labels…, Copy link, Remove from project), Popover (sélecteur de labels multi avec recherche et « Create label »), Tooltip (libellé + raccourci, fond `--pl-fg`, délai 500 ms), Dialog (palette, réglages), Switch, ToggleGroup, Checkbox, Toast. Exemples dans `PlancheKit.dc.html`.
- **Motion** :
  - 150 ms (hover, focus, press, fermeture des menus) ;
  - 180 ms (ouverture menu/popover/tooltip : opacité + translateY(−4px) + scale(.98)) ;
  - 200 ms (panneau, dialog, dépôt de carte) ;
  - easing `cubic-bezier(.2,0,0,1)` ;
  - `prefers-reduced-motion` : durées à 0.
- **Drag** : soulèvement immédiat au pointerdown + déplacement de 4 px. Pendant le drag, l'ombre `drag` et la rotation de −2° sont appliquées. Au drop, la carte rejoint sa place en 200 ms. Mise à jour optimiste, puis mutation GraphQL `updateProjectV2ItemFieldValue` (statut) + `updateProjectV2ItemPosition` (ordre). En cas d'échec : retour en place + toast d'erreur.
- **Synchro** : polling à l'intervalle réglé (5 min par défaut) + au retour de veille + à la reprise du focus de la fenêtre. Backoff exponentiel sur les erreurs 5xx et réseau, compte à rebours affiché.

## State Management
- `auth` : { token (Keychain via le bridge natif), user, scopes, status: idle | checking | valid | invalid }
- `projects[]`, `activeProjectId`, `view: 'board' | 'list'`, `filters[]`
- `items` par colonne (id, kind issue/pr, state, title, repo, number, labels, assignees, position), `focusedItemId`, `selectedItemId` (panneau ouvert)
- `sync` : { status: idle | loading | syncing | offline | error, lastSyncAt, progress, retryAt, pendingMutations[] }
- `ui` : paletteOpen, settingsOpen, drag { itemId, overColumn, overIndex }
- `prefs` : theme (system | light | dark), syncInterval (1 | 5 | 15 | manual), syncOnWake

## Design Tokens
Source de vérité : `tokens/planche-tokens.css` (variables `--pl-*`, clair sur `:root`, sombre sur `[data-theme="dark"]`) et `tokens/tailwind.config.js` (preset + alias shadcn/ui en commentaire). Résumé :
- **Accent vermillon** : clair `oklch(0.56 0.18 38)`, texte blanc ; sombre `oklch(0.70 0.16 42)`, texte `#1C1209`.
- **Fonds clair** : bg `#FCFBF9`, sunken `#F3F1ED`, surface `#FFFFFF`. **Fonds sombre** : bg `#1A1917`, sunken `#151413`, surface `#252420`, elevated `#2A2925`.
- **Texte clair** : `#1C1A17` / `#57534C` / `#716C63`. **Texte sombre** : `#EEEBE5` / `#ABA69D` / `#8E897F`.
- **Statuts** : backlog / todo / doing / review / done, hues 250 / 75 / 300 / 150.
- **Typo** : 10.5, 11, 12, 13 (base), 14, 17, 20, 24.
- **Espacements** : base 4 (2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48). Rangées et contrôles 26 px.
- **Rayons** : 3, 5, 6, 8, 10, 12.
- **Ombres** : card, drag, pop, window, ring (valeurs dans le CSS).

## Assets
- `assets/icon/` : icône d'app (direction A « Cases »).
  - `planche-icon.svg` : corps 824 px sur une toile de 1024 avec ombre, pour le Dock et le Finder.
  - `planche-icon-small.svg` : dessin simplifié pour 16 et 32 px.
  - `planche-icon-flat.svg` : la tuile pleine, sans marge ni ombre, pour l'interface (onboarding).
  - `png/` : exports en 16 à 2048 px, et la tuile pleine en 256, 512 et 1024 px.
  - `AppIcon.iconset/` et `AppIcon.appiconset/` (avec `Contents.json`) : les tailles macOS en @1x/@2x. `AppIcon.icns` vient de `iconutil -c icns AppIcon.iconset`.
  - L'app copie `AppIcon.icns` et les PNG 32, 128, 128@2x et 512 dans `app/src-tauri/icons/`.
- `assets/logotype/` : le wordmark « PLANCHE. » et le lockup icône + wordmark, en `ink` (fond clair), `paper` (fond sombre), `black` et `white`, en SVG et en PNG (`png/`).
  - Couleurs de marque : encre `#1B1A17`, papier `#F4EEE3`, vermillon `#D9542B` (`#E8673F` sur fond sombre).
  - L'app dessine le wordmark en SVG inline (`Logotype`), avec les tokens `--pl-logo-ink` et `--pl-logo-dot`.
- `assets/menubar/` : `plancheTemplate.svg` et ses PNG @1x, @2x et @3x, noir + alpha, à utiliser avec `isTemplate = true`.
- **Icônes UI** : Material Symbols Rounded dans la maquette, à remplacer par la librairie du repo.

## Files
- `design/Planche Ecrans.dc.html` : les 11 états, en clair et sombre.
- `design/PlancheWindow.dc.html` : la fenêtre d'app. Tout le markup + les données d'exemple, avec un prop `screen`.
- `design/PlancheKit.dc.html` : composants et leurs états (boutons, inputs, kbd, labels, menus, popover, tooltip, toast, cartes).
- `design/Planche Tokens.dc.html` : planche des tokens.
- `design/Planche Identite.dc.html` : identité (A retenue ; B et C archivées).
- `design/support.js` : runtime nécessaire pour ouvrir les fichiers `.dc.html`, à ne pas porter.
- `tokens/` : fichiers de tokens à copier dans le repo.
