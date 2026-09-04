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


# ---------------------------------------------------------------------------
# Per-treatment success ranking
# ---------------------------------------------------------------------------

POSITIVE_OUTCOMES = {"resolved", "cured", "recovered", "improved", "success"}


def _treatment_success(t: Dict[str, Any]) -> Optional[float]:
    """Return a normalized 0..1 success rate for a treatment, or None if no
    outcome signal is available (so callers can degrade gracefully)."""
    success = t.get("success")
    if success is not None:
        try:
            return max(0.0, min(1.0, float(success)))
        except (TypeError, ValueError):
            pass
    outcome = (t.get("outcome") or "").strip().lower()
    if outcome:
        return 1.0 if outcome in POSITIVE_OUTCOMES else 0.0
    return None


def rank_treatments(
    target: Dict[str, Any],
    treatments_by_disease: Dict[str, List[Dict[str, Any]]],
    recovered_patients_by_treatment: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    top: int = 5,
) -> Dict[str, Any]:
    """Rank treatments (1..top) for the target's diagnoses by success rate.

    treatments_by_disease maps disease name -> Treatment records (which may
    carry outcome/success). recovered_patients_by_treatment optionally maps
    treatment id -> list of similar patient dicts who recovered on it, so the
    UI can list "similar patients who got cured".

    Degrades gracefully:
      - if no treatment->disease edges exist, returns has_data=False + note.
      - if edges exist but no outcome signal, returns has_data=True,
        has_outcome=False + neutral per-diagnosis entries.
    """
    target_diags = set(target.get("diagnoses") or [])
    dedup: Dict[str, Dict[str, Any]] = {}
    has_data = False
    has_outcome = False

    for disease in target_diags:
        treats = treatments_by_disease.get(disease) or []
        if treats:
            has_data = True
        for t in treats:
            rate = _treatment_success(t)
            if rate is not None:
                has_outcome = True
            key = t.get("name") or t.get("treatment_type") or t.get("id")
            if not key:
                continue
            exists = dedup.get(key)
            if exists is None or (rate is not None and exists.get("_rate") is None):
                entry = dict(t)
                entry["disease"] = disease
                entry["success_rate"] = rate
                entry["_rate"] = rate
                # recovered buckets are keyed by treatment name (id may be a
                # less stable / competing node id); fall back to id lookup.
                recovered = (recovered_patients_by_treatment or {}).get(
                    key, (recovered_patients_by_treatment or {}).get(t.get("id"), [])
                )
                entry["recovered_patients"] = recovered
                dedup[key] = entry
            else:
                # keep the best rate across overlapping diagnoses
                if rate is not None and (exists.get("_rate") is None or rate > exists["_rate"]):
                    exists["success_rate"] = rate
                    exists["_rate"] = rate

    if not has_data:
        return {
            "has_data": False,
            "has_outcome": False,
            "treatments": [],
            "note": (
                "No treatment→disease links in the graph yet, so treatments "
                "cannot be ranked. Add (Treatment)-[:TREATS]->(Disease) edges."
            ),
        }

    entries = list(dedup.values())
    # Null success rates rank last; ties broken by name
    entries.sort(key=lambda e: (e.get("_rate") is None, -(e.get("_rate") or 0), e.get("name") or ""))
    for i, e in enumerate(entries[:top], start=1):
        e["rank"] = i
    for e in entries:
        e.pop("_rate", None)

    if not has_outcome:
        return {
            "has_data": True,
            "has_outcome": False,
            "treatments": entries[:top],
            "note": (
                f"Found {len(entries)} treatment(s) for this patient's diagnoses, but none "
                "carry an outcome field yet, so success rates are not available."
            ),
        }

    return {
        "has_data": True,
        "has_outcome": True,
        "treatments": entries[:top],
        "note": None,
    }
