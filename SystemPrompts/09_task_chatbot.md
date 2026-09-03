# Task: Chatbot — Consultation Notes Query Intent

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold), Task 03 (Scribe Pipeline — for note structure), ideally Task 08 (Data Seed, so there's data to query against).

## Context
Read the "Chatbot" section of `/backend/README.md`. The existing chatbot and its other intents are **out of scope** — do not modify, refactor, or "clean up" any existing chatbot code beyond adding the one new intent below.

## Important — API key
This task uses a **separate Groq API key from the one used for scribe extraction** (Task 03 uses one Groq key for note extraction; this chatbot intent uses a second, distinct Groq key). Read both from environment variables with clearly distinct names (e.g. `GROQ_API_KEY_EXTRACTION` vs `GROQ_API_KEY_CHATBOT`) — do not reuse one key for both purposes, and do not consolidate them into a single variable.

## Scope
Add one new intent to the existing chatbot: querying past consultation notes (e.g. "what was discussed with this patient last time," "summarize their last three visits," "has this patient been prescribed X before").

## What to build

1. **Intent detection**: extend the existing chatbot's intent-routing (whatever mechanism it currently uses) to recognize consultation-note queries as a distinct intent, alongside its existing intents — do not replace or restructure the existing intent system.
2. **Retrieval**: given a patient (and/or a natural-language query), pull relevant `ConsultationNote` nodes from Neo4j. If embeddings/vector search (from Task 03/backend README) are available by the time this task runs, use them for semantic matching over note content; otherwise fall back to simple recency-based retrieval (e.g. "last N notes for this patient") and flag that vector search wasn't yet wired in.
3. **Response generation**: use the chatbot's existing Groq-backed response generation pattern (matching however the existing chatbot already calls Groq for its other intents), but with the second, distinct API key described above.
4. **Frontend**: wire this into the existing `/chatbot` page/route from the frontend scaffold — no new UI pattern needed, just make sure consultation-note answers render correctly in whatever message format the chatbot already uses.

## Definition of done
- [ ] The chatbot correctly routes consultation-note-related questions to the new intent without breaking any existing intent
- [ ] The new intent uses a distinct Groq API key from the scribe extraction pipeline
- [ ] Given a patient with seeded/real consultation notes, the chatbot can answer a question referencing that note's content
- [ ] Existing chatbot intents/behavior are unchanged

## Explicit non-goals for this task
- No rewrite or refactor of the existing chatbot architecture
- No new chatbot UI — reuse what exists
- No new automated tests
