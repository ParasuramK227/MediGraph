"""Integration tests against a live Neo4j instance.

Skipped automatically when Neo4j is unreachable, so `pytest` stays green on
machines without the database.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.graph_service import GraphConnectionError, close_driver, run_query  # noqa: E402


def _neo4j_available() -> bool:
    try:
        run_query("RETURN 1 AS ok")
        return True
    except Exception:
        return False


NEO4J_UP = _neo4j_available()
pytestmark = pytest.mark.skipif(not NEO4J_UP, reason="Neo4j not reachable")

if NEO4J_UP:
    from chatbot import chatbot_service
    from services import (
        location_service,
        medicine_service,
        retrieval_service,
        similarity_service,
        supply_chain_service,
        treatment_service,
    )
    from services.graph_explore import get_schema, get_stats, search_entities


    def test_graph_has_expected_nodes():
        stats = get_stats()
        assert stats["total_nodes"] > 100
        types = stats["node_types"]
        for label in ("Patient", "Disease", "Medication", "Hospital", "DrugBatch"):
            assert types.get(label, 0) > 0, f"missing {label} nodes"


    def test_patient_similarity_deterministic():
        patients = run_query("MATCH (p:Patient) RETURN p.id AS id LIMIT 1")
        pid = patients[0]["id"]
        first = similarity_service.find_similar_patients(pid)
        second = similarity_service.find_similar_patients(pid)
        assert [p["id"] for p in first] == [p["id"] for p in second]
        for entry in first:
            assert 0.0 <= entry["score"] <= 1.0


    def test_treatment_intelligence_shape():
        patients = run_query("MATCH (p:Patient) RETURN p.id AS id LIMIT 1")
        result = treatment_service.get_treatment_intelligence(patients[0]["id"])
        assert result is not None
        assert result["method"] == "deterministic-python"
        for t in result["ranked_treatments"]:
            assert t["cases"] >= 5
            assert 0 <= t["success_rate"] <= 100


    def test_availability_ignores_expired_stock():
        meds = medicine_service.search_medications(None, 5)
        availability = medicine_service.get_availability(meds[0]["id"])
        today = __import__("datetime").date.today()
        for facility in availability["facilities"]:
            expiry = facility.get("expiry_date")
            if expiry:
                assert expiry >= today.isoformat(), "expired stock leaked into availability"


    def test_shortage_detection_returns_classified_rows():
        shortages = medicine_service.detect_shortages(limit=50)
        for s in shortages:
            assert s["status"] in ("out", "low")
            assert s["total_stock"] < 150


    def test_supply_chain_trace_payload():
        batch = run_query("MATCH (b:DrugBatch) RETURN b.id AS id LIMIT 1")[0]["id"]
        trace = supply_chain_service.trace_batch(batch)
        assert trace is not None
        node_types = {n["type"] for n in trace["graph"]["nodes"]}
        assert "DrugBatch" in node_types
        for edge in trace["graph"]["edges"]:
            ids = {n["id"] for n in trace["graph"]["nodes"]}
            assert edge["source"] in ids and edge["target"] in ids


    def test_nearby_search_ranks_by_distance():
        result = location_service.find_nearby_medicine("Paracetamol", 13.0827, 80.2707)
        if result and result["results"]:
            distances = [f["distance_km"] for f in result["results"]]
            assert distances == sorted(distances)


    def test_graph_explore_endpoints_logic():
        hits = search_entities("patient", limit=3)
        assert len(hits) <= 3
        schema = get_schema()
        assert any(t["type"] == "Patient" for t in schema["node_types"])
        entity_id = hits[0]["id"]
        subgraph = __import__("services.graph_explore", fromlist=["get_subgraph"]).get_subgraph(entity_id)
        assert subgraph["center"] == entity_id
        assert any(n["id"] == entity_id for n in subgraph["nodes"])


    def test_graphrag_package_grounding():
        patients = run_query("MATCH (p:Patient) RETURN p.id AS id LIMIT 1")
        package = retrieval_service.build_patient_evidence_package(patients[0]["id"])
        assert package["method"] == "graphrag-deterministic"
        assert isinstance(package["ranked_treatments"], list)


    def test_chatbot_works_without_llm(monkeypatch):
        monkeypatch.setattr(chatbot_service, "get_llm_client", lambda: None)
        response = chatbot_service.handle_message("Where is Paracetamol available?")
        assert response["llm_used"] is False
        assert response["reply"]
        assert response["intent"] in chatbot_service.prompts.ALLOWED_INTENTS


    def test_chatbot_never_errors_on_garbage(monkeypatch):
        monkeypatch.setattr(chatbot_service, "get_llm_client", lambda: None)
        response = chatbot_service.handle_message("tell me about quantum physics please")
        assert response["intent"] == "UNKNOWN"

    close_driver()
