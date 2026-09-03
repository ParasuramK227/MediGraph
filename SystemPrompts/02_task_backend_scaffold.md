# Task: Backend Scaffold

**Paste `00_constraints_snippet.md` above this before sending.**

## Context
Read `/backend/README.md` and `/graph/README.md` first.

## Scope
Set up the Flask backend structure and its connections to Neo4j AuraDB and Redis. Do **not** implement the scribe pipeline logic or Groq integration in this task — that's the next task. This task is plumbing only.

## What to build
1. Flask app with `flask-cors` configured (match whatever the existing CORS config allows — do not tighten or loosen it).
2. Route stubs (return 501/"not implemented" placeholders are fine) for:
   - `/api/scribe/*` (upload, transcript, edit, extract, save — exact routes at your discretion, document them)
   - `/api/graph/*` (basic CRUD for Patient, plus a generic Cypher-passthrough endpoint for the admin panel to use)
   - `/api/chat/*` (leave existing chatbot routes untouched if they already exist; just confirm they still register correctly)
3. Neo4j AuraDB connection module — reads connection URI/credentials from environment variables, exposes a simple session/driver helper other modules can import. Include a basic connectivity check function.
4. Redis connection module — same pattern, env-var configured, simple get/set/expire helpers scoped to consultation session state.
5. A `.env.example` file listing every environment variable introduced (Neo4j URI/user/password, Redis URL, Groq API key placeholder — do not hardcode any real credentials anywhere).

## Definition of done
- [ ] App boots locally without errors given a valid `.env`
- [ ] Neo4j connectivity check function successfully connects to an AuraDB instance when given valid credentials
- [ ] Redis helper can set/get/expire a key
- [ ] All new routes are documented (a short comment or docstring per route is enough)
- [ ] `.env.example` covers every new variable, with no real secrets committed

## Explicit non-goals for this task
- No Whisper integration yet
- No Groq integration yet
- No actual Cypher query logic beyond a passthrough endpoint and basic Patient CRUD
- No new tests
