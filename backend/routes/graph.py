import time

from flask import Blueprint, request, jsonify

from backend.analysis import graph_fetch
from backend.neo4j_connection import get_session as neo4j_get_session

graph_bp = Blueprint("graph", __name__)

_NODE_TO_KEYS = {
    "Patient": [
        "id", "first_name", "last_name", "gender", "date_of_birth",
        "contact_number", "address", "email", "insurance_provider",
    ],
    "Disease": ["name"],
    "Symptom": ["name"],
    "Treatment": ["id", "treatment_type", "description", "cost", "treatment_date"],
    "Medication": [
        "name", "category", "dosage_form", "strength", "manufacturer",
        "indication", "classification",
    ],
    "Doctor": [
        "id", "first_name", "last_name", "specialization", "years_experience",
        "hospital_branch", "email",
    ],
    "LabTest": ["id", "name", "result", "unit", "reference_range", "status", "date"],
    "ConsultationNote": ["id", "title", "summary"],
}


def _serialize(graph):
    """Serialize a driver Node/Relationship into a frontend-friendly dict."""
    if graph is None:
        return None

    items = dict(graph.items())
    labels = list(graph.labels) if hasattr(graph, "labels") else None
    type_ = graph.type if hasattr(graph, "type") else None

    node = {
        "properties": items,
        "labels": labels,
        "element_id": graph.element_id,
    }
    return node


@graph_bp.route("/patients", methods=["GET"])
def list_patients():
    """List all patients."""
    try:
        with neo4j_get_session() as s:
            result = s.run(
                """
                MATCH (p:Patient)
                RETURN p ORDER BY p.first_name, p.last_name
                """
            )
            patients = [_serialize(rec["p"]) for rec in result if rec["p"] is not None]
        return jsonify(patients), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/patients/<patient_id>", methods=["GET"])
def get_patient(patient_id):
    """Get a single patient by ID, with optionally scoped graph neighbors."""
    include_graph = request.args.get("with_graph") == "1"
    try:
        with neo4j_get_session() as s:
            result = s.run(
                """
                MATCH (p:Patient {id: $id})
                RETURN p
                """,
                id=patient_id,
            )
            rec = result.single()
            if rec is None or rec["p"] is None:
                return jsonify({"error": f"patient {patient_id} not found"}), 404
            patient = _serialize(rec["p"])

            graph_data = {"nodes": [], "relationships": []}
            if include_graph:
                result2 = s.run(
                    """
                    MATCH (p:Patient {id: $id})
                    OPTIONAL MATCH (p)-[r]-(n)
                    RETURN n, r
                    """,
                    id=patient_id,
                )
                node_map = {}
                edges = []
                # seed with the patient itself
                node_map[patient["element_id"]] = patient
                for rec2 in result2:
                    n = rec2["n"]
                    r = rec2["r"]
                    if n is not None and n.element_id not in node_map:
                        node_map[n.element_id] = _serialize(n)
                    if r is not None:
                        edges.append({
                            "start": r.start_node.element_id,
                            "end": r.end_node.element_id,
                            "type": r.type,
                        })
                graph_data = {
                    "nodes": list(node_map.values()),
                    "relationships": edges,
                }
            return jsonify({
                "patient": patient,
                "graph": graph_data if include_graph else None,
            }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/patients", methods=["POST"])
def create_patient():
    """Create a new patient node (fields other than id are optional)."""
    data = request.get_json(silent=True) or {}
    pid = data.get("id")
    if not pid or not isinstance(pid, str):
        return jsonify({"error": "patient id is required"}), 400
    props = {k: data.get(k) for k in _NODE_TO_KEYS["Patient"] if k in data and data.get(k) is not None}
    props["id"] = pid
    try:
        with neo4j_get_session() as s:
            result = s.run(
                "MERGE (p:Patient {id: $id}) SET p += $props RETURN p",
                id=pid,
                props=props,
            )
            rec = result.single()
        return jsonify(_serialize(rec["p"])), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/patients/<patient_id>", methods=["PUT"])
def update_patient(patient_id):
    """Update an existing patient node."""
    data = request.get_json(silent=True) or {}
    props = {k: data[k] for k in data if k in _NODE_TO_KEYS["Patient"] or k == "id"}
    if "id" in props:
        props.pop("id")
    if not props:
        return jsonify({"error": "no updatable fields provided"}), 400
    try:
        with neo4j_get_session() as s:
            result = s.run(
                "MATCH (p:Patient {id: $id}) SET p += $props RETURN p",
                id=patient_id,
                props=props,
            )
            rec = result.single()
            if rec is None:
                return jsonify({"error": f"patient {patient_id} not found"}), 404
        return jsonify(_serialize(rec["p"])), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/patients/<patient_id>", methods=["DELETE"])
def delete_patient(patient_id):
    """Delete a patient node and its relationships."""
    try:
        with neo4j_get_session() as s:
            result = s.run(
                "MATCH (p:Patient {id: $id}) DETACH DELETE p RETURN count(p) AS n",
                id=patient_id,
            )
            rec = result.single()
            if rec is None or rec["n"] == 0:
                return jsonify({"error": f"patient {patient_id} not found"}), 404
        return jsonify({"deleted": True, "id": patient_id}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/patients/<patient_id>/intelligence", methods=["GET"])
def patient_intelligence(patient_id):
    """Enriched patient view: summary, medical history, similar patients.

    All derived data is computed deterministically in python (no LLM).
    """
    try:
        with neo4j_get_session() as s:
            data = graph_fetch.get_patient_intelligence(s, patient_id)
        if data is None:
            return jsonify({"error": f"patient {patient_id} not found"}), 404
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/patients/<patient_id>/treatment-intel", methods=["GET"])
def patient_treatment_intel(patient_id):
    """Per-patient ranked diagnoses (1..N by success likelihood).

    Scoring is deterministic python (lab-normalized outcome among similar
    patients sharing each diagnosis); no LLM involved.
    """
    try:
        with neo4j_get_session() as s:
            data = graph_fetch.get_treatment_intel(s, patient_id)
        if data is None:
            return jsonify({"error": f"patient {patient_id} not found"}), 404
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/schema", methods=["GET"])
def schema():
    """Return DB meta for the admin panel: node labels + counts, relationship
    types + counts, property keys, and a 'last update' timestamp."""
    try:
        with neo4j_get_session() as s:
            node_result = s.run(
                "MATCH (n) WITH labels(n) AS l UNWIND l AS label "
                "WITH label, count(*) AS count RETURN label, count ORDER BY count DESC"
            )
            nodes = [{"label": rec["label"], "count": rec["count"]} for rec in node_result]

            rel_result = s.run(
                "MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count "
                "ORDER BY count DESC"
            )
            rels = [{"type": rec["type"], "count": rec["count"]} for rec in rel_result]

            prop_result = s.run(
                "MATCH (n) UNWIND keys(n) AS k WITH DISTINCT k AS key ORDER BY key RETURN key"
            )
            prop_keys = [rec["key"] for rec in prop_result]

        import datetime
        last_update = datetime.datetime.now(datetime.timezone.utc).isoformat()
        node_count = sum(n["count"] for n in nodes)
        rel_count = sum(r["count"] for r in rels)
        return jsonify({
            "labels": nodes,
            "relationships": rels,
            "property_keys": prop_keys,
            "node_count": node_count,
            "relationship_count": rel_count,
            "last_update": last_update,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/cypher", methods=["POST"])
def cypher_passthrough():
    """Run an arbitrary read-only Cypher query against AuraDB.

    Body: {"query": "...", "params": {...}}
    Returns columns, rows (values serialized), and timing metadata for the
    admin graph panel (Graph/Table/RAW tabs + "started streaming..." footer).
    """
    data = request.get_json(silent=True) or {}
    query = data.get("query") or data.get("cypher")
    params = data.get("params") or {}
    if not query or not isinstance(query, str):
        return jsonify({"error": "query is required"}), 400

    start = time.perf_counter()
    try:
        with neo4j_get_session() as s:
            result = s.run(query, **params)
            keys = None
            rows = []
            for rec in result:
                rec_vals = []
                for i, key in enumerate(rec.keys()):
                    if keys is None:
                        keys = list(rec.keys())
                    rec_vals.append(_serialize_value(rec[i]))
                rows.append(rec_vals)
            keys = keys or []
        elapsed_ms = (time.perf_counter() - start) * 1000
        return jsonify({
            "columns": keys,
            "rows": rows,
            "timing": {"elapsed_ms": round(elapsed_ms, 1)},
            "row_count": len(rows),
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


def _serialize_value(value):
    """Convert a Neo4j driver value into JSON-friendly primitives."""
    if value is None:
        return None

    # Nodes
    if hasattr(value, "element_id") and hasattr(value, "labels"):
        return {
            "_type": "node",
            "_labels": list(value.labels),
            "element_id": value.element_id,
            "properties": {k: _serialize_value(v) for k, v in value.items()},
        }
    # Relationships
    if hasattr(value, "type") and hasattr(value, "start_node"):
        return {
            "_type": "relationship",
            "_rel_type": value.type,
            "_start": value.start_node.element_id,
            "_end": value.end_node.element_id,
        }
    # Rich temporal/spatial types
    try:
        import datetime
        if hasattr(value, "isoformat"):
            return value.isoformat()
    except Exception:
        pass

    if isinstance(value, (list, tuple)):
        return [_serialize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    return value