"""Neo4j data-fetching helpers for the patient/treatment intelligence features.

These functions return plain python dicts that the pure analysis module
(analysis/treatment_intel.py) consumes. No scoring happens here — only data
retrieval and light reshaping.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional


def _rows(session, query: str, **params) -> List[Dict[str, Any]]:
    return [dict(r) for r in session.run(query, **params)]


def fetch_all_patients_with_diags(session) -> List[Dict[str, Any]]:
    """Fetch every patient with their id/name/gender + list of diagnosis names."""
    rows = _rows(
        session,
        """
        MATCH (p:Patient)
        OPTIONAL MATCH (p)-[:HAS_DIAGNOSIS]->(d:Disease)
        RETURN p.id AS id, p.first_name AS first_name, p.last_name AS last_name,
               p.gender AS gender, collect(DISTINCT d.name) AS diagnoses
        """,
    )
    out = []
    for r in rows:
        out.append({
            "id": r.get("id"),
            "first_name": r.get("first_name"),
            "last_name": r.get("last_name"),
            "gender": r.get("gender"),
            "diagnoses": [d for d in (r.get("diagnoses") or []) if d is not None],
        })
    return out


def fetch_patient_intelligence(session, patient_id: str) -> Optional[Dict[str, Any]]:
    """Return enriched data for a single patient:
    baseline info, diagnoses, treatments, lab tests, consultation notes,
    and medication coverage for their diagnoses.

    Returns None if the patient does not exist.
    """
    rows = _rows(
        session,
        """
        MATCH (p:Patient {id: $id})
        OPTIONAL MATCH (p)-[:HAS_DIAGNOSIS]->(d:Disease)
        OPTIONAL MATCH (p)-[:RECEIVED_TREATMENT]->(t:Treatment)
        OPTIONAL MATCH (p)-[:HAS_LAB_TEST]->(l:LabTest)
        OPTIONAL MATCH (p)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote)
        RETURN p.id AS id, p.first_name AS first_name, p.last_name AS last_name,
               p.gender AS gender, p.date_of_birth AS date_of_birth,
               p.email AS email, p.contact_number AS contact_number,
               p.address AS address, p.insurance_provider AS insurance_provider,
               collect(DISTINCT d.name) AS diagnoses,
               collect(DISTINCT {id: t.id, type: t.treatment_type,
                                 cost: t.cost, date: t.treatment_date,
                                 description: t.description}) AS treatments,
               collect(DISTINCT {id: l.id, name: l.name, result: l.result,
                                 status: l.status, unit: l.unit, date: l.date}) AS labs,
               collect(DISTINCT {id: n.id, summary: n.summary,
                                 created_at: n.created_at,
                                 diagnoses: n.diagnoses,
                                 medications: n.medications_discussed,
                                 action_items: n.action_items}) AS notes
        """,
        id=patient_id,
    )
    if not rows:
        return None
    r = rows[0]
    return {
        "id": r.get("id"),
        "first_name": r.get("first_name"),
        "last_name": r.get("last_name"),
        "gender": r.get("gender"),
        "date_of_birth": r.get("date_of_birth"),
        "email": r.get("email"),
        "contact_number": r.get("contact_number"),
        "address": r.get("address"),
        "insurance_provider": r.get("insurance_provider"),
        "diagnoses": [d for d in (r.get("diagnoses") or []) if d],
        "treatments": [t for t in (r.get("treatments") or []) if t.get("id")],
        "labs": [l for l in (r.get("labs") or []) if l.get("id")],
        "notes": [n for n in (r.get("notes") or []) if n.get("id")],
    }


def fetch_labs_by_patient(session, patient_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """Fetch lab tests for a set of patients, keyed by patient id."""
    if not patient_ids:
        return {}
    rows = _rows(
        session,
        """
        MATCH (p:Patient)-[:HAS_LAB_TEST]->(l:LabTest)
        WHERE p.id IN $ids
        RETURN p.id AS pid, l.id AS id, l.name AS name, l.result AS result,
               l.status AS status, l.unit AS unit, l.date AS date
        """,
        ids=list(patient_ids),
    )
    labs_by_patient: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        pid = r.get("pid")
        if pid:
            labs_by_patient[pid].append({
                "id": r.get("id"),
                "name": r.get("name"),
                "result": r.get("result"),
                "status": r.get("status"),
                "unit": r.get("unit"),
                "date": r.get("date"),
            })
    return dict(labs_by_patient)


def fetch_diseases(session, names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Fetch Disease nodes (optionally filtered to a set of names)."""
    query = "MATCH (d:Disease) RETURN d.name AS name"
    params: Dict[str, Any] = {}
    if names:
        query = (
            "MATCH (d:Disease) WHERE d.name IN $names "
            "RETURN d.name AS name"
        )
        params["names"] = list(names)
    rows = _rows(session, query, **params)
    return [{"name": r.get("name")} for r in rows if r.get("name")]


def fetch_medications_for_diseases(
    session, names: List[str]
) -> Dict[str, List[str]]:
    """Map disease name -> list of medication names that TREAT it."""
    if not names:
        return {}
    rows = _rows(
        session,
        """
        MATCH (m:Medication)-[:TREATS]->(d:Disease)
        WHERE d.name IN $names
        RETURN d.name AS disease, COLLECT(DISTINCT m.name) AS meds
        """,
        names=list(names),
    )
    return {r["disease"]: (r.get("meds") or []) for r in rows}


def get_patient_intelligence(session, patient_id: str) -> Optional[Dict[str, Any]]:
    """Enriched summary for the patient detail page.

    Returns None if the patient does not exist. Result contains:
      - patient baseline info
      - medical_history (diagnoses, treatments, labs, notes)
      - similar_patients (computed on real shared diagnoses)
      - medications (diagnosis -> treating med list)
      - summary (auto-built from notes + diagnoses, no LLM)
    """
    target = fetch_patient_intelligence(session, patient_id)
    if target is None:
        return None

    # Real similarity from all patients' shared diagnoses
    all_patients = fetch_all_patients_with_diags(session)
    from . import treatment_intel
    similar = treatment_intel.compute_similar_patients(target, all_patients)

    # Attach labs to similar patients for cohort scoring
    sim_ids = [s["id"] for s in similar if s.get("id")]
    labs_by_sim = fetch_labs_by_patient(session, sim_ids)
    for s in similar:
        s["labs"] = labs_by_sim.get(s.get("id"), [])

    medical_history = {
        "diagnoses": target.get("diagnoses") or [],
        "treatments": target.get("treatments") or [],
        "labs": target.get("labs") or [],
        "notes": target.get("notes") or [],
    }

    # Medication coverage for this patient's diagnoses
    medications = fetch_medications_for_diseases(session, target.get("diagnoses") or [])

    # Deterministic summary from the patient's own notes + diagnoses
    summary = _build_summary(target)

    return {
        "patient": {
            "id": target["id"],
            "first_name": target["first_name"],
            "last_name": target["last_name"],
            "gender": target.get("gender"),
            "date_of_birth": target.get("date_of_birth"),
            "email": target.get("email"),
            "contact_number": target.get("contact_number"),
            "address": target.get("address"),
            "insurance_provider": target.get("insurance_provider"),
        },
        "summary": summary,
        "medical_history": medical_history,
        "similar_patients": similar,
        "medications": medications,
    }


def get_treatment_intel(session, patient_id: str) -> Optional[Dict[str, Any]]:
    """Per-patient ranked diagnoses (1 = highest success likelihood).

    Pure-python scoring: success = lab-normalized outcome among similar
    patients sharing each diagnosis. Returns None if the patient is missing.
    """
    target = fetch_patient_intelligence(session, patient_id)
    if target is None:
        return None
    all_patients = fetch_all_patients_with_diags(session)
    from . import treatment_intel
    similar = treatment_intel.compute_similar_patients(target, all_patients)
    sim_ids = [s["id"] for s in similar if s.get("id")]
    labs_by_sim = fetch_labs_by_patient(session, sim_ids)
    for s in similar:
        s["labs"] = labs_by_sim.get(s.get("id"), [])

    ranked = treatment_intel.rank_diagnoses(target, similar)

    return {
        "patient": {
            "id": target["id"],
            "first_name": target["first_name"],
            "last_name": target["last_name"],
            "gender": target.get("gender"),
        },
        "diagnoses": target.get("diagnoses") or [],
        "ranked": ranked,
        "similar_patients": [
            {"id": s.get("id"), "name": (s.get("first_name") or "") + " " + (s.get("last_name") or ""),
             "similarity": s.get("similarity"), "overlap": s.get("overlap")}
            for s in similar
        ],
    }


def _build_summary(target: Dict[str, Any]) -> str:
    """Build a short clinical summary deterministically (no LLM)."""
    name = ((target.get("first_name") or "") + " " + (target.get("last_name") or "")).strip() or (target.get("id") or "Patient")
    gender = target.get("gender") or "unknown"
    dob = target.get("date_of_birth") or "unknown"
    diags = target.get("diagnoses") or []
    notes = target.get("notes") or []

    parts = [f"{name} ({gender}, DOB {dob})"]
    if diags:
        parts.append(f"Diagnosed with: {', '.join(sorted(diags))}.")
    else:
        parts.append("No recorded diagnoses.")
    if notes:
        latest = sorted(notes, key=lambda n: n.get("created_at") or "", reverse=True)[0]
        parts.append(f"Most recent note: {latest.get('summary') or 'n/a'}")
    else:
        parts.append("No consultation notes on record.")
    treatments = target.get("treatments") or []
    if treatments:
        parts.append(f"{len(treatments)} treatment(s) on record.")
    labs = target.get("labs") or []
    if labs:
        parts.append(f"{len(labs)} lab test(s) on record.")
    return " ".join(parts)
