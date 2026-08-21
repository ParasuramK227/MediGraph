# MediGraph AI

Healthcare intelligence prototype connecting fragmented clinical and
pharmaceutical supply-chain information through a unified **Knowledge Graph**.

**Core principle:** Neo4j + deterministic Python services perform all
computation and ranking. The Groq LLM is used *only* for chatbot intent
understanding and explanation of already-retrieved results — it never touches
the database or business logic.

```
React UI ──► Flask API ──► Deterministic Python Services ──► Neo4j / TF-IDF
                                   │
                             Evidence / Results
                                   │
                            Groq (chatbot only)
```

## Features

- **Dashboard** — graph stats, supply-chain alerts, expiring batches
- **Patients** — search, clinical profile, deterministic similar-patient cohort
- **Treatment Intelligence** — outcome aggregation + success-rate ranking with evidence/provenance (no LLM)
- **Medicines** — availability across hospitals/pharmacies/warehouses, expired stock excluded
- **Supply Chain** — batch & medicine tracing: manufacturer → supplier → distributor → warehouse → facility
- **Shortages** — out-of-stock / low-stock detection, alternatives via `ALTERNATIVE_TO`
- **Knowledge Graph** — dedicated explorer (`/knowledge-graph`): search, type/relationship filters, expand neighbors, node details
- **Chatbot** — Groq-powered; parses intent, calls controlled backend functions, explains retrieved results, deep-links into the graph. Degrades gracefully without an API key.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, React Router, Cytoscape.js, plain CSS |
| Backend | Python 3.x + Flask (REST), flask-cors |
| Database | Neo4j (graph storage + traversal) |
| Vector search | Pure-Python TF-IDF + cosine similarity (no extra infra) |
| LLM | Groq API (chatbot only) |

## Project Structure

```
medigraph-ai/
├── backend/
│   ├── app.py               # Flask factory + error handling
│   ├── config.py            # env-driven configuration
│   ├── routes/              # thin HTTP controllers (/api/*)
│   ├── services/            # deterministic intelligence layer
│   │   ├── similarity_service.py    # weighted patient similarity
│   │   ├── treatment_service.py     # outcome aggregation + ranking
│   │   ├── medicine_service.py      # availability, shortages, alternatives
│   │   ├── supply_chain_service.py  # batch/medicine tracing
│   │   ├── location_service.py      # Haversine nearby search
│   │   ├── retrieval_service.py     # GraphRAG evidence packages
│   │   └── vector_service.py        # TF-IDF document search
│   ├── graph/               # schema + seeding
│   ├── chatbot/             # LLM client, prompts, controlled dispatcher
│   └── utils/               # geo math, validation
├── frontend/                # React app (pages/, components/, layouts/)
├── scripts/
│   ├── generate_dataset.py  # synthetic dataset (seeded RNG, no PII)
│   ├── seed_database.py     # load dataset into Neo4j
│   └── verify_graph.py      # post-seed sanity checks
├── data/synthetic/          # generated JSON datasets
└── tests/                   # pytest unit + integration suites
```

## Setup

### Prerequisites
Python 3.10+, Node.js 18+, a running Neo4j 5.x instance.

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment

```bash
cp .env.example .env
# edit .env: NEO4J_PASSWORD, optionally GROQ_API_KEY
```

The chatbot works without `GROQ_API_KEY` (deterministic keyword fallback);
everything else never needs it.

### 3. Generate data & seed the graph

```bash
backend/venv/bin/python scripts/generate_dataset.py
backend/venv/bin/python -m graph.seed          # from repo root, or:
cd backend && python ../scripts/seed_database.py
backend/venv/bin/python scripts/verify_graph.py
```

(Or simply `POST /api/data/seed` once the backend is running.)

### 4. Run

```bash
# terminal 1 — API on :5000
cd backend && source venv/bin/activate && python app.py

# terminal 2 — UI on :5173 (proxies /api → :5000)
cd frontend && npm install && npm run dev
```

## Key API Endpoints

```
GET  /api/dashboard
GET  /api/patients?q=                 GET  /api/patients/:id
GET  /api/patients/:id/similar        GET  /api/patients/:id/treatments
GET  /api/patients/:id/context        # GraphRAG evidence package
GET  /api/medicines?q=                GET  /api/medicines/:id/availability
GET  /api/medicines/:id/supply-chain  GET  /api/medicines/:id/alternatives
GET  /api/medicines/nearby?medicine=&lat=&lng=
GET  /api/hospitals                   GET  /api/hospitals/:id/inventory
GET  /api/supply-chain/batch/:id      GET  /api/supply-chain/shortages
GET  /api/graph/search?q=             GET  /api/graph/entity/:id/subgraph
GET  /api/graph/schema                GET  /api/graph/stats
GET  /api/search?q=                   # hybrid GraphRAG search
POST /api/chat                        # {message} → grounded answer
POST /api/data/seed
```

## How Intelligence Stays Deterministic

| Feature | Implemented by |
|---|---|
| Patient similarity | Python: Jaccard over symptoms/diseases/lab flags/treatments, configurable weights |
| Treatment ranking | Python: outcome aggregation, min-case threshold, rate ordering |
| Availability | Cypher aggregation; expired batches filtered by date comparison |
| Shortage detection | Python classification of aggregated valid stock |
| Nearest facility | Python Haversine + sort |
| Supply-chain paths | Neo4j traversal, shaped in Python |
| Chatbot answers | Groq explains JSON evidence packages only |

## Testing

```bash
backend/venv/bin/python -m pytest tests/ -q
```

Unit tests run offline; integration tests auto-skip when Neo4j is unreachable.

## Safety Positioning

This is a **decision-support prototype** built entirely on synthetic,
fictional data. It does not replace professional medical judgment and makes no
autonomous diagnosis or treatment decisions.
