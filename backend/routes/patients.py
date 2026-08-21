"""Patient endpoints: search, profile, similarity, treatments, GraphRAG context."""
from flask import Blueprint, request

from services import retrieval_service, similarity_service, treatment_service
from services.provenance_service import stamp
from utils.validation import ValidationError, parse_positive_int, require_str
from services.graph_service import run_query

bp = Blueprint("patients", __name__, url_prefix="/patients")

PATIENT_SEARCH_QUERY = """
MATCH (p:Patient)
WHERE $q IS NULL OR toLower(p.name) CONTAINS toLower($q) OR p.id CONTAINS toLower($q)
RETURN p.id AS id, p.name AS name, p.age AS age, p.gender AS gender,
       p.blood_type AS blood_type
ORDER BY p.name LIMIT $limit
"""

PATIENT_BY_ID = """
MATCH (p:Patient {id: $id})
RETURN p.id AS id, p.name AS name, p.age AS age, p.gender AS gender,
       p.blood_type AS blood_type
"""


@bp.get("")
def list_patients():
    q = request.args.get("q", "").strip() or None
    limit = parse_positive_int(request.args.get("limit"), "limit", 25)
    patients = run_query(PATIENT_SEARCH_QUERY, {"q": q, "limit": limit})
    return {"data": stamp({"patients": patients}, "cypher-search"), "error": None}


@bp.get("/<patient_id>")
def get_patient(patient_id):
    rows = run_query(PATIENT_BY_ID, {"id": patient_id})
    if not rows:
        return {"data": None, "error": f"Patient '{patient_id}' not found"}, 404
    patient = rows[0]
    profile = similarity_service.get_patient_profile(patient_id) or {}
    patient.update(
        {
            "symptoms": sorted(similarity_service._clean(profile.get("symptoms", []))),
            "diseases": sorted(similarity_service._clean(profile.get("diseases", []))),
            "treatments": sorted(similarity_service._clean(profile.get("treatments", []))),
            "labs": sorted(similarity_service._clean(profile.get("labs", []))),
        }
    )
    return {"data": stamp({"patient": patient}, "cypher-lookup"), "error": None}


@bp.get("/<patient_id>/similar")
def similar(patient_id):
    top_k = parse_positive_int(request.args.get("limit"), "limit", 15)
    result = similarity_service.find_similar_patients(patient_id, top_k=top_k)
    if not similarity_service.get_patient_profile(patient_id):
        return {"data": None, "error": f"Patient '{patient_id}' not found"}, 404
    return {"data": stamp(
        {"similar_patients": result,
         "weights": {"symptom": 0.35, "disease": 0.30, "lab": 0.15, "treatment": 0.20}},
        "deterministic-python-similarity"), "error": None}


@bp.get("/<patient_id>/treatments")
def treatments(patient_id):
    intelligence = treatment_service.get_treatment_intelligence(patient_id)
    if intelligence is None:
        return {"data": None, "error": f"Patient '{patient_id}' not found"}, 404
    return {"data": stamp(intelligence, "deterministic-treatment-ranking"), "error": None}


@bp.get("/<patient_id>/context")
def context(patient_id):
    package = retrieval_service.build_patient_evidence_package(patient_id)
    if package is None:
        return {"data": None, "error": f"Patient '{patient_id}' not found"}, 404
    return {"data": stamp(package, "graphrag-retrieval"), "error": None}
