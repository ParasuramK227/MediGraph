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

> **Status (scaffold task complete):** routing is wired with these routes rendered into the `AppLayout` shell via React Router (`react-router-dom` v7). Individual feature pages currently render placeholder content; the scribe widget, per-feature graph views, and the admin panel are implemented in later tasks.

## Layout shell (implemented in the scaffold task)

- `src/components/layout/AppLayout.tsx` — left-docked navigation panel (with `SideNav.tsx`) plus a top bar containing the backend-connectivity status (`BackendStatus.tsx`) and the `ThemeToggle.tsx`.
- Responsive: the left panel collapses to a drawer with a hamburger toggle below `768px`.
- `src/lib/api.ts` — `fetchHealth()` pings `GET /api/health` to confirm the backend is reachable; polled periodically by `BackendStatus`.
- Dev proxy in `vite.config.ts` forwards `/api` → `http://localhost:5000`, so the frontend can call the backend same-origin during development (override via `VITE_API_BASE`).

## Scribe Widget

The scribe UI is **not** a standalone page. It is embedded in two places:

1. Inside each patient's detail view.
2. Inside the Admin Graph Panel, alongside the Neo4j-replica graph view, so notes can be viewed in the same place as the raw graph data.

States the widget must visually represent (never leave the UI ambiguous about what's happening):

`idle → recording (with live audio-level visualizer) → transcribing (live partial transcript) → review/edit (doctor-editable) → extracting → saved`

On transcription failure: show retry vs. "switch to typed note" as an explicit choice. After 3 consecutive failures, only the typed-note path remains available.

## Design Tokens

All theme values live in a single source of truth, `src/styles/tokens.css`, as CSS custom properties, so a single change propagates everywhere.

- Brand accent is a placeholder value in `--color-brand` with an inline `/* PLACEHOLDER — pending design decision */` marker, so it's trivial to find and swap later.

### Fonts (how they're loaded)

| Role | Font | Loading |
|---|---|---|
| Headings (`--font-heading`) | **Outfit** | Google Fonts CDN (via `@import` in `src/index.css`) |
| Body (`--font-body`) | **Inter** | Google Fonts CDN |
| Numbers/stats (`--font-mono-stat`) | **Departure Mono** | Self-hosted — `@font-face` in `src/styles/fonts.css`, webfonts in `public/fonts/` (copied from `/usr/share/fonts/`) |

Components reference `var(--font-*)` / `var(--color-*)` tokens only; no component hardcodes a literal font-family or hex color.

The `.stat` utility class applies `--font-mono-stat` to numeric readouts app-wide.

### Structure

```
src/styles/tokens.css     design tokens (light in :root, dark in [data-theme="dark"])
src/styles/fonts.css      @font-face for the self-hosted Departure Mono webfont
src/styles/page.css       shared page-level styles (headings, stat cards)
```

## Themes

- **Light theme:** white background, warmer blue accents, rounded corners.
- **Dark theme:** modeled directly on the Neo4j Browser dark UI — near-black background, colored type/relationship chips, monospace stat readouts. Applied consistently across all knowledge-graph-adjacent pages, not just `/admin/graph`. **This is the default theme.**

Theme switching is a single top-level toggle implemented with a `data-theme` attribute on `<html>`, managed by `src/theme/` (a `ThemeProvider` + `useTheme` hook that persists the choice to `localStorage`). The `<html>` element defaults to `data-theme="dark"` in `index.html` to avoid a flash of unstyled content before React mounts.

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
