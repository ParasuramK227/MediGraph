# MediGraph — Frontend

React 19 (TypeScript/TSX) + Vite frontend for MediGraph. Plain CSS throughout — no Tailwind or component library — driven by a centralized design-token system so themes, fonts, and spacing stay consistent app-wide.

See the [root README](../README.md) for full product context.

## Stack

- **React 19** (TSX) + **Vite**
- Plain CSS with CSS custom properties (design tokens) — no CSS-in-JS, no utility framework
- Cytoscape.js (or equivalent) for per-feature graph visualizations
- Custom-built Neo4j-Browser-style panel for the admin graph view (not Cytoscape — this replicates the actual Neo4j Browser UI/UX directly)
- [Lucide](https://lucide.dev) for all icons
- Custom canvas/SVG-based audio-level visualizer, styled after [karlstav/cava](https://github.com/karlstav/cava)

## Layout & Navigation

- Primary dashboard/navigation panel is docked to the **left** of the viewport (not top-nav).
- Fully responsive: desktop-first (this is primarily an in-clinic workstation tool) but usable down to mobile widths, matching production-grade responsive behavior rather than a fixed desktop-only layout.

## Routing structure (indicative)

```
/                          → Dashboard / patient list
/patients/:id              → Patient detail view
                              — includes embedded scribe widget
                              — includes patient-scoped graph view
/sectors/:id                → Sector/cohort view + scoped graph
/treatment-intelligence     → Treatment Intelligence feature
/medicines                  → Medicines feature
/graph                      → Knowledge Graph Explorer (per-feature scoped views)
/admin/graph                → Admin Graph Panel (Neo4j Browser replica)
                              — full DB view/manipulation
                              — patient consultation notes visible as graph nodes
/chatbot                    → Existing chatbot, now with consultation-note query intent
```

## Scribe Widget

The scribe UI is **not** a standalone page. It is embedded in two places:

1. Inside each patient's detail view.
2. Inside the Admin Graph Panel, alongside the Neo4j-replica graph view, so notes can be viewed in the same place as the raw graph data.

States the widget must visually represent (never leave the UI ambiguous about what's happening):

`idle → recording (with live audio-level visualizer) → transcribing (live partial transcript) → review/edit (doctor-editable) → extracting → saved`

On transcription failure: show retry vs. "switch to typed note" as an explicit choice. After 3 consecutive failures, only the typed-note path remains available.

## Design Tokens

All theme values live in a single source of truth (e.g. `src/styles/tokens.css`) as CSS custom properties, so a single change propagates everywhere:

```css
:root {
  --font-heading: 'Outfit', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono-stat: 'Departure Mono', monospace;

  --radius-base: 8px; /* rounded corners app-wide */

  /* Light theme */
  --color-bg: #ffffff;
  --color-accent: var(--color-brand); /* proposed brand color, TBD */

  /* Dark theme (Neo4j-Browser-inspired) overrides in [data-theme="dark"] */
}
```

- `--font-heading`, `--font-body`, `--font-mono-stat` are the **only** place font families are declared; components reference the variable, never a literal font name.
- Brand accent color is currently unset/proposed — see root README.

## Themes

- **Light theme:** white background, warmer blue accents, rounded corners.
- **Dark theme:** modeled directly on the Neo4j Browser dark UI — near-black background, colored type/relationship chips, monospace stat readouts. Applied consistently across all knowledge-graph-adjacent pages, not just `/admin/graph`.

Theme switching should be a single top-level toggle (e.g. a `data-theme` attribute on `<html>`), not a per-component setting.

## Admin Graph Panel — Reference Spec

Replicates, as closely as possible, the real Neo4j Browser:

- Top status bar: instance URL, database name, active user, connection indicator, "Connect to AuraDB" affordance.
- Left icon rail: database/home, bookmarks, history, docs, dev tools, settings.
- Left "Database information" panel: node labels and relationship types rendered as colored pill/chip lists, plus property keys.
- Cypher-style command input (`neo4j$` prompt) with per-query bookmark/run icons and a scrollable query history.
- Graph canvas with **Graph / Table / RAW** view tabs, search/download/layout controls, and zoom/pan/fit/force-layout controls.
- Nodes colored strictly by label; relationship labels rendered along the edge line.
- Right "Results overview" panel: node/relationship counts broken down by type as colored pills.
- Footer: query timing readout (e.g. "Started streaming N records after Xms and completed after Yms").

Reference screenshots for this spec are held alongside the design assets for this module.

## Conventions

- Keep components small and colocated with their styles (`Component.tsx` + `Component.css`).
- No inline styles for anything theme-related — always go through the token system.
- Icons: import individual icons from `lucide-react`, never bundle the full icon set.
