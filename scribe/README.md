# MediGraph — Scribe Pipeline

The scribe is MediGraph's centerpiece feature: it turns a recorded consultation into a structured, doctor-verified clinical note stored in the knowledge graph.

See the [root README](../README.md) for full product context.

## Pipeline stages

```
[Record] → [Transcribe (local Whisper)] → [Review & Edit (doctor, required)] → [Extract (Groq)] → [Save to Neo4j]
```

1. **Record**
   - Started from the patient detail view or the Admin Graph Panel.
   - A live audio-level visualizer (CAVA-inspired) confirms the mic is capturing audio in real time.

2. **Transcribe**
   - Runs **after** the full recording is uploaded — this is not a live-streaming STT pipeline.
   - Uses a local **Whisper `whisper-medium`** model (Hugging Face) — no external STT API call, no network dependency for this step.
   - A partial/live transcript is shown as it becomes available purely as a visual confirmation that processing is happening — it is not what gets edited or extracted from until transcription fully completes.
   - Output: a flat transcript. No speaker diarization (doctor vs. patient) in this build — out of scope given the timeline.
   - English only.

3. **Review & Edit (mandatory, doctor-only step)**
   - The doctor **must** be able to edit the transcript directly.
   - Extraction is never triggered automatically on transcription completion — it only runs once the doctor explicitly approves the (possibly edited) transcript.
   - This exists specifically to prevent LLM hallucinations from compounding on top of STT errors.

4. **Extract**
   - The approved transcript is sent to **Groq** (LLM, accuracy-optimized model choice — e.g. `llama-3.3-70b-versatile` — since accuracy matters more than latency for this use case) using a **versioned prompt/schema** (see below), returning a structured note.
   - Structured note fields (indicative): summary, diagnoses discussed, action items, medications discussed.

5. **Save**
   - The structured note is persisted to Neo4j, attached to the patient node.
   - It becomes visible in: the patient's own graph view, the Admin Graph Panel (as an inspectable node), and via chatbot queries.
   - Where relevant, outcomes captured in the note feed into **Treatment Intelligence** over time — consultations are not a dead-end, disconnected feature.

## Failure handling

If transcription fails (bad audio, silence, corrupted upload, etc.):

- The doctor is shown a choice: **Retry** or **Switch to a manually typed note**.
- Failure count is tracked per session.
- After **3 consecutive failures**, retry is no longer offered — manual typed entry becomes the only path forward, to avoid trapping the doctor in a failure loop.

## Prompt / Schema Versioning

The extraction prompt and output schema are versioned in-repo (not just embedded inline in code) so the exact ask given to the LLM is inspectable:

```
/scribe/prompts/scribe_extraction.md      ← current version
/scribe/prompts/scribe_extraction_v0.md   ← prior versions, if superseded
```

Each version should document:
- The exact system/user prompt template.
- The expected output JSON schema.
- The Groq model it was validated against.
- Date/reason for any change from the previous version.

## Visual feedback requirements

Every stage above must be visually represented in the UI — recording, transcribing, awaiting review, extracting, and saved/error states all need a distinct, visible indicator. The doctor should never be left looking at a UI that gives no indication of what's currently happening.

## Explicit non-goals for this build

- No live-streaming transcription (full-upload-then-process only).
- No speaker diarization.
- No multi-language support (English only).
- No bundled sample audio files.
- No automated tests specifically for extraction logic.
