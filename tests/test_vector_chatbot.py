"""Tests for the TF-IDF vector index and chatbot fallback extraction."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.vector_service import VectorIndex  # noqa: E402
from chatbot import chatbot_service  # noqa: E402


DOCS = [
    {"id": "d1", "text": "Patient started on metformin therapy for type 2 diabetes management.",
     "doc_type": "MedicalRecord", "entity_ref": "patient-001"},
    {"id": "d2", "text": "Asthma stepwise therapy includes salbutamol inhaler and budesonide.",
     "doc_type": "Evidence", "entity_ref": "evidence-001"},
    {"id": "d3", "text": "Iron supplementation improved hemoglobin in anemia cohort.",
     "doc_type": "ClinicalStudy", "entity_ref": "study-001"},
]


def test_vector_search_ranks_relevant_doc_first():
    index = VectorIndex(DOCS)
    hits = index.search("metformin diabetes", top_k=2)
    assert hits and hits[0]["id"] == "d1"


def test_vector_search_no_match_returns_empty():
    index = VectorIndex(DOCS)
    assert index.search("zzzqqq unrelated") == []


def test_fallback_intent_availability():
    intent, entities = chatbot_service.fallback_extract("Where is Paracetamol available?")
    assert intent == "MEDICINE_AVAILABILITY"
    assert entities.get("medicine") == "paracetamol"


def test_fallback_intent_nearby():
    intent, entities = chatbot_service.fallback_extract(
        "Find the nearest facility with Ibuprofen in Chennai")
    assert intent == "FIND_NEARBY_MEDICINE"
    assert entities.get("city") == "Chennai"


def test_fallback_intent_shortage():
    intent, _ = chatbot_service.fallback_extract("Which medicines are in shortage?")
    assert intent == "MEDICINE_SHORTAGE"


def test_fallback_intent_stats():
    intent, _ = chatbot_service.fallback_extract("How many patients are in the graph?")
    assert intent == "GRAPH_STATS"


def test_fallback_intent_unknown():
    intent, _ = chatbot_service.fallback_extract("Tell me a joke")
    assert intent == "UNKNOWN"
