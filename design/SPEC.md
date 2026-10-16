# Planche v2 — Spécification d'interface

## Overview
Planche est un client desktop (macOS) pour GitHub Projects, pilotable au clavier : board et liste par statut, page issue avec sous-issues, palette ⌘K, synchro en arrière-plan, onboarding par token, réglages. Ce document décrit chaque région de la fenêtre, chaque écran et chaque comportement. Les valeurs exactes sont dans `tokens/`, l'apparence attendue dans `screens/`, le markup de référence dans `prototype/PlancheWindow v2.dc.html`.

**Ce qui change par rapport à la v1**
- Le vermillon n'apparaît plus que sur le logo, la couleur du projet, la priorité Urgent et le point « mis à jour par la synchro ».
- Focus clavier et sélection : anneau et fonds **neutres** (`--pl-ring`, `--pl-active`). Le bouton principal est **à l'encre** (`--pl-primary`).
- Sidebar à plat sur le chrome de la fenêtre (plus de vibrancy). Le contenu est dans un **panneau en retrait** (marge 8 px, rayon 10).
- Statuts en **cercles** (composant `glyphs/PlancheGlyph.tsx`) : Draft, Todo, In progress, In review, Done, Cancelled, Deleted. Ajout des priorités et de la progression des sous-issues.
- Le panneau latéral de détail est remplacé par une **page issue** complète avec **sous-issues**, PR liées, activité et colonne de propriétés.
- Nouvelle vue **Liste** groupée par statut, avec les sous-issues dépliables sous leur parent.

---

## Structure de fenêtre (commune)
- Fenêtre 1440×900 de référence (min. conseillée 1100×700), `titleBarStyle: hiddenInset`, rayon 12. Traffic lights à x=16, y=16.
- Fond de fenêtre `--pl-bg-sunken`. Layout : **Sidebar** 220 px (transparente sur le chrome) + **panneau de contenu** `flex:1`, `margin: 8px 8px 8px 0`, rayon 10, fond `--pl-bg`, `box-shadow: var(--pl-shadow-panel)`, `overflow:hidden`.
- Police : pile système (SF Pro), 13/18, `letter-spacing:-0.005em`, antialiased. **Chiffres tabulaires** (`font-variant-numeric: tabular-nums`) pour ids, compteurs, dates. SF Mono uniquement pour tokens et code.
- **Focus clavier** : `:focus-visible { outline:none; box-shadow: 0 0 0 2px var(--pl-ring) }`. Sur le bouton principal : `0 0 0 2px var(--pl-bg), 0 0 0 4px var(--pl-ring)`. Rangées de liste : fond `--pl-active` au lieu d'un anneau.
- **Kbd** : 18 px de haut, rayon 4, `box-shadow: inset 0 0 0 1px var(--pl-border-strong)`, 11 px `--pl-fg-3`, police système. Sur le bouton principal : fond `rgba(128,128,128,.28)`.

### Sidebar
Padding `42px 10px 10px`, gap 18.
1. Ligne espace de travail : mini-icône d'app 18 px (rayon 5) + « Planche » 600 + chevron ; boutons 28×28 recherche (ouvre ⌘K) et nouvelle issue (fond `--pl-card` + `--pl-shadow-card`).
2. Navigation : Inbox, My issues, Reviews, Drafts. Rangées h28, rayon 6, gap 10, icône 17 px `--pl-fg-3`, texte 500 `--pl-fg-2`, compteur 11.5 à droite.
3. **Projects** (titre 11.5/500 `--pl-fg-3`, repliable) : pastille 10×10 rayon 3 couleur du projet. Le projet courant a le fond `--pl-active`. Les vues se choisissent dans les onglets de l'en-tête.
4. **Issues** (repliable) : un item par repository (icône dossier + `owner/name` + nombre d'issues ouvertes). Ouvre la vue Repository : **liste seule, pas de board**.
5. **Masquer des items** (Projects et Issues) :
   - survol d'un item : le compteur laisse place à un bouton `more_horiz` 22×22 ; clic ou clic droit ouvre un menu (Open ↵, Open on GitHub ⌘O, Pin to top, **Hide from sidebar ⌘⇧H**, Manage sidebar…) ;
   - les items masqués sont regroupés dans une dernière rangée « N hidden » (`visibility_off`, 12.5 `--pl-fg-3`) ;
   - clic : les items masqués apparaissent à 55 % d'opacité, avec un bouton `visibility` pour les réafficher, et la rangée devient « Collapse hidden » ;
   - persister par compte (`prefs.sidebar.hidden: { projects: id[], repos: nameWithOwner[] }`).
6. Pied : point d'état 6 px + « Synced 2 min ago » 12 `--pl-fg-3` + réglages.

### En-tête (Board, Liste, Repository)
- **Ligne 1** h48, sans bordure, padding `0 12px 0 18px` : pastille projet (ou icône dossier pour un repository) + nom 500, étoile, more. À droite : indicateur de synchro (si actif), copier le lien, notifications. Zone de drag de fenêtre (`-webkit-app-region: drag`, `no-drag` sur les contrôles). La création d'issue passe par le bouton de la sidebar et la touche C.
- **Ligne 2** h42 : **onglets en pilules** h28 rayon 14 (icône 15 + nom 500 + compteur éventuel). Actif : fond `--pl-active`, sans contour. Inactif : contour `inset 0 0 0 1px var(--pl-border-strong)`. Bouton + rond pour ajouter une vue. À droite : compteur « 23 issues », pilule « 2 filters » (ouvre le popover de filtres) et bouton rond 30 px Display.
  - Projet : Board / List / Roadmap.
  - Repository : Open 18 / Closed 64 / All 82.

### Board
`display:flex; gap:10px; padding:2px 12px 12px`. **Colonne** 232 px, fond `--pl-hover`, rayon 10, padding `2px 5px 6px`, gap 6.
- En-tête h34 : glyphe de statut 14 + nom 500 + compteur 12 `--pl-fg-3` ; à droite more et add (24×24).
- **Carte** : fond `--pl-card`, rayon 8, `--pl-shadow-card`, padding `11px 12px`, gap 8.
  - Ligne 1 (h18, 12 `--pl-fg-3`) : id `app#235`, puis pour une sous-issue `› titre du parent` tronqué ; avatar 16 à droite. Non assignée : cercle 14 px en contour `--pl-fg-3` à 60 %.
  - Ligne 2 : glyphe de statut + titre 13/18 500, `text-wrap: pretty`. Done/Cancelled : titre en `--pl-fg-3`.
  - Ligne 3 : priorité (carré 22×22 rayon 6), chips h20 rayon 5 contour `--pl-border` : progression des sous-issues (anneau 12 + « 2/5 »), PR liée, labels.
  - Ligne 4 : « Created Oct 13 », 12 `--pl-fg-3`.
  - États : hover `+ 0 0 0 1px var(--pl-border-strong)` ; focus clavier `0 0 0 2px var(--pl-ring)` ; mise à jour par la synchro : point 8 px `--pl-accent` en haut à droite ; en attente (offline) : « Pending » en `--pl-warning` sur la ligne 1.
- Sous les colonnes sans « N more » : rangée + h32 discrète (carte au survol).
- **Colonnes masquées** à droite (196 px) : titre « ▾ Hidden columns » puis une carte h40 par statut masqué (glyphe, nom, compteur). Par défaut : Draft et Cancelled. Clic : affiche la colonne ; glisser une carte dessus : change le statut.

### Liste
- En-tête de groupe h34, fond `--pl-hover`, bordure basse : chevron (déplié/replié) + glyphe + nom 500 + compteur + bouton add.
- Rangée h38, bordure basse, gap 10 : chevron de sous-issues (16 px, vide si aucune) · priorité · id (58 px, 12 `--pl-fg-3`) · statut · titre 500 (ellipsis) · chips pilule (h22, rayon 11) : progression, PR, labels · avatar 18 · date (44 px, alignée à droite). Sélection / focus : fond `--pl-active`.
- **Sous-issues dépliées** : rangées indentées avec un trait d'arborescence (1px `--pl-border-strong`, vertical + coude de 9 px à mi-hauteur ; la dernière s'arrête au coude). Toutes les sous-issues s'affichent sous leur parent, quel que soit leur statut.

### Page issue (détail)
- Toolbar h44 : fil d'Ariane projet › (parent ›) id. À droite : position « 1 / 23 » + précédent/suivant (K/J), copier le lien, ouvrir sur GitHub, more.
- Corps : grille `minmax(0,1fr) 300px`.
  - **Colonne principale**, padding `30px 48px`, contenu centré `max-width:720px`, gap 26 :
    - (sous-issue) **bandeau parent** h36 rayon 8 contour `--pl-border` : « Sub-issue of » + glyphe + id + titre du parent + progression du parent + navigation entre sœurs « ‹ 3 of 6 › » ;
    - titre 24/30 600, `letter-spacing:-0.018em` ; description 14/22 ;
    - **Sous-issues** : en-tête h28 (chevron, « Sub-issues » 600, anneau + « 2/5 », boutons display et add) puis boîte rayon 8 contour `--pl-border` : rangées h36 (statut, id 56 px, titre, PR, priorité, avatar) et dernière rangée « + Add sub-issue ⇧C ». Les Cancelled sont barrées et exclues du compteur (2 Done sur 5 actives) ;
    - **Pull requests** : rangée h40 rayon 8 contour : icône merge (couleur par état), numéro, titre, checks (icône + « 3/3 »), état en pilule, avatar ;
    - **Activity** : en-tête avec bordure basse, « Unsubscribe », abonnés. Timeline (trait vertical 1px `--pl-border` à x=11) : événements h30 12.5 `--pl-fg-3`, avatar 18 ou glyphe de statut (changement de statut : « from → to » avec noms en `--pl-fg-2`). Commentaire : carte `--pl-card` rayon 10. Éditeur : contour `--pl-border-strong` rayon 10, bouton « Comment ⌘↵ » désactivé tant que vide.
  - **Colonne propriétés** 300 px, bordure gauche, padding 12 : grille `84px 1fr`, rangées min 32 ; valeur = bouton ghost h28 rayon 6 (Status, Priority, Assignee, Labels, Parent, Milestone, Iteration, Repository). Puis séparateur, champs du projet (Estimate, Area), et en bas : créé par, mis à jour, « Open on GitHub ⌘O ».
- **Menu Statut** (S ou clic) : popover 252 px, rayon 10, `--pl-shadow-pop`, aligné à droite sous la propriété. Champ « Change status… » + kbd S, puis Draft…Cancelled (h30, glyphe, check sur l'actuel, chiffre 1–6), séparateur, « Delete issue… » en `--pl-danger` avec ⌘⌫. Le déclencheur garde le fond `--pl-active` tant que le menu est ouvert.

### Statuts (glyphs/PlancheGlyph.tsx)
| Statut | Glyphe | Correspondance GitHub | Raccourci |
|---|---|---|---|
| Draft | anneau pointillé `--pl-fg-3` | draft item du projet | 1 |
| Todo | anneau `--pl-fg-3` | ouverte, Status = Todo | 2 |
| In progress | anneau + demi-disque `--pl-s-doing` | ouverte, Status = In progress | 3 |
| In review | anneau + 3/4 `--pl-s-review` | Status = In review, PR ouverte | 4 |
| Done | disque plein `--pl-s-done` + coche | fermée, completed | 5 |
| Cancelled | disque `--pl-fg-3` + croix | fermée, not planned / duplicate | 6 |
| Deleted | disque `--pl-danger` + moins | retirée du projet / supprimée | ⌘⌫ |

Priorités : No priority (3 tirets), Low/Medium/High (barres montantes, actives `--pl-fg-2`, inactives `--pl-border-strong`), Urgent (carré plein `--pl-accent` + « ! »). Progression : anneau 2px, fond `--pl-border-strong`, arc `--pl-fg-2` (vert `--pl-s-done` à 100 %).

---

## Screens / Views
Captures PNG @2x dans `screens/light/` et `screens/dark/` (numérotées comme ci-dessous). Version interactive : `prototype/Planche Ecrans v2.dc.html`. L'état correspond au prop `screen` de `prototype/PlancheWindow v2.dc.html`.

| # | prop `screen` | Fichier |
|---|---|---|
| 1 | board | 01-board.png |
| 2 | list | 02-list.png |
| 2b | repo | 03-repo.png |
| 2c | sidebar | 04-sidebar-hide.png |
| 3 | detail | 05-issue.png |
| 4 | status | 06-issue-status-menu.png |
| 5 | subissue | 07-sub-issue.png |
| 6 | palette | 08-palette.png |
| 7 | drag | 09-drag.png |
| 8a | loading | 10-loading.png |
| 8b | syncing | 11-syncing.png |
| 8c | error | 12-offline.png |
| 8d | empty | 13-empty.png |
| 9a | onboarding | 14-onboarding-checking.png |
| 9b | onboarding-ok | 15-onboarding-valid.png |
| 10 | settings | 16-settings.png |

1. **board** : focus clavier sur app#226. Colonnes Todo 4, In progress 3, In review 2, Done 12 (« 9 more ») ; masquées : Draft 2, Cancelled 3.
2. **list** : groupes In review, In progress, Todo (app#226 déplié avec ses 6 sous-issues), Draft et Done repliés.
   - **2b repo** : issues de `planche/app`, onglet Open. Groupes par statut de projet (In progress, Todo, In review replié) puis **Not in a project** (issues du repo absentes de tout projet, sans glyphe de groupe). Chaque rangée porte une pilule projet (pastille + nom) au lieu de la priorité, qui est un champ de projet.
   - **2c sidebar** : menu ouvert sur « Design system » (survol, bouton more actif, « Hide from sidebar » en surbrillance). Section Issues dépliée : deux repos masqués en gris avec le bouton œil, et la rangée « Collapse hidden ».
3. **detail** : page app#226.
4. **status** : page app#226 avec le menu Statut ouvert, survol sur In progress.
5. **subissue** : page app#235, sous-issue de app#226.
6. **palette** : Dialog 640 px, top 120, rayon 12, sur voile `--pl-overlay`. Chip de contexte (glyphe + id + titre, fond `--pl-hover`), requête 16 px, groupes « Change status » (Set status to …, actuel marqué « Current », chiffres) et « Issues ». Rangée active fond `--pl-active`. Pied h38 : ↑↓, ↵ Apply, ⌫ Clear context, esc.
7. **drag** : app#223 soulevée (`rotate(-2deg) scale(1.02)`, `--pl-shadow-drag`). Origine : carte voilée à 70 % par `--pl-bg`. Cible : emplacement h96 rayon 8, bordure 1.5px pointillée `--pl-border-strong` sur `--pl-hover` ; colonne cible : anneau inset 1px `--pl-ring`, compteur +1. Bulle encre « ◔ In progress · position 2 ». Barre d'aide : ←→ Status, ↑↓ Position, ↵ Drop, esc. Mêmes déplacements au clavier (dnd-kit + KeyboardSensor).
8. **États**
   - **8a loading** : squelettes `--pl-skeleton` (cercles et barres), barre indéterminée 2 px `--pl-fg-3` sous la barre de filtres, « Loading 142 items… » + spinner dans la toolbar, « Loading project… » dans la sidebar.
   - **8b syncing** : spinner 11 px + « Syncing 3 of 5… » dans la toolbar, même barre 2 px, point vermillon sur les cartes modifiées. Ne bloque jamais l'interaction.
   - **8c error** : bandeau h38 rayon 8 `--pl-danger-soft` sous la barre de filtres (marge 12) : wifi_off, « Can't reach api.github.com » 600 `--pl-danger`, explication, « Retrying in 24s », « Retry now ⌘R ». Toolbar « Offline » en `--pl-danger`, sidebar « Offline · 1 change pending ». Mise à jour optimiste conservée avec « Pending ».
   - **8d empty** : projet « Docs & site ». Colonnes avec zone de dépôt h72 en pointillé « Drop issues here ». Carte centrée 360 px (`--pl-elevated`, `--pl-shadow-pop`, rayon 12) : pictogramme 3 cases neutre, « This board is empty », texte, « New issue C » (primaire, focus) et « Add from repository A ».
9. **onboarding** (fenêtre 780×540) : grille `270px 1fr`. À gauche, sur le chrome : icône 64, logotype PLANCHE (Archivo `wdth` 72, 850, 28 px), tagline, version. À droite, panneau en retrait : « Step 1 of 2 », titre 22/28 600, texte, champ token h34 rayon 7 (mono), lien souligné `--pl-fg-2`, scopes (glyphe Done ou spinner).
   - **9a vérification** : champ focus (`inset 0 0 0 1px var(--pl-fg-3), 0 0 0 3px var(--pl-active)`), « Checking… », « Continue » désactivé.
   - **9b validé** : « Valid » en `--pl-success`, bloc compte, scopes OK, « Continue ↵ » primaire avec focus.
10. **settings** : Dialog 760×560. Nav 188 px `--pl-bg-sunken` (General ⌘1, Shortcuts ⌘2, Board ⌘3, Advanced ⌘4). Groupes Account, Sync (segmented sur `--pl-active`, item actif `--pl-card`; switch encre), Appearance (vignettes, sélection anneau 2px `--pl-fg`).

## Interactions & Behavior
- **Clavier** :
  - global : ⌘K palette, C nouvelle issue, F filtre, ⌘R synchro, ⌘, réglages, ? aide ;
  - board / liste : J/K ou ↑↓ précédent/suivant, ←→ colonne (board) ou replier/déplier (liste), ↵ ouvrir la page issue, Esc retour, ⇧→/⇧← changer de statut d'un cran ;
  - page issue : S menu statut, 1–6 statut direct, P priorité, I m'assigner, L labels, ⇧C nouvelle sous-issue, ⌘⌫ supprimer (confirmation), ⌘⇧C copier le lien, ⌘O ouvrir sur GitHub, ⌘Z annuler (toast).
- **Radix** : DropdownMenu (statut, priorité, projet), ContextMenu (clic droit carte/rangée), Popover (labels multi + « Create label »), Tooltip (fond `--pl-primary`, délai 500 ms), Dialog (palette, réglages), Switch, ToggleGroup, Checkbox, Toast. Exemples dans `prototype/PlancheKit v2.dc.html`.
- **Motion** : 120 ms (hover, focus, press) ; 160 ms (menus, popovers, tooltips : opacité + translateY(−4px) + scale(.98)) ; 200 ms (dialog, changement d'écran, dépôt de carte) ; easing `cubic-bezier(.2,0,0,1)` ; `prefers-reduced-motion` : durées à 0.
- **Statuts côté API** : Draft = `DraftIssue` (convertir via `convertProjectV2DraftIssueItemToIssue`) ; Todo / In progress / In review = champ single-select Status (`updateProjectV2ItemFieldValue`) ; Done = `closeIssue(stateReason: COMPLETED)` + Status ; Cancelled = `closeIssue(stateReason: NOT_PLANNED)` ; Deleted = `deleteProjectV2Item` (ou `deleteIssue` si droits admin, avec confirmation).
- **Sous-issues** : API GitHub sub-issues (`subIssues`, `parent`, `subIssuesSummary { total completed percentCompleted }`, `addSubIssue`, `reprioritizeSubIssue`).
- **Drag** : soulèvement au pointerdown + 4 px. Mise à jour optimiste, puis `updateProjectV2ItemFieldValue` + `updateProjectV2ItemPosition`. En cas d'échec : retour en place + toast.
- **Synchro** : polling à l'intervalle réglé (5 min par défaut), au réveil, au focus de la fenêtre. Backoff exponentiel sur 5xx/réseau avec compte à rebours.

## State Management
- `auth` : { token (Keychain), user, scopes, status: idle | checking | valid | invalid }
- `projects[]`, `repos[]`, `route: project(id, view: board | list | roadmap) | repo(nameWithOwner, state: open | closed | all) | issue(id)`, `filters[]`
- `items` : id, kind (draft | issue | pr), status (draft | todo | progress | review | done | cancelled), priority (none | urgent | high | medium | low), title, repo, number, labels, assignees, position, parentId, subIssues { total, completed }, linkedPRs[]
- `focusedItemId`, `expandedParents` (liste), `openMenu`
- `sync` : { status: idle | loading | syncing | offline | error, lastSyncAt, progress, retryAt, pendingMutations[] }
- `ui` : paletteOpen, settingsOpen, drag { itemId, overColumn, overIndex }
- `prefs` : theme, syncInterval, syncOnWake, sidebar { hidden: { projects[], repos[] }, pinned[], collapsedSections[] }

## Design Tokens
Source de vérité : `tokens/planche-tokens.css` (+ `tokens/tokens.json` au format DTCG, généré depuis le CSS) (`--pl-*`, clair sur `:root`, sombre sur `[data-theme="dark"]`) et `tokens/tailwind.preset.js` (preset + alias shadcn/ui en commentaire). Nouveautés v2 : `--pl-card`, `--pl-primary`, `--pl-primary-fg`, `--pl-ring` (`--pl-focus` en est un alias), `--pl-shadow-panel`, `--pl-s-draft`, `--pl-s-cancelled`, `--pl-s-deleted`. Supprimés : `--pl-sidebar`, `--pl-kbd`, `--pl-s-backlog`.
- **Fonds clair** : panneau `#FCFBF9`, chrome `#F1EFEB`, carte `#FFFFFF`. **Sombre** : panneau `#191817`, chrome `#121211`, carte `#21201E`, elevated `#242321`.
- **Texte** : clair `#1C1A17` / `#57534C` / `#716C63` ; sombre `#EEEBE5` / `#ABA69D` / `#86817A`.
- **Typo** : 11, 11.5, 12, 13 (base), 14 (corps issue), 16, 22, 24.
- **Tailles** : rangées 28 / menus 30 / sous-issues 36 / liste 38 ; toolbar 44, filtres 40, sidebar 220, colonne 226, propriétés 300.
- **Rayons** : 4, 5, 6, 8, 10, 12, pilule 11.

## Marque
- Fichiers : `brand/`. Icône d'app = direction A « Cases » (trois colonnes de cases, une case vermillon). En dessous de 32 px, utiliser `brand/icon/planche-icon-small.svg` (dessin simplifié).
- Logotype : « PLANCHE » vectorisé (Archivo, `wdth` 72, graisse 850, capitales) ; ne pas le recomposer en texte dans l'app, utiliser les SVG de `brand/logotype/`.
- Couleurs de marque : encre `#1B1A17`, vermillon `#D9542B`, papier `#EDE5D6`.
- Barre de menus : `brand/menubar/plancheTemplate*.png`, `NSImage.isTemplate = true`.
- Dans l'interface, la mini-icône 18 px de la sidebar reprend l'icône d'app (rayon 5).
