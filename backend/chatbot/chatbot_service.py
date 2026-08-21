"""Chatbot orchestration: intent -> controlled backend functions -> explanation.

The LLM never queries the database. It only (1) parses intent/entities and
(2) explains the deterministic evidence package returned by the dispatcher.
If Groq is unavailable, a keyword fallback keeps the chatbot functional.
"""
from __future__ import annotations

import re

from chatbot.llm_client import LLMError, get_llm_client
from chatbot import prompts
from services import (
    location_service,
    medicine_service,
    retrieval_service,
    supply_chain_service,
    treatment_service,
)
from services.graph_explore import get_stats
from utils.validation import ValidationError

DEFAULT_ORIGIN_CITY = "Chennai"

CITY_COORDS = {
    "chennai": (13.0827, 80.2707),
    "mumbai": (19.0760, 72.8777),
    "delhi": (28.7041, 77.1025),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "hyderabad": (17.3850, 78.4867),
    "pune": (18.5204, 73.8567),
    "kolkata": (22.5726, 88.3639),
    "ahmedabad": (23.0225, 72.5714),
    "jaipur": (26.9124, 75.7873),
    "kochi": (9.9312, 76.2673),
}

_MEDICINE_HINTS = ("medicine", "drug", "stock", "available", "availability", "supply of",
                   "shortage", "shortag", "pharmacy", "hospital have")
_NEARBY_HINTS = ("near", "nearby", "nearest", "close to", "around", "within")
_PATIENT_HINTS = ("patient",)
_SIMILAR_HINTS = ("similar", "like this", "cohort", "comparable")
_TREATMENT_HINTS = ("treatment", "treated", "therapy", "outcome", "effective")
_TRACE_HINTS = ("trace", "where does", "come from", "origin", "supply chain",
                "batch", "manufacturer", "supplier", "sourced")
_STATS_HINTS = ("how many", "stats", "statistics", "overview", "count", "summary")


def handle_message(message: str) -> dict:
    message = (message or "").strip()
    if not message:
        raise ValidationError("'message' is required")

    client = get_llm_client()
    intent_data = None
    degraded = False
    if client is not None:
        try:
            intent_data = _extract_intent(client, message)
        except LLMError:
            degraded = True
    if intent_data is None:
        intent_data = fallback_extract(message)
        degraded = True if client is not None else degraded

    intent, entities = intent_data
    evidence_package, graph_links, template = dispatch(intent, entities)

    reply = None
    if client is not None and not degraded:
        try:
            reply = client.generate(
                prompts.build_explanation_messages(message, evidence_package)
            ).strip()
        except LLMError:
            degraded = True
    if not reply:
        reply = template  # deterministic phrasing when Groq is down/absent

    return {
        "reply": reply,
        "intent": intent,
        "entities": entities,
        "degraded": degraded,
        "llm_used": client is not None and not degraded,
        "data": evidence_package,
        "graph_links": graph_links,
        "disclaimer": "Decision-support prototype; not a substitute for professional medical judgment.",
    }


# ---------------------------------------------------------------- dispatch --

def dispatch(intent: str, entities: dict) -> tuple[dict, list[dict], str]:
    """Route an intent to controlled backend functions.

    Returns (evidence_package, graph_links, fallback_template).
    """
    try:
        if intent == "MEDICINE_AVAILABILITY":
            return _dispatch_availability(entities.get("medicine"))
        if intent == "FIND_NEARBY_MEDICINE":
            return _dispatch_nearby(entities.get("medicine"), entities.get("city"))
        if intent == "PATIENT_SIMILARITY":
            return _dispatch_similarity(entities.get("patient"))
        if intent == "TREATMENT_INTELLIGENCE":
            return _dispatch_treatments(entities.get("patient"))
        if intent == "MEDICINE_SHORTAGE":
            return _dispatch_shortage(entities.get("medicine"))
        if intent == "SUPPLY_CHAIN_TRACE":
            package, links, _template = _dispatch_trace(entities.get("medicine"), entities.get("batch"))
            return package, links, _template or "Supply-chain trace retrieved from the graph."
        if intent == "GRAPH_STATS":
            stats = get_stats()
            text = ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in stats["node_types"].items())
            return stats, [], f"Knowledge graph overview -- {stats['total_nodes']} nodes and {stats['total_relationships']} relationships ({text})."
    except ValidationError as exc:
        return {"error": str(exc)}, [], str(exc)

    return (
        {"help": "Try asking about medicine availability, shortages, similar patients, treatments, or supply chains."},
        [],
        "I can help with medicine availability, nearby stock, shortages, patient similarity, treatment outcomes and supply-chain tracing. What would you like to know?",
    )


def _dispatch_availability(medicine: str | None):
    if not medicine:
        raise ValidationError("Please name a medicine.")
    resolved = location_service.resolve_medication(medicine)
    if resolved is None:
        return {"error": f"No medicine matching '{medicine}' was found."}, [], \
            f"No medicine matching '{medicine}' was found in the knowledge graph."
    availability = medicine_service.get_availability(resolved["id"])
    links = [{"label": resolved["name"], "entity_id": resolved["id"]}]
    top = availability["facilities"][:5]
    lines = "; ".join(f"{f['facility_name']} {f['quantity']} units" for f in top) or "no valid stock"
    template = (f"{resolved['name']}: total {availability['total_quantity']} units "
                f"({availability['status']}). Top locations: {lines}.")
    return availability, links, template


def _dispatch_nearby(medicine: str | None, city: str | None):
    if not medicine:
        raise ValidationError("Please name a medicine.")
    origin_city = city or DEFAULT_ORIGIN_CITY
    coords = CITY_COORDS.get(origin_city.lower().strip()) or location_service.resolve_location(origin_city)
    if coords is None:
        coords = CITY_COORDS[DEFAULT_ORIGIN_CITY.lower()]
    lat, lng = coords[0], coords[1]
    result = location_service.find_nearby_medicine(medicine, lat, lng)
    if result is None:
        return {"error": f"No medicine matching '{medicine}' was found."}, [], \
            f"No medicine matching '{medicine}' was found."
    nearest = result.get("nearest")
    links = [{"label": result["medicine"]["name"], "entity_id": result["medicine"]["id"]}]
    if nearest:
        template = (f"Nearest facility with {result['medicine']['name']} is "
                    f"{nearest['facility_name']} ({nearest['distance_km']} km away, "
                    f"{nearest['quantity']} units). {len(result['results'])} facilities found.")
    else:
        template = f"No facility currently holds valid stock of {result['medicine']['name']}."
    return result, links, template


def _dispatch_similarity(patient: str | None):
    if not patient:
        raise ValidationError("Please name a patient.")
    pid = _resolve_patient(patient)
    if pid is None:
        return {"error": f"No patient matching '{patient}' was found."}, [], \
            f"No patient matching '{patient}' was found."
    package = retrieval_service.similar_patients_package(pid)
    links = [{"label": package["patient"]["name"], "entity_id": pid}]
    top = package["similar_patients"][:3]
    names = ", ".join(f"{p['name']} ({p['score']:.2f})" for p in top) or "none above threshold"
    template = f"Found {len(package['similar_patients'])} clinically similar patients. Top matches: {names}."
    return package, links, template


def _dispatch_treatments(patient: str | None):
    if not patient:
        raise ValidationError("Please name a patient.")
    pid = _resolve_patient(patient)
    if pid is None:
        return {"error": f"No patient matching '{patient}' was found."}, [], \
            f"No patient matching '{patient}' was found."
    package = retrieval_service.build_patient_evidence_package(pid)
    links = [{"label": package["patient"]["name"], "entity_id": pid}]
    ranked = package.get("ranked_treatments") or []
    if ranked:
        best = ranked[0]
        template = (f"For patients similar to {package['patient']['name']}, '{best['name']}' ranks highest: "
                    f"{best['success_rate']}% success across {best['cases']} similar cases"
                    + (f"; supported by {len(best.get('evidence') or [])} evidence sources." if best.get("evidence") else "."))
    else:
        template = "No treatment cohort met the minimum case threshold for ranking."
    return package, links, template


def _dispatch_shortage(medicine: str | None):
    if medicine:
        return _dispatch_availability(medicine)
    shortages = medicine_service.detect_shortages(limit=10)
    out = sum(1 for s in shortages if s["status"] == "out")
    low = sum(1 for s in shortages if s["status"] == "low")
    names = ", ".join(s["name"] for s in shortages[:5]) or "none"
    template = f"{out} medicines are out of stock and {low} are low. Most critical: {names}."
    return {"shortages": shortages}, [
        {"label": s["name"], "entity_id": s["id"]} for s in shortages[:5]
    ], template


def _dispatch_trace(medicine: str | None, batch: str | None):
    if batch:
        trace = supply_chain_service.trace_batch(batch)
        if trace:
            return trace, [{"label": batch, "entity_id": batch}], ""
    if medicine:
        resolved = location_service.resolve_medication(medicine)
        if resolved:
            trace = supply_chain_service.trace_supply_chain(resolved["id"])
            if trace:
                return trace, [{"label": resolved["name"], "entity_id": resolved["id"]}], ""
    return {"error": "Nothing found to trace."}, [], "No matching medicine or batch was found to trace."


# ------------------------------------------------------------- extraction --

_PATIENT_RESOLVE_QUERY = """
MATCH (p:Patient)
WHERE p.id = $q OR toLower(p.name) = toLower($q) OR toLower(p.name) CONTAINS toLower($q)
RETURN p.id AS id
ORDER BY CASE WHEN p.id = $q THEN 0 WHEN toLower(p.name) = toLower($q) THEN 1 ELSE 2 END,
         p.name
LIMIT 1
"""


def _resolve_patient(query: str) -> str | None:
    from services.graph_service import run_query

    rows = run_query(_PATIENT_RESOLVE_QUERY, {"q": query})
    return rows[0]["id"] if rows else None


def _extract_intent(client, message: str) -> tuple[str, dict]:
    catalog = {
        "medicines": [m["name"] for m in medicine_service.search_medications(None, 60)],
        "patients": _patient_names(),
        "cities": list(CITY_COORDS.keys()),
    }
    data = client.generate_json(prompts.build_intent_messages(message, catalog))
    intent = data.get("intent", "UNKNOWN")
    if intent not in prompts.ALLOWED_INTENTS:
        intent = "UNKNOWN"
    entities = data.get("entities") or {}
    if not isinstance(entities, dict):
        entities = {}
    return intent, {k: v for k, v in entities.items() if isinstance(v, str) and v.strip()}


def fallback_extract(message: str) -> tuple[str, dict]:
    """Deterministic keyword-based intent extraction (Groq-free path)."""
    lowered = message.lower()
    entities: dict = {}

    city = next((c for c in CITY_COORDS if re.search(rf"\b{c}\b", lowered)), None)
    if city:
        entities["city"] = city.title()

    medicine = _extract_medicine(lowered)
    if medicine:
        entities["medicine"] = medicine

    batch = re.search(r"\bbatch[\s-]*(\d{3,6})\b", lowered)
    if batch:
        entities["batch"] = f"BATCH-{batch.group(1)}"

    patient = _match_patient(lowered)
    if patient:
        entities["patient"] = patient

    has_nearby = any(h in lowered for h in _NEARBY_HINTS)
    has_trace = any(h in lowered for h in _TRACE_HINTS)
    has_shortage = "shortage" in lowered or "out of stock" in lowered
    has_stats = any(h in lowered for h in _STATS_HINTS)
    has_similar = any(h in lowered for h in _SIMILAR_HINTS)
    has_treatment = any(h in lowered for h in _TREATMENT_HINTS)
    has_med_topic = bool(medicine) or any(h in lowered for h in _MEDICINE_HINTS)
    has_patient_topic = "patient" in lowered

    if has_nearby and has_med_topic:
        return "FIND_NEARBY_MEDICINE", entities
    if has_trace and (medicine or "batch" in entities or "batch" in lowered):
        return "SUPPLY_CHAIN_TRACE", entities
    if has_similar and has_patient_topic:
        return "PATIENT_SIMILARITY", entities
    if has_treatment and has_patient_topic:
        return "TREATMENT_INTELLIGENCE", entities
    if has_shortage:
        return "MEDICINE_SHORTAGE", entities
    if has_stats:
        return "GRAPH_STATS", entities
    if has_med_topic:
        return "MEDICINE_AVAILABILITY", entities
    return "UNKNOWN", entities


_MEDICINE_PATTERNS = [
    r"(?:availability of|stock of|supply of)\s+([a-z0-9][a-z0-9 \-]*)",
    r"(?:where is|where does)\s+([a-z0-9][a-z0-9 \-]*?)\s+(?:available|come from|exist)",
    r"(?:facility|pharmacy|hospital)\s+with\s+([a-z0-9][a-z0-9 \-]*?)(?:\s+in\b|$|[?.!])",
    r"(?:medicines?|drugs?)\s+(?:like|called|named)\s+([a-z0-9][a-z0-9 \-]*)",
]

_FILLER_WORDS = {
    "available", "in", "stock", "near", "nearby", "me", "the", "a", "an",
    "please", "now", "today", "currently", "right",
}


def _extract_medicine(lowered: str) -> str | None:
    for pattern in _MEDICINE_PATTERNS:
        match = re.search(pattern, lowered)
        if match:
            words = [
                w for w in match.group(1).split()
                if w not in _FILLER_WORDS and w not in CITY_COORDS
            ]
            if words:
                return " ".join(words[:4])
    return None


def _match_patient(lowered: str) -> str | None:
    exact_id = re.search(r"\bpatient-\d{3}\b", lowered)
    if exact_id:
        return exact_id.group(0)
    for name in _patient_names():
        if name.lower() in lowered:
            return name
    match = re.search(r"patient\s+([a-z]+(?:\s[a-z]+)?)", lowered)
    if match:
        return match.group(1).title()
    return None


_patients_cache: list[str] | None = None


def _patient_names() -> list[str]:
    global _patients_cache
    if _patients_cache is None:
        rows = _fetch_patient_names()
        _patients_cache = [r["name"] for r in rows]
    return _patients_cache


def _fetch_patient_names() -> list[dict]:
    from services.graph_service import GraphConnectionError, run_query

    try:
        return run_query("MATCH (p:Patient) RETURN p.name AS name ORDER BY p.name LIMIT 200")
    except (GraphConnectionError, Exception):
        # Entity resolution is best-effort; intent classification must survive
        # a database outage.
        return []


def reset_caches() -> None:
    global _patients_cache
    _patients_cache = None
