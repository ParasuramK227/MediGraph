"""Supply-chain + shortage endpoints."""
from flask import Blueprint, request

from services import medicine_service, supply_chain_service
from services.provenance_service import stamp
from utils.validation import parse_positive_int

bp = Blueprint("supply_chain", __name__, url_prefix="/supply-chain")


@bp.get("/batch/<batch_id>")
def trace_batch(batch_id):
    trace = supply_chain_service.trace_batch(batch_id)
    if trace is None:
        return {"data": None, "error": f"Batch '{batch_id}' not found"}, 404
    return {"data": trace, "error": None}


@bp.get("/shortages")
def shortages():
    limit = parse_positive_int(request.args.get("limit"), "limit", 50)
    items = medicine_service.detect_shortages(limit=limit)
    out = [s for s in items if s["status"] == "out"]
    low = [s for s in items if s["status"] == "low"]
    return {"data": stamp(
        {"shortages": items, "out_of_stock_count": len(out), "low_stock_count": len(low)},
        "deterministic-shortage-detection"), "error": None}
