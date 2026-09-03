# Task: Admin Graph Panel (Neo4j Browser Replica)

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold — specifically the `/api/graph/cypher` passthrough endpoint), Task 04 (Frontend Scaffold — theme system).

**Reference screenshots are attached to this task.** This is the highest-fidelity visual task in the project — match the reference images closely rather than approximating from the text description alone.

## Context
Read the "Admin Graph Panel — Reference Spec" section of `/frontend/README.md` and the "Admin Graph Panel — what it queries" section of `/graph/README.md`. This page is a near-exact functional and visual replica of the real Neo4j Browser, built at `/admin/graph`, using the `/api/graph/cypher` passthrough endpoint to run real queries against AuraDB.

## What to build

### Layout (top to bottom, left to right)
1. **Top status bar**: instance URL (`neo4j://...`), database name with a dropdown chevron, connected user, a green connection-status dot, and a "Connect to AuraDB" link on the right (can be inert/decorative if not functionally needed).
2. **Left icon rail**: vertical stack of icons (database/home, bookmark, history/clock, docs/book, dev-tools braces, settings gear) — Lucide equivalents. Only one is "active"/highlighted at a time.
3. **Left "Database information" panel**, directly beside the icon rail:
   - Node labels rendered as colored pill/chip buttons (e.g. `ClinicalStudy`, `Disease`, `Distributor`, `Doctor`, `DrugBatch`, `Evidence`, `Hospital`, `LabTest`, `Manufacturer`, `MedicalRecord`, `Medication`, `Patient`, `Pharmacy`, `Supplier`, `Symptom`, `Treatment`, `Warehouse`, plus the new `ConsultationNote`). Each label gets a **consistent, distinct color** used everywhere that label appears (chips here, nodes in the graph canvas, chips in results overview) — colors must match 1:1 across all three locations.
   - Relationship types rendered the same way as pills below the node labels (`ALTERNATIVE_TO`, `CITES_STUDY`, `HAS_DIAGNOSIS`, `HAS_CONSULTATION_NOTE`, etc.)
   - "Property keys" section below that, as plain-text pill chips (not colored), with a **collapsible "Show all property keys (N more)"** toggle if the list is long — don't render all property keys by default if there are more than ~15.
   - A small "Last update" timestamp with a refresh icon at the bottom of this panel.

4. **Main query area** (right of the DB info panel):
   - A `neo4j$` prompt input at the top, styled as a command-line input, with a bookmark icon and a run/play icon on its right side.
   - **Query results stack vertically as a scrollable history** — each executed query produces its own result block below the previous one, REPL-style. Do not replace the previous result when a new query runs; append below it, matching the reference screenshots.
   - Each result block has its own **Graph / Table / RAW** tab toggle.
     - **Graph tab**: node-link diagram. Nodes colored strictly per their label's assigned color (per the Database Information panel). Relationship labels render along/rotated with the edge line. Zoom in/out, fit-to-view, and force-layout controls in the bottom-right of the canvas. Search and download icons top-right of the canvas, plus a layout/panel-toggle icon.
     - **Table tab**: plain tabular rows/columns view of the same result set (see reference — e.g. `entity` / `batch_id` columns).
     - **RAW tab**: raw JSON-ish output of the result (can be a simple pretty-printed JSON dump).
   - Each result block has a small footer line: `Started streaming N records after Xms and completed after Yms.` — this can be a real measured value from the API call, not necessarily hardcoded.
   - A **Results overview** panel to the right of each result block showing node/relationship counts broken down by type as colored pills (matching the same per-label colors), e.g. `Nodes (45)` → `* (45)`, `Disease (22)`, `Evidence (23)`.

### Consultation notes visibility
- `ConsultationNote` nodes and their `HAS_CONSULTATION_NOTE` relationship to `Patient` must be queryable and visible here like any other node/relationship — this is the "view a patient's notes from the graph, not just the patient page" requirement from the root README.
- Embed the scribe widget (from Task 05) somewhere on this page as well, per the original requirement that notes can be created/viewed alongside the raw graph data — placement is your judgment call (e.g. a collapsible side panel), but it must be present.

### Styling
- This page **always** renders in the dark theme, regardless of the app-wide light/dark toggle — it should look like the Neo4j Browser dark UI even if the rest of the app is currently in light mode. (Confirm this against the reference screenshots: near-black background, colored chips, light gray/white monospace-leaning text.)
- Numbers/counts/stats use `--font-mono-stat` (Departure Mono) per the design token system.

## Definition of done
- [ ] Layout matches the reference screenshots' structure (status bar, icon rail, DB info panel, query bar, stacked results, results overview)
- [ ] Node/relationship label colors are consistent across the DB info panel, graph canvas, and results overview panel
- [ ] Graph / Table / RAW tabs all work and show the same underlying result set in three forms
- [ ] Property keys list collapses behind a "Show N more" toggle when long
- [ ] Multiple queries run in sequence stack vertically rather than replacing each other
- [ ] `ConsultationNote` nodes are visible and queryable from this page
- [ ] This page renders in dark theme regardless of the global theme toggle state
- [ ] Real Cypher queries run against AuraDB via `/api/graph/cypher` — no mocked/hardcoded graph data

## Explicit non-goals for this task
- No query autocomplete/IntelliSense (real Neo4j Browser has this; not required here)
- No saved-query/favorites persistence beyond what's trivially available
- No user permissions/write-protection logic — this is a single-user demo, full read/write access is fine
- No frontend tests
