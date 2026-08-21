"""Treatment intelligence: outcome aggregation and deterministic ranking.

Given a patient, find clinically similar patients, aggregate their treatment
outcomes, rank treatments by success rate (with evidence), all in Python.
"""
from __future__ import annotations

from config import TREATMENT_MIN_CASES, TREATMENT_TOP_K
from services import similarity_service
from services.graph_service import run_query

OUTCOMES_QUERY = """
MATCH (p:Patient)-[r:RECEIVED_TREATMENT]->(t:Treatment)
WHERE p.id IN $ids
OPTIONAL MATCH (t)-[:EFFECTIVE_FOR]->(d:Disease)
RETURN t.id AS treatment_id, t.name AS treatment_name, t.type AS treatment_type,
       r.outcome AS outcome, r.duration_days AS duration_days,
       p.id AS patient_id,
       collect(DISTINCT d.name) AS effective_for
"""

EVIDENCE_QUERY = """
MATCH (e:Evidence)-[:SUPPORTS]->(t:Treatment {id: $tid})
OPTIONAL MATCH (e)-[:RELATES_TO]->(d:Disease)
OPTIONAL MATCH (e)-[:CITES_STUDY]->(cs:ClinicalStudy)
RETURN e.id AS evidence_id, e.source AS source, e.evidence_type AS evidence_type,
       e.confidence AS confidence, e.publication_date AS publication_date,
       collect(DISTINCT d.name) AS relates_to,
       collect(DISTINCT cs.title) AS studies
ORDER BY e.confidence DESC
"""


def aggregate_outcomes(outcome_rows: list[dict]) -> dict:
    """Aggregate raw outcome rows per treatment. Pure function."""
    stats: dict[str, dict] = {}
    for row in outcome_rows:
        tid = row["treatment_id"]
        entry = stats.setdefault(
            tid,
            {
                "id": tid,
                "name": row["treatment_name"],
                "type": row.get("treatment_type"),
                "cases": 0,
                "successes": 0,
                "partial": 0,
                "failures": 0,
                "contributing_patients": set(),
                "effective_for": set(),
            },
        )
        entry["cases"] += 1
        outcome = (row.get("outcome") or "").lower()
        if outcome == "success":
            entry["successes"] += 1
        elif outcome == "partial":
            entry["partial"] += 1
        elif outcome == "failure":
            entry["failures"] += 1
        if row.get("patient_id"):
            entry["contributing_patients"].add(row["patient_id"])
        for disease in row.get("effective_for") or []:
            if disease:
                entry["effective_for"].add(disease)
    return stats


def rank_treatments(stats: dict[str, dict], min_cases: int = TREATMENT_MIN_CASES) -> list[dict]:
    """Deterministic ranking: success rate desc, then cases desc, then name."""
    ranked = []
    for entry in stats.values():
        if entry["cases"] < min_cases:
            continue
        success_rate = entry["successes"] / entry["cases"]
        ranked.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "type": entry["type"],
                "cases": entry["cases"],
                "successes": entry["successes"],
                "partial": entry["partial"],
                "failures": entry["failures"],
                "success_rate": round(success_rate * 100, 1),
                "effective_for": sorted(entry["effective_for"]),
                "sample_size": entry["cases"],
            }
        )
    ranked.sort(key=lambda t: (-t["success_rate"], -t["cases"], t["name"]))
    return ranked[:TREATMENT_TOP_K]


def get_treatment_intelligence(patient_id: str) -> dict | None:
    """Full pipeline: similar cohort -> outcomes -> ranking -> evidence."""
    profile = similarity_service.get_patient_profile(patient_id)
    if profile is None:
        return None

    similar = similarity_service.find_similar_patients(patient_id)
    cohort_ids = [similar_patient["id"] for similar_patient in similar]
    if not cohort_ids:
        return {
            "patient": {"id": patient_id, "name": profile["name"]},
            "cohort_size": 0,
            "ranked_treatments": [],
            "method": "deterministic-python",
        }

    outcome_rows = run_query(OUTCOMES_QUERY, {"ids": cohort_ids})
    stats = aggregate_outcomes(outcome_rows)
    ranked = rank_treatments(stats)

    patient_diseases = set(similarity_service._clean(profile["diseases"]))
    for treatment in ranked:
        overlap = patient_diseases & set(treatment["effective_for"])
        treatment["relevant_to_patient_diseases"] = sorted(overlap)
        treatment["evidence"] = get_treatment_evidence(treatment["id"])

    return {
        "patient": {"id": patient_id, "name": profile["name"]},
        "cohort_size": len(cohort_ids),
        "cohort_min_score": similar[-1]["score"] if similar else None,
        "ranked_treatments": ranked,
        "method": "deterministic-python",
    }


def get_treatment_evidence(treatment_id: str) -> list[dict]:
    rows = run_query(EVIDENCE_QUERY, {"tid": treatment_id})
    evidence = []
    for row in rows:
        evidence.append(
            {
                "id": row["evidence_id"],
                "source": row["source"],
                "type": row["evidence_type"],
                "confidence": row["confidence"],
                "publication_date": row["publication_date"],
                "relates_to": [d for d in (row.get("relates_to") or []) if d],
                "studies": [s for s in (row.get("studies") or []) if s],
            }
        )
    return evidence


def get_all_treatments(q: str | None = None, limit: int = 50) -> list[dict]:
    cypher = """
    MATCH (t:Treatment)
    WHERE $q IS NULL OR toLower(t.name) CONTAINS toLower($q)
    OPTIONAL MATCH (t)-[:EFFECTIVE_FOR]->(d:Disease)
    RETURN t.id AS id, t.name AS name, t.type AS type,
           collect(DISTINCT d.name) AS effective_for
    ORDER BY t.name LIMIT $limit
    """
    return run_query(cypher, {"q": q, "limit": limit})
