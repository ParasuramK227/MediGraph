# Task: Scribe Pipeline (STT + Extraction)

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold) being complete.

## Context
Read `/scribe/README.md` in full before starting — it defines the exact stage sequence and failure-handling rules this task must implement. Also read `/scribe/prompts/scribe_extraction.md` for the draft extraction prompt/schema.

## Scope
Implement the actual scribe pipeline logic behind the route stubs created in Task 02: local Whisper transcription, the doctor-edit step, Groq extraction, and saving the resulting note to Neo4j.

## What to build
1. **Transcription service**
   - Accepts a full audio file upload (no streaming).
   - Runs it through local `whisper-medium` (Hugging Face) synchronously, inline in the request.
   - Returns the transcript text to the caller.
   - Track failure count per session in Redis (from Task 02's Redis helper). On failure, return a response the frontend can use to offer retry vs. manual entry. After 3 consecutive failures for a session, include a flag indicating retry should no longer be offered.

2. **Transcript edit endpoint**
   - Accepts an edited transcript for a given session and stores it (Redis is fine — this is still in-progress state) as the "approved" version.
   - Extraction must never be triggered by this endpoint automatically — it only stores the edit.

3. **Extraction service**
   - Separate, explicit endpoint. Takes the approved/edited transcript for a session, sends it to Groq using the versioned prompt in `/scribe/prompts/scribe_extraction.md`.
   - Parses the returned JSON against the documented schema (summary, diagnoses, action_items, medications_discussed). If parsing fails, return a clear error — do not silently pass through malformed data.
   - If you need to adjust the prompt/schema to get reliable output, update `scribe_extraction.md` in place and bump its version number with a changelog entry — do not fork a second untracked prompt elsewhere in the code.

4. **Save endpoint**
   - Persists the structured note into Neo4j as a `ConsultationNote` node attached to the relevant `Patient` via `HAS_CONSULTATION_NOTE` (see `/graph/README.md` for the relationship pattern).
   - Clears the corresponding Redis session state once saved.

## Definition of done
- [ ] A full audio file can be uploaded and transcribed via local Whisper
- [ ] The transcript can be edited via a separate call before extraction runs
- [ ] Extraction only ever runs against an explicitly-approved transcript, never automatically
- [ ] A successful extraction produces a note matching the documented schema, saved to Neo4j
- [ ] 3 consecutive transcription failures in one session correctly disable the retry option in the API response
- [ ] `scribe_extraction.md` is updated in place if the prompt changed, with a changelog entry

## Explicit non-goals for this task
- No diarization
- No live/streaming partial transcript from the backend side (if the frontend wants a "live" feel, that's a frontend-only UX concern — see frontend tasks)
- No new automated tests
- No changes to unrelated `/api/graph/*` or `/api/chat/*` routes
