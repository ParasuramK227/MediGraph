# MediGraph — Backend

Python + Flask backend for MediGraph. Handles the scribe pipeline, knowledge graph API, and chatbot/query engine.

See the [root README](../README.md) for full product context, and [`/scribe/README.md`](../scribe/README.md) / [`/graph/README.md`](../graph/README.md) for pipeline and schema detail.

## Stack

- **Python 3.x**
- **Flask** + **flask-cors** (kept as-is from the existing setup)
- Local **Whisper** (`whisper-medium`, Hugging Face) for speech-to-text
- **Groq API** for clinical note/action-item extraction (separate API key from any other Groq usage)
- Sentence-embedding model for vector search (replacing the legacy pure-Python TF-IDF implementation)
- **Neo4j AuraDB** as the primary data store, accessed via the Neo4j driver/API (cloud — no local Neo4j instance required)
- **In-memory session store** for in-progress consultation session state (single-user demo — no Redis/queue dependency)

## Service boundaries

```
/api/scribe/*        → Scribe Service: upload audio, get transcript, edit transcript,
                        trigger extraction, retrieve saved note
/api/graph/*          → Knowledge Graph API: Cypher-backed CRUD and query endpoints
                        for patients, diagnoses, treatments, medications, notes
/api/chat/*           → Chatbot / Query Engine, now including a consultation-notes
                        query intent
```

## Scribe pipeline (backend responsibilities)

1. **Receive full audio upload** (not a stream) once recording stops.
2. **Transcribe** via local Whisper (`whisper-medium`). This step runs synchronously, inline in the request — no queue/worker (Celery/RQ) is used at current scale.
3. Return the transcript to the frontend for doctor review/editing — extraction is a **separate, explicit step**, never triggered automatically on transcription completion.
4. On the doctor's approval, send the **edited** transcript to Groq using a versioned prompt (see [`/scribe/prompts/scribe_extraction.md`](../scribe/prompts/scribe_extraction.md)) to extract a structured note.
5. Persist the structured note into Neo4j, attached to the relevant patient node.
6. On transcription failure, surface a retry/manual-entry choice to the frontend; track failure count per session (via the in-memory store) so the backend can signal "manual entry only" after 3 consecutive failures.

## Session state

The in-memory session store (`scribe/session.py`) holds **in-progress consultation session state only** — e.g. the current session's transcript-in-review, failure counters, and processing status, each with a 1-hour TTL. Nothing here is treated as a system of record; once a note is saved, the session entry is cleared. Neo4j remains the sole source of truth for finalized data. (This is a single-user demo — an in-process dict-based store is deliberately used instead of Redis or an external cache.)

## Neo4j / AuraDB

- Connection is via the Neo4j driver against an **AuraDB** cloud instance (migrated from local Neo4j 5.x).
- No local Neo4j installation is required to run the app — this was a deliberate move to remove environment setup friction for anyone running MediGraph.
- See [`/graph/README.md`](../graph/README.md) for schema and query patterns.

## Vector Search / Embeddings

The legacy pure-Python TF-IDF search is being replaced with a proper sentence-embedding model, since real consultation transcript/note text now exists to search over meaningfully (as opposed to the earlier synthetic-only dataset). Embeddings are computed at note-save time and stored for similarity queries (e.g. patient similarity, note search).

## Chatbot

The existing chatbot service gains one new intent: **querying consultation notes** (e.g. "what was discussed with this patient last time," "summarize their last three visits"). This is implemented as an additional intent/handler alongside the existing ones — the rest of the chatbot is left untouched.

## CORS

`flask-cors` configuration is unchanged from the existing setup.

## Testing

Existing **pytest** suite is retained as-is. No new tests are being added for the scribe extraction logic in this build pass (explicitly out of scope for the current timeline).
