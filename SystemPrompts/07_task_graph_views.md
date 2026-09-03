# Task: Per-Feature Graph Views

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold — graph API), Task 04 (Frontend Scaffold).

## Context
Read the "Feature Set" and "Knowledge Graph & Admin Panel" sections of the root `/README.md`. These are the day-to-day, feature-scoped graph visualizations — distinct from the Admin Graph Panel (Task 06), which is the full Neo4j-Browser replica. These views are simpler, purpose-built, and do not need to visually resemble Neo4j Browser.

## Scope
Build scoped graph visualizations for: an individual patient, a sector/patient cohort, and Treatment Intelligence. Likely implemented with Cytoscape.js (or an equivalent graph-rendering library — your call, document the choice if you deviate from Cytoscape).

## What to build

1. **Patient graph view** (`/patients/:id`, alongside the scribe widget from Task 05)
   - Shows the patient node at the center, connected to their diagnoses, treatments, medications, symptoms, and consultation notes.
   - Clicking a connected node can show a brief detail popover (name/type/key properties) — full drill-down is not required.

2. **Sector/cohort graph view** (`/sectors/:id`)
   - Shows a cohort of patients and their `SIMILAR_TO` relationships to each other, and/or shared diagnoses, depending on what's meaningful for the cohort in question.

3. **Treatment Intelligence graph view** (`/treatment-intelligence`)
   - Shows treatments/diagnoses connected across patients, reflecting outcomes fed in from consultation notes over time (per the root README's note that consultations feed into Treatment Intelligence).

## Styling
- These pages respect the app-wide light/dark theme toggle (unlike the Admin Graph Panel, which is always dark).
- Node coloring should still be **consistent with the label-color mapping** established for the Admin Graph Panel (Task 06) — e.g. `Patient` nodes are the same color here as they are in the admin panel — so the same visual language is used app-wide, just in a simpler, more focused layout per page.

## Definition of done
- [ ] Patient graph view renders a patient's connected diagnoses/treatments/medications/notes
- [ ] Sector view renders a cohort with similarity/shared-diagnosis relationships
- [ ] Treatment Intelligence view renders treatment/diagnosis relationships across patients
- [ ] Node colors match the same label-color mapping used in the Admin Graph Panel
- [ ] All three views respect the app-wide theme toggle

## Explicit non-goals for this task
- No Neo4j-Browser visual replication here — that's Task 06 only
- No direct Cypher query input exposed to the user on these pages
- No write/edit capability from these views — read-only visualization
- No frontend tests
