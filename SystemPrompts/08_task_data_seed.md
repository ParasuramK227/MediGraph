# Task: Data Seeding

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold — Neo4j connection).

## Context
Read the "Data & Seeding" section of the root `/README.md` and the "Seeding" section of `/graph/README.md`.

## Scope
Write a seed script that populates the AuraDB instance with the hybrid real-vocabulary + synthetic-fill dataset (patients, diagnoses, medications, treatments, etc. — matching the existing schema this project already has), plus a small number of pre-generated example `ConsultationNote` records so the scribe feature and graph views have something to show without requiring a live recording first.

## What to build

1. **Seed script** (e.g. `backend/scripts/seed.py`), runnable standalone against the configured AuraDB instance.
2. **Patient/clinical data**: continue the existing hybrid approach — real drug names, real condition names, real-sounding structure — filled out with synthetic patient records. If existing seed data/scripts already exist in the project, extend them rather than replacing them wholesale.
3. **Example consultation notes**: generate a small number (3–5 is enough — "very few" per the product decision) of `ConsultationNote` nodes, each attached to an existing seeded patient via `HAS_CONSULTATION_NOTE`, with realistic-looking summary/diagnoses/action_items/medications_discussed fields matching the schema in `/scribe/prompts/scribe_extraction.md`.
4. Script should be **idempotent or safely re-runnable** — running it twice should not duplicate all data (e.g. use `MERGE` on natural keys where sensible, or clearly log/guard against duplicate seeding).

## Definition of done
- [ ] Running the seed script against a fresh AuraDB instance populates a usable demo dataset
- [ ] A small number of example `ConsultationNote` records exist and are attached to real seeded patients
- [ ] Re-running the script does not silently duplicate the entire dataset
- [ ] Seeded consultation notes are structurally valid against the extraction schema (so the frontend doesn't choke rendering them)

## Explicit non-goals for this task
- No real hospital patient data integration (explicitly out of scope, future possibility only)
- No bundled sample audio files
- No large-scale synthetic data generation beyond what's needed for a convincing demo
