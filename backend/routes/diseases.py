"""Disease endpoints."""
from flask import Blueprint

from services.graph_service import run_query

bp = Blueprint("diseases", __name__, url_prefix="/diseases")

DISEASE_BY_ID = """
MATCH (d:Disease {id: $id})
OPTIONAL MATCH (d)-[:HAS_SYMPTOM]->(s:Symptom)
OPTIONAL MATCH (d)<-[:HAS_DIAGNOSIS]-(p:Patient)
OPTIONAL MATCH (d)-[:TREATED_BY]->(t:Treatment)
RETURN d.id AS id, d.name AS name, d.category AS category,
       collect(DISTINCT s.name) AS symptoms,
       count(DISTINCT p) AS patient_count,
       collect(DISTINCT t.name) AS treatments
"""


@bp.get("/<disease_id>")
def get_disease(disease_id):
    rows = run_query(DISEASE_BY_ID, {"id": disease_id})
    if not rows or not rows[0].get("name"):
        return {"data": None, "error": f"Disease '{disease_id}' not found"}, 404
    return {"data": rows[0], "error": None}
