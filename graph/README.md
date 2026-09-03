# MediGraph — Knowledge Graph

Neo4j schema, query patterns, and vector search setup for MediGraph.

See the [root README](../README.md) for full product context.

## Database

- **Neo4j 5.x**, migrated to **Neo4j AuraDB** (cloud), accessed via the Neo4j driver/API.
- No local Neo4j installation is required — this removes a setup step for anyone running MediGraph, and was a deliberate part of this rebuild.

## Node labels (existing + new)

Building on the existing schema (Patient, Doctor, Disease, Medication, Treatment, Symptom, ClinicalStudy, Evidence, LabTest, MedicalRecord, Distributor/Manufacturer/Pharmacy/Supplier/Warehouse/DrugBatch, etc.):

- **`ConsultationNote`** *(new)* — the structured note produced by the scribe pipeline. Attached to a `Patient` node via a new relationship (e.g. `HAS_CONSULTATION_NOTE`), and may relate to `Diagnosis`/`Disease`, `Treatment`, and `Medication` nodes referenced within the note.

> Supply-chain-specific labels tied to the now-removed Supply Chain and Shortages features (`Distributor`, `Warehouse`, `DrugBatch`, `Shortages`-related relationships, etc.) remain in the underlying schema for now but are no longer surfaced as a dedicated feature in the UI.

## Relationship types (existing + new)

Existing: `HAS_DIAGNOSIS`, `HAS_SYMPTOM`, `RECEIVED_TREATMENT`, `USES_MEDICATION`, `SIMILAR_TO`, `UNDERWENT_TEST`, `RELATES_TO`, etc.

New:
- `HAS_CONSULTATION_NOTE` — Patient → ConsultationNote
- Consultation notes may also link into `RECEIVED_TREATMENT` / `HAS_DIAGNOSIS` edges retroactively, since outcomes captured in a note feed into **Treatment Intelligence** over time.

## Vector Search / Embeddings

- Replacing the legacy pure-Python TF-IDF search with proper sentence embeddings, now that real consultation transcript/note text exists to search over.
- Embeddings are computed at note-save time (see [`/scribe/README.md`](../scribe/README.md)) and stored either as a Neo4j vector index property or in a dedicated embedding store, depending on what AuraDB's vector index support allows at implementation time.
- Used for: patient similarity search, and (via the chatbot's new intent) semantic search over past consultation notes.

## Admin Graph Panel — what it queries

The Admin Graph Panel (see [`/frontend/README.md`](../frontend/README.md)) is a near-exact UI replica of the Neo4j Browser and issues real Cypher queries directly against the AuraDB instance — including the ability to inspect `ConsultationNote` nodes and their relationships, so a patient's notes are visible as graph data, not only through the patient detail page.

## Example queries

```cypher
// A patient's consultation history
MATCH (p:Patient {id: $patientId})-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote)
RETURN n ORDER BY n.created_at DESC

// Feed a consultation's diagnoses into Treatment Intelligence
MATCH (n:ConsultationNote {id: $noteId})-[:HAS_DIAGNOSIS]->(d:Disease)
MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n)
MERGE (p)-[:RECEIVED_TREATMENT {source: 'consultation', note_id: $noteId}]->(d)
```

## Seeding

- A small number of pre-generated example consultations/notes are included in seed data so the scribe feature and graph views aren't starting from zero.
- Patient/medicine seed data continues to use the existing hybrid real-vocabulary + synthetic-fill approach.
