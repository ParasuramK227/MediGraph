"""GraphRAG retrieval: assemble evidence-grounded subgraphs + doc hits.

Combines (1) knowledge-graph traversal, (2) structured results and
(3) optional vector search into compact "evidence packages". These packages
are what the chatbot is allowed to explain -- nothing else.
"""
from __future__ import annotations

from services import similarity_service, treatment_service, vector_service
from services.graph_service import run_query

PATIENT_SUBGRAPH_QUERY = """
MATCH (p:Patient {id: $pid})
OPTIONAL MATCH (p)-[:HAS_SYMPTOM]->(s:Symptom)
OPTIONAL MATCH (p)-[:HAS_DIAGNOSIS]->(d:Disease)
OPTIONAL MATCH (p)-[r:RECEIVED_TREATMENT]->(t:Treatment)
OPTIONAL MATCH (t)-[:USES_MEDICATION]->(m:Medication)
OPTIONAL MATCH (e:Evidence)-[:SUPPORTS]->(t)
RETURN p AS patient,
       collect(DISTINCT s) AS symptoms,
       collect(DISTINCT d) AS diseases,
       collect(DISTINCT t) AS treatments,
       collect(DISTINCT m) AS medications,
       collect(DISTINCT e) AS evidence
"""

ENTITY_SEARCH_QUERY = """
MATCH (n)
WHERE (n:Patient OR n:Disease OR n:Symptom OR n:Treatment OR n:Medication
       OR n:DrugBatch OR n:Hospital OR n:Pharmacy OR n:Warehouse
       OR n:Manufacturer OR n:Supplier OR n:Distributor)
  AND (toLower(coalesce(n.name, '')) CONTAINS toLower($q)
       OR toLower(coalesce(n.title, '')) CONTAINS toLower($q)
       OR toLower(coalesce(n.id, '')) CONTAINS toLower($q))
RETURN n.id AS id, coalesce(n.name, n.title, n.id) AS label,
       head(labels(n)) AS type LIMIT $limit
"""


def build_patient_evidence_package(patient_id: str) -> dict | None:
    """Full clinical context for a patient: profile, cohort, ranked treatments."""
    rows = run_query(PATIENT_SUBGRAPH_QUERY, {"pid": patient_id})
    if not rows or not rows[0].get("patient"):
        return None

    row = rows[0]
    intelligence = treatment_service.get_treatment_intelligence(patient_id)

    def _flat(node):
        node = dict(node)
        if "properties" in node:  # driver node shape -> flat props
            flat = dict(node["properties"])
            flat["id"] = node.get("id") or flat.get("id")
            return flat
        return node

    def names(items):
        return [_flat(i).get("name") for i in items if i and _flat(i).get("name")]

    patient_node = _flat(row["patient"])

    return {
        "patient": patient_node,
        "symptoms": names(row["symptoms"]),
        "diseases": names(row["diseases"]),
        "treatments": names(row["treatments"]),
        "medications": names(row["medications"]),
        "evidence_sources": [
            {"id": e["id"], "source": _flat(e).get("source"),
             "confidence": _flat(e).get("confidence")}
            for e in row["evidence"] if e
        ],
        "similar_cohort_size": intelligence["cohort_size"] if intelligence else 0,
        "ranked_treatments": intelligence["ranked_treatments"] if intelligence else [],
        "method": "graphrag-deterministic",
    }


def similar_patients_package(patient_id: str) -> dict | None:
    profile = similarity_service.get_patient_profile(patient_id)
    if profile is None:
        return None
    similar = similarity_service.find_similar_patients(patient_id)
    return {
        "patient": {"id": patient_id, "name": profile["name"]},
        "weights_used": {
            "symptom": 0.35, "disease": 0.30, "lab": 0.15, "treatment": 0.20,
        },
        "similar_patients": similar[:10],
        "method": "deterministic-python",
    }


def hybrid_search(query: str, limit: int = 8) -> dict:
    """Graph entity matches + TF-IDF document matches for a free-text query."""
    entities = run_query(ENTITY_SEARCH_QUERY, {"q": query, "limit": limit})
    documents = vector_service.search_documents(query, top_k=5)
    return {"query": query, "entities": entities, "documents": documents}
