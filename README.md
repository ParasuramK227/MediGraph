# MediGraph

**An intelligent medical scribe that transcribes patient consultations in real time into structured clinical notes, built on a Neo4j graph database that organizes patient, treatment, and medication data as a connected knowledge graph.**

MediGraph pairs an on-device speech-to-text pipeline with LLM-driven clinical note extraction, and roots every artifact — patients, diagnoses, treatments, medications, and now consultation notes — in a single graph so relationships between them (similarity, treatment outcomes, medication history) are first-class, queryable data rather than rows scattered across tables.

This is being built as a production-intent system, not a one-off hackathon demo. Where relevant, decisions below account for a possible future integration with real, hospital-sourced patient history data.

---

## Table of Contents

- [What MediGraph Does](#what-medigraph-does)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Module READMEs](#module-readmes)
- [Feature Set](#feature-set)
- [Scribe Pipeline](#scribe-pipeline)
- [Knowledge Graph & Admin Panel](#knowledge-graph--admin-panel)
- [Design System](#design-system)
- [Data & Seeding](#data--seeding)
- [Security & Auth](#security--auth)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project Status & Roadmap](#project-status--roadmap)

---

## What MediGraph Does

1. A doctor starts a recording during a patient consultation.
2. Audio is transcribed locally (no audio leaves the machine during transcription).
3. The doctor reviews and edits the raw transcript — **before** any extraction runs — to eliminate the risk of LLM hallucination compounding on STT error.
4. Once approved, the edited transcript is sent to an LLM which extracts a structured clinical note (summary, diagnoses, action items, medications discussed).
5. The structured note is written back into the patient's record in Neo4j, alongside their existing diagnosis, treatment, and medication history.
6. That note becomes queryable — through the patient's graph view, the admin graph panel, and the existing chatbot, which now understands consultation notes as a first-class intent.

Every step surfaces visual state to the doctor (recording → transcribing → ready-for-review → extracting → saved) — there is no step where the UI goes quiet while something happens in the background.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                │
│              React 19 (TSX) + Vite · Plain CSS (variables)           │
│   Patient views · Sector views · Admin Graph Panel · Scribe widget   │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ REST (JSON) + file upload
┌───────────────────────────────▼───────────────────────────────────────┐
│                              BACKEND                                  │
│                     Python · Flask · flask-cors                      │
│  ┌───────────────┐  ┌────────────────────┐  ┌───────────────────┐    │
│  │ Scribe Service │  │ Knowledge Graph API │  │ Chatbot / Query   │    │
│  │ (STT + LLM)    │  │ (Cypher over Neo4j) │  │ Engine            │    │
│  └───────┬────────┘  └──────────┬──────────┘  └─────────┬─────────┘    │
└──────────┼─────────────────────┼───────────────────────┼──────────────┘
           │                     │                        │
  ┌────────▼────────┐  ┌─────────▼──────────┐   ┌─────────▼─────────┐
  │ Local Whisper    │  │   Neo4j AuraDB     │   │  Embedding Store  │
  │ (whisper-medium) │  │   (cloud, via API) │   │  (vector search)  │
  └──────────────────┘  └─────────┬──────────┘   └────────────────────┘
                                   │
┌────────▼─────────┐
                           │   In-memory        │
                           │ session store      │
                           │ (single-user demo, │
                           │ 1h TTL)            │
                           └──────────────────┘
                                   │
                          ┌────────▼─────────┐
                          │   Groq API       │
                          │ (note/action-item │
                          │  extraction LLM)  │
                          └──────────────────┘
```

**Key architectural decisions:**

| Decision | Choice | Why |
|---|---|---|
| Speech-to-text | Local Whisper (`whisper-medium`, Hugging Face) | Runs on-device, no per-request API dependency for STT |
| Note/action-item extraction | Groq-hosted LLM (accuracy-optimized model) | Accuracy matters more than latency for clinical notes |
| Audio pipeline mode | Full upload → process (not live streaming) | Removes ambiguity/race conditions around partial LLM output on clinical data |
| Job execution | Inline request handling | Sufficient at current scale; no queue/worker infra needed yet |
| Graph database | Neo4j, migrating to AuraDB (cloud) | Removes the local Neo4j install requirement so the app runs anywhere |
| Vector search | Embeddings (replacing TF-IDF) | Real consultation text now exists to search over meaningfully |
| Session cache | In-memory store (no Redis) | Single-user demo; holds in-progress consultation state without writing partial data to Neo4j |

---

## Tech Stack

**Frontend**
- React 19 (TypeScript/TSX) + Vite
- Plain CSS with a centralized design-token/variable system (see [Design System](#design-system))
- Cytoscape.js (or equivalent) for per-feature graph visualizations
- Custom Neo4j-Browser-style panel for the admin graph view
- Lucide icon library
- Custom audio-level visualizer (CAVA-inspired — see [karlstav/cava](https://github.com/karlstav/cava))

**Backend**
- Python 3.x + Flask + flask-cors
- Local Whisper (`whisper-medium`) for speech-to-text
- Groq API for clinical note/action-item extraction
- Sentence-embedding model for vector search (replacing legacy TF-IDF)

**Data Layer**
- Neo4j 5.x → **Neo4j AuraDB** (cloud, accessed via API — no local Neo4j install required)
- In-memory session store for in-progress consultation state (no Redis)

**AI Services**
- Local Whisper — speech-to-text
- Groq — clinical note extraction (own API key, separate from any future use)

---

## Module READMEs

This root README covers the whole system end-to-end. Each module also has its own focused README:

- [`/frontend/README.md`](./frontend/README.md) — UI structure, routing, design tokens, component conventions
- [`/backend/README.md`](./backend/README.md) — API routes, Flask app structure, service boundaries
- [`/scribe/README.md`](./scribe/README.md) — STT + extraction pipeline, prompt versioning, failure handling
- [`/graph/README.md`](./graph/README.md) — Neo4j schema, Cypher query patterns, embedding/vector search setup

---

## Feature Set

MediGraph's knowledge graph features:

| Feature | Status |
|---|---|
| Scribe (live consultation → structured note) | **New — centerpiece feature** |
| Patient Similarity | Kept |
| Treatment Intelligence | Kept — now fed by consultation outcomes over time |
| Medicines | Kept |
| Knowledge Graph Explorer | Kept |
| ~~Supply Chain~~ | Removed |
| ~~Shortages~~ | Removed |

Supply Chain and Shortages were cut to keep focus on the scribe pipeline as the centerpiece feature given the build timeline. Consultation notes now feed into Treatment Intelligence so that outcomes recorded during a consultation accumulate into that feature's data over time, rather than being a disconnected, future-only integration.

The existing chatbot gains a new intent: querying past consultation notes directly (e.g. "what did we discuss with this patient last visit").

---

## Scribe Pipeline

High-level flow (see [`/scribe/README.md`](./scribe/README.md) for full detail):

1. **Record** — doctor starts recording from the patient's page or the admin panel. A live audio-level visualizer confirms the mic is active.
2. **Transcribe** — on stop, the full audio file is sent to the local Whisper pipeline. A live partial transcript is shown as it becomes available so the doctor can visually confirm the pipeline is working, even though extraction only happens after the doctor approves the final transcript.
3. **Review & edit** — the doctor can edit the transcript directly before extraction runs. Extraction never runs on an unreviewed transcript.
4. **Extract** — the approved transcript is sent to Groq, which returns a structured note (summary, diagnoses, action items, medications) against a versioned prompt/schema.
5. **Save** — the structured note is written into Neo4j, attached to the patient node, and becomes visible in that patient's graph view, the admin panel, and via chatbot queries.

**Failure handling:** on a failed transcription (bad audio, silence, etc.), the doctor is offered a choice between retrying or switching to a manual typed note. After 3 consecutive failures, manual typed entry becomes the only available option — the UI stops offering retry to avoid a frustrating failure loop.

**Scope for this build:** English only, flat transcript (no speaker diarization), full-upload processing (not live streaming transcription).

---

## Knowledge Graph & Admin Panel

MediGraph exposes the knowledge graph in two distinct ways:

1. **Per-feature graph views** — each feature (individual patient, patient sector/cohort, treatment intelligence, etc.) gets its own focused graph visualization scoped to that feature's data.
2. **Admin Graph Panel** — a single page designed to closely replicate the actual Neo4j Browser interface (instance/database/user status bar, database-info sidebar with node/relationship-type chips, Cypher-style query bar, graph/table/raw result views, results-overview sidebar with type counts, and query timing footer). This panel allows direct viewing and manipulation of the underlying database, and is where a patient's consultation notes can also be inspected as graph nodes/relationships rather than through the patient UI.

See [`/graph/README.md`](./graph/README.md) for the schema this is built on and [Design System](#design-system) below for the exact visual spec being replicated.

---

## Design System

MediGraph ships with **two themes**:

- **Dark theme** — modeled directly on the Neo4j Browser's own dark UI (near-black background, colored label/relationship chips, monospace-leaning stat readouts). This theme is used consistently across all knowledge-graph-related pages, not just the admin panel.
- **Light theme** — white background with a warmer blue accent.

Both themes share rounded corners throughout and are driven by a single, centralized CSS variable system: **changing a font, color, or spacing value in one place updates every instance of it app-wide.** This applies especially to typography, given three distinct font roles are in use.

**Typography**

| Role | Font |
|---|---|
| Headings | Outfit |
| Body | Inter |
| Numbers & statistics | Departure Mono |

**Iconography:** [Lucide](https://lucide.dev) for all icons and SVGs, app-wide.

**Layout:** primary navigation/dashboard panel is docked to the **left** of the screen, not the top — consistent with a desktop-first clinical workstation layout, while remaining fully responsive down to mobile.

**Brand color:** not yet finalized — to be proposed as part of the visual design pass, since no existing brand color or external design reference was specified.

**Recording UI:** a prominent record button is a hard requirement, but styled cleanly rather than as a jarring "big red button" — visually calm, but unmistakable.

---

## Data & Seeding

- Patient/medicine data continues to use the existing hybrid approach: real vocabulary (real drug names, real condition names, etc.) filled out with synthetic patient records. This may later be supplemented or replaced by real hospital-sourced history data, but that is out of scope for the current build.
- A small number of pre-generated example consultations/notes are included in the seed data, so the scribe feature has something to show immediately without requiring a live recording first.
- No pre-recorded sample consultation audio files are bundled at this stage.

---

## Security & Auth

This remains a **single-user demo application** — there is no login/auth layer, and none is being added in this rebuild. No "synthetic data" disclaimer is shown in the UI; the data is treated as safe to display as-is.

---

## Deployment

MediGraph is intended to be deployed (not run purely locally for judging), using:

- **Neo4j AuraDB** (cloud-hosted Neo4j) — removes any requirement for judges or users to install Neo4j locally, so the app runs the same way on any machine.
- Hosting platform for frontend/backend: **to be decided** as part of the deployment pass.

Docker/docker-compose packaging is explicitly out of scope for this build phase.

---

## Testing

- Existing **pytest** backend test suite is retained as-is.
- No new tests are being written for the scribe extraction logic in this pass.
- No frontend testing (Playwright/Cypress) is planned for this build phase.

---

## Project Status & Roadmap

This rebuild is being executed under a tight timeline (roughly one development day before submission). Priority order if anything needs to be cut:

1. **Scribe pipeline working end-to-end** — non-negotiable, this is the centerpiece.
2. **Polished UI/design** — themes, layout, and the Neo4j-replica admin panel.
3. **Documentation** — this README set.
4. ~~Tests~~ — first to be cut if time runs short.
5. ~~Deployment~~ — second to be cut if time runs short.

**Known open items:**
- Final brand color not yet chosen.
- Deployment target for frontend/backend not yet selected.
- Real hospital patient-history integration is a future possibility, not part of this build.
