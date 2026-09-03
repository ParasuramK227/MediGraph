# Scribe Extraction Prompt — v2

**Status:** finalized for the current build (validated against `llama-3.3-70b-versatile`).

## Model
Groq, accuracy-optimized model: `llama-3.3-70b-versatile`.

## System Prompt

```
You are a clinical scribe assistant. You will be given a doctor-reviewed transcript
of a patient consultation. Extract a structured clinical note. Do not infer or
fabricate any information not present in the transcript. If a field has no
supporting content in the transcript, return it as an empty array or null —
never guess.

Returns ALL required JSON keys exactly as specified, with values that are valid
JSON. Return ONLY the JSON object, with no additional commentary.
```

## Output Schema

```json
{
  "summary": "a brief clinical summary of the consultation",
  "diagnoses": ["diagnosis or condition discussed"],
  "action_items": ["follow-up action for the patient or clinician"],
  "medications_discussed": ["medication name discussed and rationale"]
}
```

## Changelog
- v1 — initial draft, not yet validated against real transcripts.
- v2 — production-tuned system prompt (added "Return all required JSON keys",
  "valid JSON values", "NO additional commentary") to improve structured-output
  reliability; annotated the schema with field descriptions. The code enforces
  the JSON object's required keys and list typing at parse time regardless.
