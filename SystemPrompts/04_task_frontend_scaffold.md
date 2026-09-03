# Task: Frontend Scaffold

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold) for API routes to point at. Does not depend on Task 03.

## Context
Read `/frontend/README.md` in full before starting — it defines routing structure, the design token approach, and theme requirements. This task builds the shell everything else (scribe widget, admin panel) will slot into — get the token system right here since every later task depends on it.

## Scope
Set up the React 19 (TSX) + Vite project structure, routing, the centralized design-token/theme system, and the left-docked navigation shell. Do **not** build the scribe widget UI or the admin graph panel in this task — those are separate tasks. Placeholder pages are fine for routes that aren't built yet.

## What to build

1. **Project setup**
   - React 19 + TypeScript + Vite, plain CSS (no Tailwind/component library).
   - `lucide-react` installed for icons.

2. **Design token system**
   - A single source-of-truth stylesheet (e.g. `src/styles/tokens.css`) defining CSS custom properties for: font families (`--font-heading: 'Outfit'`, `--font-body: 'Inter'`, `--font-mono-stat: 'Departure Mono'`), border radius, spacing scale, and color variables for both themes.
   - Load Outfit, Inter, and Departure Mono (self-hosted or via a font CDN — your call, document which).
   - No component should ever hardcode a font-family or hex color directly — always reference a variable.

3. **Theme system**
   - Light theme: white background, warmer blue accent.
   - Dark theme: modeled on the Neo4j Browser dark UI (near-black background, colored chip accents) — this theme applies consistently across all knowledge-graph-adjacent pages, not just the future admin panel.
   - Implement via a `data-theme` attribute on `<html>` (or equivalent) with a toggle component, not per-component theme props.
   - Brand accent color is not yet finalized — pick a reasonable placeholder blue and clearly mark it as `--color-brand: /* PLACEHOLDER — pending design decision */` so it's easy to find and swap later.

4. **Layout shell**
   - Left-docked navigation/dashboard panel (not top-nav), containing links to each route below.
   - Fully responsive down to mobile — the left panel should collapse to an appropriate mobile pattern (e.g. drawer/hamburger) rather than just breaking.

5. **Routing (placeholder pages where noted)**
   ```
   /                          → Dashboard / patient list
   /patients/:id              → Patient detail (placeholder — scribe widget added later)
   /sectors/:id               → Sector/cohort view (placeholder)
   /treatment-intelligence    → Treatment Intelligence (placeholder)
   /medicines                 → Medicines (placeholder)
   /graph                     → Knowledge Graph Explorer (placeholder)
   /admin/graph               → Admin Graph Panel (placeholder — built in a later task)
   /chatbot                   → Chatbot (placeholder, or wire up if it already exists)
   ```

## Definition of done
- [ ] App boots via `vite dev` with no errors
- [ ] Theme toggle switches the whole app between light/dark instantly, no page reload
- [ ] Every route above renders (even if placeholder content) without crashing
- [ ] Left nav is present and collapses sensibly at mobile widths
- [ ] Zero hardcoded font-family or color values outside `tokens.css`
- [ ] Lucide is the only icon source used anywhere

## Explicit non-goals for this task
- No scribe widget UI (separate task)
- No admin graph panel implementation (separate task — needs Neo4j reference screenshots)
- No Cytoscape/graph-rendering logic yet — placeholder pages only
- No API calls wired up yet beyond what's needed to confirm the backend is reachable (a simple health-check ping is fine, nothing more)
- No frontend tests
