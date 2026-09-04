import time

from flask import Blueprint, request, jsonify

from backend.analysis import graph_fetch, treatment_intel
from backend.neo4j_connection import get_session as neo4j_get_session

graph_bp = Blueprint("graph", __name__)

_NODE_TO_KEYS = {
    "Patient": [
        "id", "first_name", "last_name", "gender", "date_of_birth",
        "contact_number", "address", "city", "state", "zip", "income",
        "email", "insurance_provider",
    ],
    "Disease": ["name", "code"],
    "Condition": ["name", "code"],
    "Symptom": ["name"],
    "Treatment": ["id", "treatment_type", "description", "cost", "treatment_date", "outcome", "success"],
    "Procedure": ["id", "treatment_type", "description", "cost", "treatment_date", "outcome", "success"],
    "Medication": [
        "name", "code", "cost", "category", "dosage_form", "strength", "manufacturer",
        "indication", "classification",
    ],
    "Doctor": [
        "id", "name", "first_name", "last_name", "specialization", "years_experience",
        "hospital_branch", "email",
    ],
    "Provider": [
        "id", "name", "first_name", "last_name", "specialization", "years_experience",
        "hospital_branch", "email",
    ],
    "LabTest": ["id", "name", "result", "unit", "reference_range", "status", "date", "category"],
    "Observation": ["id", "name", "result", "unit", "reference_range", "status", "date", "category"],
    "Encounter": ["id", "start", "stop", "encounter_class", "description", "cost", "reason"],
    "Allergy": ["id", "substance", "type", "severity", "start"],
    "ConsultationNote": ["id", "title", "summary"],
}


def _clean_prop_val(v):
    if hasattr(v, "iso_format"):
        return v.iso_format()
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [_clean_prop_val(x) for x in v]
    if isinstance(v, dict):
        return {k: _clean_prop_val(x) for k, x in v.items()}
    return v


def _serialize(graph):
    """Serialize a driver Node/Relationship into a frontend-friendly dict."""
    if graph is None:
        return None

    items = {k: _clean_prop_val(v) for k, v in dict(graph.items()).items()}
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
                    OPTIONAL MATCH (p)-[r_diag:HAS_DIAGNOSIS]->(d:Disease)
                    OPTIONAL MATCH (m:Medication)-[r_med_treats:TREATS]->(d)
                    OPTIONAL MATCH (p)-[r_treat:RECEIVED_TREATMENT]->(t:Treatment)
                    OPTIONAL MATCH (t)-[r_proc_treats:TREATS]->(d)
                    OPTIONAL MATCH (p)-[r_lab:HAS_LAB_TEST]->(l:LabTest)
                    OPTIONAL MATCH (p)-[r_alg:HAS_ALLERGY]->(a:Allergy)
                    OPTIONAL MATCH (doc:Doctor)-[r_doc:TREATS]->(p)
                    OPTIONAL MATCH (p)-[r_note:HAS_CONSULTATION_NOTE]->(n:ConsultationNote)
                    OPTIONAL MATCH (n)-[r_note_diag:MENTIONS_DIAGNOSIS|HAS_DIAGNOSIS]->(d_note:Disease)
                    OPTIONAL MATCH (n)-[r_note_med:DISCUSSES_MEDICATION]->(m_note:Medication)
                    OPTIONAL MATCH (doc_cond:Doctor)-[r_doc_cond:CONDUCTED]->(n)
                    RETURN p,
                           collect(DISTINCT d) AS diseases,
                           collect(DISTINCT r_diag) AS r_diag,
                           collect(DISTINCT m)[0..6] AS meds,
                           collect(DISTINCT r_med_treats) AS r_med_treats,
                           collect(DISTINCT t)[0..6] AS treatments,
                           collect(DISTINCT r_treat)[0..6] AS r_treat,
                           collect(DISTINCT r_proc_treats) AS r_proc_treats,
                           collect(DISTINCT l)[0..6] AS labs,
                           collect(DISTINCT r_lab)[0..6] AS r_labs,
                           collect(DISTINCT a) AS allergies,
                           collect(DISTINCT r_alg) AS r_alg,
                           collect(DISTINCT doc)[0..2] AS doctors,
                           collect(DISTINCT r_doc)[0..2] AS r_doc,
                           collect(DISTINCT n)[0..5] AS notes,
                           collect(DISTINCT r_note)[0..5] AS r_notes,
                           collect(DISTINCT d_note) AS note_diseases,
                           collect(DISTINCT r_note_diag) AS r_note_diags,
                           collect(DISTINCT m_note) AS note_meds,
                           collect(DISTINCT r_note_med) AS r_note_meds,
                           collect(DISTINCT r_doc_cond) AS r_doc_cond
                    """,
                    id=patient_id,
                )
                rec2 = result2.single()
                node_map = {patient["element_id"]: patient}
                edges = []
                if rec2:
                    node_lists = [
                        rec2["diseases"] or [],
                        rec2["meds"] or [],
                        rec2["treatments"] or [],
                        rec2["labs"] or [],
                        rec2["allergies"] or [],
                        rec2["doctors"] or [],
                        rec2["notes"] or [],
                        rec2["note_diseases"] or [],
                        rec2["note_meds"] or [],
                    ]
                    for group in node_lists:
                        for n in group:
                            if n is not None and n.element_id not in node_map:
                                node_map[n.element_id] = _serialize(n)

                    rel_lists = [
                        rec2["r_diag"] or [],
                        rec2["r_med_treats"] or [],
                        rec2["r_treat"] or [],
                        rec2["r_proc_treats"] or [],
                        rec2["r_labs"] or [],
                        rec2["r_alg"] or [],
                        rec2["r_doc"] or [],
                        rec2["r_notes"] or [],
                        rec2["r_note_diags"] or [],
                        rec2["r_note_meds"] or [],
                        rec2["r_doc_cond"] or [],
                    ]
                    for r_group in rel_lists:
                        for r in r_group:
                            if r is not None:
                                s_id = r.start_node.element_id
                                e_id = r.end_node.element_id
                                if s_id in node_map and e_id in node_map:
                                    edges.append({
                                        "start": s_id,
                                        "end": e_id,
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
        return jsonify(_clean_prop_val(data)), 200
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
        return jsonify(_clean_prop_val(data)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@graph_bp.route("/sectors/<path:disease_name>/intelligence", methods=["GET"])
def sector_treatment_intelligence(disease_name):
    """Return cohort-level treatment intelligence for a disease.
    
    Answers 'What is the best treatment for a given disease?':
    - Top indicated pharmacotherapies (medications) with efficacy and cost
    - Top interventional clinical procedures with recovery rates
    - Overall cohort biomarker control rate and monitored metrics
    """
    try:
        # If the parameter has dashes from slugification, replace with spaces
        name_clean = disease_name.replace("-", " ").strip()
        with neo4j_get_session() as s:
            data = treatment_intel.get_disease_treatment_intel(s, name_clean)
        if data is None:
            return jsonify({"error": f"Disease '{disease_name}' not found"}), 404
        return jsonify(_clean_prop_val(data)), 200
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