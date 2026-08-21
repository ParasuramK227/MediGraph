"""Admin/data endpoints: seed the graph from synthetic dataset files."""
from flask import Blueprint

bp = Blueprint("admin", __name__, url_prefix="/data")


@bp.post("/seed")
def seed():
    from graph.seed import seed_all

    summary = seed_all()
    return {"data": summary, "error": None}
