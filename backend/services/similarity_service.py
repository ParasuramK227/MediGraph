"""Deterministic patient-similarity computation.

All scoring happens here in Python -- never in the LLM.
Weights are configurable via config.SIMILARITY_WEIGHTS.
"""
from __future__ import annotations

from config import SIMILAR_MIN_SCORE, SIMILAR_TOP_K, SIMILARITY_WEIGHTS
from services.graph_service import run_query

PROFILE_QUERY = """
MATCH (p:Patient {id: $pid})
OPTIONAL MATCH (p)-[:HAS_SYMPTOM]->(s:Symptom)
OPTIONAL MATCH (p)-[:HAS_DIAGNOSIS]->(d:Disease)
OPTIONAL MATCH (p)-[lr:UNDERWENT_TEST]->(lt:LabTest)
OPTIONAL MATCH (p)-[:RECEIVED_TREATMENT]->(tr:Treatment)
RETURN p.id AS id, p.name AS name, p.age AS age, p.gender AS gender,
       collect(DISTINCT s.name) AS symptoms,
       collect(DISTINCT d.name) AS diseases,
       collect(DISTINCT lt.name + '|' + coalesce(lr.flag, 'unknown')) AS labs,
       collect(DISTINCT tr.name) AS treatments
"""

CANDIDATES_QUERY = """
MATCH (:Patient {id: $pid})-[:HAS_SYMPTOM|HAS_DIAGNOSIS]->(shared)<-[:HAS_SYMPTOM|HAS_DIAGNOSIS]-(c:Patient)
WHERE c.id <> $pid
WITH DISTINCT c
OPTIONAL MATCH (c)-[:HAS_SYMPTOM]->(s:Symptom)
OPTIONAL MATCH (c)-[:HAS_DIAGNOSIS]->(d:Disease)
OPTIONAL MATCH (c)-[lr:UNDERWENT_TEST]->(lt:LabTest)
OPTIONAL MATCH (c)-[:RECEIVED_TREATMENT]->(tr:Treatment)
RETURN c.id AS id, c.name AS name, c.age AS age, c.gender AS gender,
       collect(DISTINCT s.name) AS symptoms,
       collect(DISTINCT d.name) AS diseases,
       collect(DISTINCT lt.name + '|' + coalesce(lr.flag, 'unknown')) AS labs,
       collect(DISTINCT tr.name) AS treatments
"""


def jaccard(set_a: set, set_b: set) -> float:
    """Jaccard similarity of two sets; 0.0 when both empty."""
    if not set_a and not set_b:
        return 0.0
    union = set_a | set_b
    return len(set_a & set_b) / len(union)


def compute_similarity_score(profile_a: dict, profile_b: dict, weights: dict | None = None) -> dict:
    """Weighted similarity between two patient profiles.

    Returns {"score": float, "breakdown": {component: float}}.
    """
    w = weights or SIMILARITY_WEIGHTS
    symptom_sim = jaccard(_clean(profile_a["symptoms"]), _clean(profile_b["symptoms"]))
    disease_sim = jaccard(_clean(profile_a["diseases"]), _clean(profile_b["diseases"]))
    lab_sim = jaccard(_clean(profile_a["labs"]), _clean(profile_b["labs"]))
    treatment_sim = jaccard(_clean(profile_a["treatments"]), _clean(profile_b["treatments"]))
    score = (
        w["symptom"] * symptom_sim
        + w["disease"] * disease_sim
        + w["lab"] * lab_sim
        + w["treatment"] * treatment_sim
    )
    return {
        "score": round(score, 4),
        "breakdown": {
            "symptom": round(symptom_sim, 4),
            "disease": round(disease_sim, 4),
            "lab": round(lab_sim, 4),
            "treatment": round(treatment_sim, 4),
        },
    }


def find_similar_patients(patient_id: str, top_k: int = SIMILAR_TOP_K,
                          min_score: float = SIMILAR_MIN_SCORE,
                          weights: dict | None = None) -> list[dict]:
    """Rank other patients by deterministic clinical similarity."""
    index_rows = run_query(PROFILE_QUERY, {"pid": patient_id})
    if not index_rows:
        return []
    index_profile = index_rows[0]
    candidates = run_query(CANDIDATES_QUERY, {"pid": patient_id})

    scored = []
    for candidate in candidates:
        result = compute_similarity_score(index_profile, candidate, weights)
        if result["score"] >= min_score:
            entry = {
                "id": candidate["id"],
                "name": candidate["name"],
                "age": candidate["age"],
                "gender": candidate["gender"],
                "score": result["score"],
                "breakdown": result["breakdown"],
            }
            scored.append(entry)
    scored.sort(key=lambda x: (-x["score"], x["name"]))
    return scored[:top_k]


def get_patient_profile(patient_id: str) -> dict | None:
    rows = run_query(PROFILE_QUERY, {"pid": patient_id})
    return rows[0] if rows else None


def _clean(values: list) -> set:
    return {v for v in values if v}
