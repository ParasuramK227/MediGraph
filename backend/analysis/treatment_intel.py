"""Deterministic patient/treatment intelligence analysis.

All computation here is pure-python over data fetched from Neo4j. No LLM is
used for judging/scoring — data-sensitivity constraint. Scores are explained
by provenance (cohort size, evidence counts) rather than opaque model output.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Similarity
# ---------------------------------------------------------------------------

def jaccard(a: List[str], b: List[str]) -> float:
    """Jaccard similarity over two iterables of strings."""
    sa = set(a or [])
    sb = set(b or [])
    if not sa and not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def compute_similar_patients(
    target: Dict[str, Any], candidates: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Compute real similar patients to the target from shared diagnoses.

    Each candidate is enriched with the shared-diagnosis overlap and a Jaccard
    similarity score, sorted descending. Only patients sharing >=1 diagnosis
    with the target are returned.
    """
    target_diags = set(target.get("diagnoses") or [])
    similar = []
    for other in candidates:
        if other.get("id") == target.get("id"):
            continue
        other_diags = set(other.get("diagnoses") or [])
        shared = target_diags & other_diags
        if not shared:
            continue
        sim = jaccard(target_diags, other_diags)
        if sim <= 0:
            continue
        enriched = dict(other)
        enriched["overlap"] = len(shared)
        enriched["similarity"] = round(sim, 3)
        enriched["shared_diagnoses"] = sorted(shared)
        similar.append(enriched)
    similar.sort(key=lambda r: (r["similarity"], r["overlap"]), reverse=True)
    return similar


# ---------------------------------------------------------------------------
# Per-diagnosis success ranking
# ---------------------------------------------------------------------------

def _lab_success(lab: Dict[str, Any]) -> bool:
    status = (lab.get("status") or "").strip().lower()
    return status == "normal"


def _score_diagnosis(disease: str, cohort: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Score a single diagnosis from the lab-outcome rate of its cohort.

    cohort = the target patient + similar patients who share this diagnosis.
    Only patients with lab evidence contribute to the rate; if none have labs,
    a neutral 0.5 score is assigned (degrading gracefully on sparse data).
    """
    with_labs = [p for p in cohort if p.get("labs")]
    if not with_labs:
        return {
            "disease": disease,
            "score": 0.5,
            "confidence_low": True,
            "cohort_size": len(cohort),
            "patients_with_labs": 0,
            "lab_count": 0,
            "note": (
                f"No lab evidence among the {len(cohort)} patient(s) with "
                f"'{disease}'; neutral score assigned."
            ),
        }
    successes = sum(1 for p in with_labs if any(_lab_success(l) for l in p["labs"]))
    lab_count = sum(len(p.get("labs") or []) for p in with_labs)
    rate = successes / len(with_labs)
    return {
        "disease": disease,
        "score": round(rate, 3),
        "confidence_low": len(with_labs) < 2,
        "cohort_size": len(cohort),
        "patients_with_labs": len(with_labs),
        "lab_count": lab_count,
        "note": (
            f"{successes}/{len(with_labs)} similar patient(s) with '{disease}' "
            f"showed normal post-treatment lab results ({lab_count} lab tests)."
        ),
    }


def rank_diagnoses(
    target: Dict[str, Any], similar: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Rank the target's diagnoses by similarity-adjusted lab outcome.

    For each diagnosis the target has, build a cohort of [target] + similar
    patients sharing that diagnosis, then score by lab-normalized success.
    """
    target_diags = target.get("diagnoses") or []
    ranked = []
    for diagnosis in target_diags:
        cohort = [target]
        for s in similar:
            if diagnosis in (s.get("shared_diagnoses") or []) or diagnosis in (s.get("diagnoses") or []):
                cohort.append(s)
        ranked.append(_score_diagnosis(diagnosis, cohort))
    ranked.sort(key=lambda r: r["score"], reverse=True)
    # Add 1-indexed rank position
    for i, entry in enumerate(ranked, start=1):
        entry["rank"] = i
    return ranked
