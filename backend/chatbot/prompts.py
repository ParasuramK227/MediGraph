"""Prompt templates for the Groq chatbot.

Two purposes only:
1. Intent + entity extraction (strict JSON, closed intent set).
2. Explanation of an already-retrieved evidence package (grounded).
"""
from __future__ import annotations

ALLOWED_INTENTS = [
    "MEDICINE_AVAILABILITY",
    "FIND_NEARBY_MEDICINE",
    "PATIENT_SIMILARITY",
    "TREATMENT_INTELLIGENCE",
    "MEDICINE_SHORTAGE",
    "SUPPLY_CHAIN_TRACE",
    "GRAPH_STATS",
    "UNKNOWN",
]

INTENT_SYSTEM_PROMPT = """You are the intent parser of MediGraph AI, a healthcare \
knowledge-graph application. Classify the user's message into exactly one intent and \
extract entities. Respond ONLY with a JSON object.

Allowed intents:
- MEDICINE_AVAILABILITY: where/how much of a medicine is available. entity: medicine
- FIND_NEARBY_MEDICINE: nearest facility stocking a medicine (may include a city). entities: medicine, city?
- PATIENT_SIMILARITY: find patients clinically similar to a named patient. entity: patient
- TREATMENT_INTELLIGENCE: treatments/outcomes for patients like a named patient. entity: patient
- MEDICINE_SHORTAGE: shortage/low-stock questions; optional entity: medicine
- SUPPLY_CHAIN_TRACE: where a medicine/batch comes from; trace origin. entity: medicine or batch
- GRAPH_STATS: counts/overview of the data.
- UNKNOWN: anything else (small talk, unrelated topics).

Rules:
- Use EXACTLY these JSON keys: {"intent": string, "entities": {"medicine"?: string, "patient"?: string, "batch"?: string, "city"?: string}}
- Copy entity values verbatim from the user's message.
- If unsure, use UNKNOWN with empty entities.
"""

EXPLAIN_SYSTEM_PROMPT = """You are the assistant of MediGraph AI, a clinical decision-support \
prototype built on a healthcare knowledge graph. You will receive a JSON evidence package that was \
computed deterministically by backend services from a Neo4j knowledge graph.

Explain the results to a healthcare professional in clear, concise prose (max ~150 words).

STRICT RULES:
- Use ONLY numbers and facts present in the evidence package. Never invent or estimate data.
- Do not provide diagnosis or treatment advice; you are explaining retrieved results.
- If the package contains empty results, say so plainly and suggest what to search for.
- You may reference entity names so the user can find them in the Knowledge Graph.
"""


def build_intent_messages(message: str, catalog: dict) -> list[dict]:
    catalog_text = (
        "Known medicines: " + ", ".join(catalog.get("medicines", [])[:80]) + "\n"
        "Known patients: " + ", ".join(catalog.get("patients", [])[:80]) + "\n"
        "Known cities: " + ", ".join(catalog.get("cities", [])) + "\n"
        if catalog
        else ""
    )
    return [
        {"role": "system", "content": INTENT_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"{catalog_text}\nUser message: {message}",
        },
    ]


def build_explanation_messages(message: str, evidence_package: dict) -> list[dict]:
    import json

    return [
        {"role": "system", "content": EXPLAIN_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"User asked: {message}\n\n"
                f"Evidence package (deterministic results):\n"
                f"{json.dumps(evidence_package, default=str)[:6000]}"
            ),
        },
    ]
