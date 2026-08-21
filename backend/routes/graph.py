"""Knowledge Graph explorer endpoints."""
from flask import Blueprint, request

from services import graph_explore
from utils.validation import ValidationError, parse_positive_int, require_str

bp = Blueprint("graph", __name__, url_prefix="/graph")


@bp.get("/search")
def search():
    try:
        q = require_str(request.args.get("q"), "q", max_len=100)
    except ValidationError as exc:
        return {"data": None, "error": str(exc)}, 400
    types = [t.strip() for t in request.args.get("types", "").split(",") if t.strip()]
    limit = parse_positive_int(request.args.get("limit"), "limit", 20)
    results = graph_explore.search_entities(q, types or None, limit)
    return {"data": {"query": q, "entities": results}, "error": None}


@bp.get("/schema")
def schema():
    return {"data": graph_explore.get_schema(), "error": None}


@bp.get("/stats")
def stats():
    return {"data": graph_explore.get_stats(), "error": None}


@bp.get("/relationships")
def relationships():
    schema_data = graph_explore.get_schema()
    return {"data": {"relationship_types": schema_data["relationship_types"]}, "error": None}


@bp.get("/entity/<entity_id>")
def entity(entity_id):
    result = graph_explore.get_entity(entity_id)
    if result is None:
        return {"data": None, "error": f"Entity '{entity_id}' not found"}, 404
    return {"data": result, "error": None}


@bp.get("/entity/<entity_id>/neighbors")
def neighbors(entity_id):
    if graph_explore.get_entity(entity_id) is None:
        return {"data": None, "error": f"Entity '{entity_id}' not found"}, 404
    return {"data": graph_explore.get_neighbors(entity_id), "error": None}


@bp.get("/entity/<entity_id>/subgraph")
def subgraph(entity_id):
    depth = parse_positive_int(request.args.get("depth"), "depth", 1, maximum=2)
    if graph_explore.get_entity(entity_id) is None:
        return {"data": None, "error": f"Entity '{entity_id}' not found"}, 404
    return {"data": graph_explore.get_subgraph(entity_id, depth), "error": None}
