"""Medicine endpoints: search, availability, supply chain, alternatives, nearby."""
from flask import Blueprint, request

from services import location_service, medicine_service, supply_chain_service
from services.provenance_service import stamp
from utils.geo import haversine_km
from utils.validation import ValidationError, parse_float, parse_positive_int, require_str

bp = Blueprint("medicines", __name__, url_prefix="/medicines")


@bp.get("")
def list_medicines():
    q = request.args.get("q", "").strip() or None
    limit = parse_positive_int(request.args.get("limit"), "limit", 50)
    meds = medicine_service.search_medications(q, limit)
    for med in meds:
        med["id"] = med["id"]
    return {"data": {"medications": meds}, "error": None}


@bp.get("/<medication_id>")
def get_medicine(medication_id):
    med = medicine_service.get_medication(medication_id)
    if med is None:
        return {"data": None, "error": f"Medicine '{medication_id}' not found"}, 404
    return {"data": med, "error": None}


@bp.get("/<medication_id>/availability")
def availability(medication_id):
    result = medicine_service.get_availability(medication_id)
    if result is None:
        return {"data": None, "error": f"Medicine '{medication_id}' not found"}, 404
    return {"data": result, "error": None}


@bp.get("/<medication_id>/supply-chain")
def supply_chain(medication_id):
    trace = supply_chain_service.trace_supply_chain(medication_id)
    if trace is None:
        batch_fallback = _trace_any_batch(medication_id)
        if batch_fallback is None:
            return {"data": None, "error": f"No supply chain found for '{medication_id}'"}, 404
        trace = batch_fallback
    return {"data": trace, "error": None}


@bp.get("/<medication_id>/alternatives")
def alternatives(medication_id):
    if medicine_service.get_medication(medication_id) is None:
        return {"data": None, "error": f"Medicine '{medication_id}' not found"}, 404
    alts = medicine_service.find_alternative_medicines(medication_id)
    return {"data": {"alternatives": alts}, "error": None}


@bp.get("/nearby")
def nearby():
    try:
        medicine = require_str(request.args.get("medicine"), "medicine")
        lat = parse_float(request.args.get("lat"), "lat")
        lng = parse_float(request.args.get("lng"), "lng")
        radius = request.args.get("radius_km")
        radius = parse_float(radius, "radius_km") if radius else None
    except ValidationError as exc:
        return {"data": None, "error": str(exc)}, 400
    result = location_service.find_nearby_medicine(medicine, lat, lng, radius)
    if result is None:
        return {"data": None, "error": f"No medicine matching '{medicine}' was found"}, 404
    return {"data": result, "error": None}


def _trace_any_batch(medication_id):
    from services.graph_service import run_query

    rows = run_query(
        """
        MATCH (m:Medication {id: $mid})-[:HAS_BATCH]->(b:DrugBatch)
        RETURN b.id AS bid ORDER BY b.expiry_date DESC LIMIT 1
        """,
        {"mid": medication_id},
    )
    if not rows:
        return None
    return supply_chain_service.trace_batch(rows[0]["bid"])
