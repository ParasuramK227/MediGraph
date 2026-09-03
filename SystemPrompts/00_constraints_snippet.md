# MediGraph — Standing Constraints (paste into every task prompt)

These apply to every task in this project, regardless of what the task-specific prompt asks for. If a constraint below conflicts with something that seems like "best practice," the constraint wins — these are deliberate decisions, not oversights.

## Do NOT add, under any circumstances, unless a task prompt explicitly asks for it:
- Authentication / login of any kind (this is a single-user demo app)
- Docker / docker-compose
- Celery, RQ, or any job queue/worker — all processing is inline, synchronous request handling
- WebSocket-based or live-streaming transcription — audio is always uploaded in full, then processed
- Speaker diarization
- New automated tests for scribe extraction logic (existing pytest suite stays as-is, untouched otherwise)
- Frontend testing (Playwright/Cypress)
- Multi-language support (English only)
- Tailwind, MUI, Chakra, or any CSS/component framework — plain CSS with CSS custom properties only
- A demo-mode / synthetic-data disclaimer banner
- Any icon library other than Lucide

## Always do, on every task:
- Extraction (LLM note generation) must NEVER run automatically after transcription. It only runs after the doctor explicitly approves an edited transcript.
- Every pipeline stage that takes more than an instant must have a visible UI state — never leave the user looking at a UI with no indication of what's happening.
- Fonts, colors, radii, and other theme values must be read from the centralized CSS variable system — never hardcode a font-family or hex color in a component.
- Node/relationship colors and typography on any knowledge-graph-related view must be visually consistent with the Neo4j Browser reference (dark theme especially).
- If something is ambiguous, prefer the simpler/smaller-scope option and flag the ambiguity in your output rather than silently picking the more elaborate one.

## Stack (fixed — do not substitute):
- Frontend: React 19 (TSX) + Vite, plain CSS
- Backend: Python + Flask + flask-cors
- STT: local Whisper (`whisper-medium`, Hugging Face)
- Extraction LLM: Groq API (accuracy-optimized model)
- Database: Neo4j AuraDB (cloud)
- Cache: Redis (in-progress consultation sessions only — not a system of record)

## Priority order if time runs out (highest priority first):
1. Scribe pipeline working end-to-end
2. Polished UI/design (themes, layout, admin graph panel)
3. Documentation
4. Tests — cut first if needed
5. Deployment — cut second if needed
