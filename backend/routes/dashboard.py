"""Dashboard aggregate stats."""
from flask import Blueprint

from services import medicine_service
from services.graph_explore import get_stats, get_trends
from services.provenance_service import stamp

bp = Blueprint("dashboard", __name__)


@bp.get("/dashboard")
def dashboard():
    stats = get_stats()
    trends = get_trends()
    shortages = medicine_service.detect_shortages(limit=10)
    expiring = medicine_service.expiring_batches(90)
    node_types = stats["node_types"]
    payload = {
        "counts": {
            "patients": node_types.get("Patient", 0),
            "diseases": node_types.get("Disease", 0),
            "medications": node_types.get("Medication", 0),
            "hospitals": node_types.get("Hospital", 0),
            "pharmacies": node_types.get("Pharmacy", 0),
            "warehouses": node_types.get("Warehouse", 0),
            "drug_batches": node_types.get("DrugBatch", 0),
        },
        "graph_totals": {
            "nodes": stats["total_nodes"],
            "relationships": stats["total_relationships"],
        },
        "trends": trends,
        "alerts": {
            "out_of_stock": [s for s in shortages if s["status"] == "out"],
            "low_stock": [s for s in shortages if s["status"] == "low"],
            "expiring_batches": expiring,
        },
    }
    return {"data": stamp(payload, "cypher-aggregation"), "error": None}
