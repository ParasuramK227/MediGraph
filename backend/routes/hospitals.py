"""Hospital / pharmacy / warehouse endpoints."""
from flask import Blueprint, request

from services import supply_chain_service
from services.graph_service import run_query
from utils.validation import ValidationError, require_str

bp = Blueprint("hospitals", __name__, url_prefix="/hospitals")

FACILITIES_QUERY = """
MATCH (f)
WHERE f:Hospital OR f:Pharmacy OR f:Warehouse
RETURN f.id AS id, f.name AS name, head(labels(f)) AS type,
       f.city AS city, f.latitude AS latitude, f.longitude AS longitude
ORDER BY type, name
"""


@bp.get("")
def list_hospitals():
    rows = run_query(FACILITIES_QUERY)
    return {"data": {"facilities": rows}, "error": None}


@bp.get("/<facility_id>/inventory")
def inventory(facility_id):
    try:
        facility_id = require_str(facility_id, "facility_id")
    except ValidationError as exc:
        return {"data": None, "error": str(exc)}, 400
    exists = run_query(
        "MATCH (f) WHERE (f:Hospital OR f:Pharmacy OR f:Warehouse) AND f.id = $id RETURN f.name AS name",
        {"id": facility_id},
    )
    if not exists:
        return {"data": None, "error": f"Facility '{facility_id}' not found"}, 404
    items = supply_chain_service.get_hospital_inventory(facility_id)
    return {"data": {"facility_id": facility_id, "facility_name": exists[0]["name"],
                     "inventory": items}, "error": None}
