from flask import Blueprint, request, jsonify

from backend.neo4j_connection import get_session as neo4j_get_session

import os
import requests

MODEL = "openai/gpt-oss-120b"

chat_bp = Blueprint("chat", __name__)

_SYSTEM_PROMPT = (
    "You are MediGraph, a helpful clinical-intelligence assistant for a doctor's "
    "consultation notes. Answer the user's question using ONLY the consultation "
    "notes provided in the context below. Do not invent facts, medications, or "
    "diagnoses that are not present in the given notes. If the notes do not "
    "contain enough detail, say so clearly and keep the answer factual. "
    "Be concise (2-4 short sentences). When it is useful, reference the relevant "
    "patient and consultation date."
)


def _note_to_block(note):
    """Serialize a ConsultationNote record into a readable text block for context."""
    diagnoses = ", ".join(note.get("diagnoses") or []) or "n/a"
    action_items = "; ".join(note.get("action_items") or []) or "n/a"
    medications = ", ".join(note.get("medications_discussed") or []) or "n/a"
    created = str(note.get("created_at", "")).split(".")[0]
    return (
        f"- Patient: {note.get('patient_name', note.get('patient_id', '?'))} "
        f"(id {note.get('patient_id', '?')}) | date: {created}\n"
        f"  Summary: {note.get('summary', '')}\n"
        f"  Diagnoses: {diagnoses}\n"
        f"  Medications discussed: {medications}\n"
        f"  Action items: {action_items}"
    )


def _fetch_notes(patient_id=None, limit=12):
    """Pull the most recent ConsultationNotes, optionally for a single patient."""
    extra_match = "MATCH (p:Patient {id: $patient_id})-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote)" \
        if patient_id else \
        "MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote)"

    query = (
        f"{extra_match}\n"
        "RETURN n.id AS note_id,\n"
        "       p.id AS patient_id,\n"
        "       coalesce(p.first_name + ' ' + p.last_name, p.id) AS patient_name,\n"
        "       n.summary AS summary,\n"
        "       n.diagnoses AS diagnoses,\n"
        "       n.action_items AS action_items,\n"
        "       n.medications_discussed AS medications_discussed,\n"
        "       n.created_at AS created_at\n"
        "ORDER BY n.created_at DESC\n"
        f"LIMIT {int(limit)}"
    )
    params = {"patient_id": patient_id} if patient_id else {}

    with neo4j_get_session() as s:
        records = list(s.run(query, **params))

    notes = []
    for rec in records:
        item = {
            "patient_id": rec.get("patient_id"),
            "patient_name": rec.get("patient_name"),
            "summary": rec.get("summary") or "",
            "diagnoses": rec.get("diagnoses") or [],
            "action_items": rec.get("action_items") or [],
            "medications_discussed": rec.get("medications_discussed") or [],
            "created_at": str(rec.get("created_at") or ""),
        }
        # Trim copy of list props to keep context small.
        item["diagnoses"] = item["diagnoses"][:6]
        item["action_items"] = item["action_items"][:6]
        item["medications_discussed"] = item["medications_discussed"][:6]
        notes.append(item)
    return notes


@chat_bp.route("/query", methods=["POST"])
def chat_query():
    """Accept a natural-language question grounded in consultation notes.

    Body: {"message": string, "patient_id"?: string}
    Returns {"answer": string, "candidate_count": int, "source_count": int}
    """
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    patient_id = data.get("patient_id")

    if not message:
        return jsonify({"error": "message is required"}), 400
    if patient_id is not None and not isinstance(patient_id, str):
        return jsonify({"error": "patient_id must be a string"}), 400

    try:
        notes = _fetch_notes(patient_id=patient_id)
    except Exception as e:
        return jsonify({"error": f"Could not read consultation notes: {e}"}), 500

    if not notes:
        return jsonify({
            "answer": "I don't have any consultation notes to answer from yet.",
            "candidate_count": 0,
            "source_count": 0,
        })

    context = "\n\n".join(_note_to_block(n) for n in notes)

    api_key = os.environ.get("GROQ_API_KEY_CHATBOT") or os.environ.get("GROQ_API_KEY")
    if not api_key:
        # Offline fallback: answer directly from the notes without an LLM.
        summary_lines = "\n".join(
            f"- {n.get('patient_name')}: {n.get('summary')}" for n in notes
        )
        return jsonify({
            "answer": (
                f"(No chatbot key configured — showing notes directly.)\n{summary_lines}"
            ),
            "candidate_count": len(notes),
            "source_count": len(notes),
        })

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"Consultation notes:\n\n{context}\n\n"
                            f"Question: {message}"
                        ),
                    },
                ],
            },
            timeout=90,
        )
        resp.raise_for_status()
        answer = resp.json()["choices"][0]["message"]["content"].strip()
    except requests.RequestException as e:
        return jsonify({"error": f"Chatbot failed: {e}"}), 502

    return jsonify({
        "answer": answer,
        "candidate_count": len(notes),
        "source_count": len(notes),
    })