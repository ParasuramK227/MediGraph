# Task: Scribe Widget (Frontend)

**Paste `00_constraints_snippet.md` above this before sending.**
**Depends on:** Task 02 (Backend Scaffold), Task 03 (Scribe Pipeline), Task 04 (Frontend Scaffold).

## Context
Read `/scribe/README.md` and the "Scribe Widget" section of `/frontend/README.md` before starting. This builds the actual UI for the pipeline Task 03 implemented on the backend.

## Scope
Build the scribe widget component and wire it to `/api/scribe/*`. Embed it in two places: the patient detail page, and (later, in Task 06) the admin graph panel. For this task, just get the widget itself right and embed it in the patient detail page — the admin panel embed happens in Task 06 once that page exists.

## What to build

1. **Record button**
   - Prominent but visually clean — not a jarring giant red circle. Uses the theme's accent color, rounded per the design token radius.
   - Uses Lucide's mic icon (or equivalent), swapping to a stop icon while recording.

2. **Audio-level visualizer**
   - Live bar/wave visualizer while recording, styled after [karlstav/cava](https://github.com/karlstav/cava) — vertical bars reacting to audio input level in real time.
   - Purely visual confirmation that the mic is capturing sound; it does not need to be a spectrum analyzer, amplitude-reactive bars are sufficient.

3. **Pipeline state machine**
   Implement all of these as distinct, visibly different UI states — never leave a gap where nothing is shown:
   ```
   idle → recording → transcribing → review (editable) → extracting → saved
                                                        ↘ error (see below)
   ```
   - `recording`: record button active + audio visualizer running.
   - `transcribing`: clear loading/processing indicator; if a partial transcript streams in from the backend, show it, but make clear it's provisional.
   - `review`: full transcript shown in an editable text area. Extraction only becomes available once the doctor is in this state — there is no path from `transcribing` straight to `extracting`.
   - `extracting`: loading indicator while Groq extraction runs.
   - `saved`: confirmation state showing the structured note that was saved (summary, diagnoses, action items, medications).

4. **Failure / retry flow**
   - On a transcription failure, show a choice: **Retry** or **Type note manually**.
   - Track failures client-side per session (or read the failure count from the backend response, per Task 03).
   - After 3 consecutive failures, hide the Retry option entirely and show only the manual typed-note path.
   - Manual typed-note path: a plain text area that feeds directly into the `review` state, skipping transcription.

5. **Wiring**
   - `POST` audio upload → transcription endpoint
   - `PATCH`/`POST` edited transcript → edit endpoint
   - `POST` approved transcript → extraction endpoint
   - `POST` extracted note → save endpoint
   - Use the exact route paths Task 02/03 documented; if they differ from what's described here, follow what's actually implemented.

## Definition of done
- [ ] Every pipeline stage above has a distinct, visible UI representation
- [ ] Extraction cannot be triggered without passing through the editable review state first
- [ ] Audio visualizer runs during recording and stops cleanly on stop
- [ ] Failure flow correctly disables retry after 3 consecutive failures
- [ ] Widget is embedded and functional inside the patient detail page
- [ ] All colors/fonts pull from the design token system — no hardcoded values

## Explicit non-goals for this task
- No embedding into the admin graph panel yet (Task 06)
- No diarization / multi-speaker UI
- No live-streaming transcription UI beyond showing whatever partial transcript the backend provides
- No frontend tests
