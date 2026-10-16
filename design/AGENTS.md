# AGENTS.md — design/

Instructions pour un agent de code qui implémente l'interface de Planche (React + Tailwind + Radix/shadcn, webview WebKit sur macOS).

## Ordre de lecture
1. Ce fichier.
2. `SPEC.md` : la section qui correspond à l'écran ou au composant que tu construis.
3. `screens/light/NN-*.png` et `screens/dark/NN-*.png` de cet écran : c'est la cible visuelle.
4. Seulement si une valeur manque : le markup dans `prototype/PlancheWindow v2.dc.html` (template HTML en haut, données d'exemple dans `renderVals()` en bas). Tous les styles y sont inline, cherche par texte visible.

## Règles
- **Tokens uniquement.** Toute couleur, ombre, rayon, durée vient de `tokens/planche-tokens.css` via les classes du preset (`bg-card`, `text-fg-3`, `shadow-ring`, `rounded-lg`…) ou `var(--pl-*)`. Aucun hex, rgba ou oklch dans `src/`. Si un token manque, signale-le au lieu d'en inventer un.
- **Vermillon (`accent`) réservé** au logo, à la pastille du projet, à la priorité Urgent et au point « mis à jour par la synchro ». Jamais pour un bouton, un focus ou une sélection.
- **Primaire = encre** : `bg-primary text-primary-fg`. Focus clavier = `focus-visible:shadow-ring outline-none` sur tout élément interactif ; sur le bouton primaire, anneau décalé (`0 0 0 2px var(--pl-bg), 0 0 0 4px var(--pl-ring)`).
- **Statuts, priorités, progression** : uniquement `glyphs/PlancheGlyph.tsx`. Ne pas les remplacer par des icônes de librairie. Les SVG de `glyphs/` servent hors React (menus natifs, docs).
- **Icônes UI** : la librairie du repo (ex. lucide-react), trait fin, 16 px (15–17 selon le contexte), couleur `fg-3` par défaut. Les maquettes utilisent Material Symbols Rounded : prendre l'équivalent le plus proche.
- **Typo** : pile système (SF Pro), base 13/18, `tracking-ui` (-0.005em). Chiffres tabulaires pour ids, compteurs, dates. Mono uniquement pour tokens et code.
- **Thèmes** : chaque écran doit être vérifié en clair ET en sombre contre les deux PNG.
- **Clavier d'abord** : chaque action visible a son raccourci (voir SPEC § Interactions). Toujours afficher le raccourci en `kbd` dans les menus et tooltips.
- **Ne porte pas** `prototype/support.js` ni la structure `.dc.html` : ce sont des maquettes.
- **Ne modifie rien dans `design/`.** Il est régénéré depuis le projet de design et remplacé en bloc.

## Vocabulaire
- *Board* / *List* / *Roadmap* : vues d'un **projet** GitHub Projects (onglets en pilules de l'en-tête).
- *Repository* : vue **Issues** d'un repo (sidebar, section Issues), liste seule, sans board.
- *Draft* : draft item d'un projet (pas encore une issue). *Cancelled* : issue fermée `NOT_PLANNED`. *Deleted* : retirée du projet ou supprimée.
- *Sous-issue* : API sub-issues de GitHub (`parent`, `subIssues`, `subIssuesSummary`).

## Définition de « fini » pour un écran
- Superposé au PNG @2x (à 50 %), l'écart est de 1 px au plus sur les espacements, et il n'y a aucun écart de couleur, dans les deux thèmes.
- Tous les états de la SPEC existent (hover, focus clavier, sélection, vide, chargement, erreur).
- Navigation complète au clavier, sans piège de focus. `prefers-reduced-motion` respecté.
