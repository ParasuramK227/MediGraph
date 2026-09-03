import os
import tempfile
import uuid

from flask import Blueprint, request, jsonify, current_app

from backend.neo4j_connection import get_session as neo4j_get_session
from scribe import session as sess
from scribe.transcription import transcribe, TranscriptionError
from scribe.extraction import extract, ExtractionError

scribe_bp = Blueprint("scribe", __name__)


def _new_session_id():
    return str(uuid.uuid4())


def _start_upload():
    """Initiate a new consultation session and return its id + upload endpoint."""
    session_id = _new_session_id()
    sess.set_state(session_id, "idle")
    return jsonify({"session_id": session_id})


@scribe_bp.route("/start", methods=["POST"])
def start_session():
    """Create a new consultation session. Returns a session_id used by all
    subsequent scribe endpoints."""
    return _start_upload()


@scribe_bp.route("/upload", methods=["POST"])
def upload_audio():
    """Accept a full audio file upload, transcribe via local Whisper.

    The frontend first calls /start to get a session_id, then uploads the
    audio file as multipart form data with that session_id. On transcription
    failure, the consecutive-failure counter is incremented; after 3 failures
    the response flags that retry should no longer be offered.
    """
    session_id = request.form.get("session_id")
    if not session_id:
        return jsonify({"error": "missing session_id"}), 400

    file = request.files.get("audio")
    if not file:
        file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "missing audio upload"}), 400

    sess.set_state(session_id, "transcribing")

    suffix = os.path.splitext(file.filename)[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=current_app.config.get("UPLOAD_TEMP_DIR") or tempfile.gettempdir(),
            suffix=suffix,
            delete=False,
        ) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        transcript = transcribe(tmp_path)

        # Success — reset failure counter, store transcript for doctor review.
        sess.set_transcript(session_id, transcript, approved=False)
        sess.set_state(session_id, "review")

        return jsonify({
            "session_id": session_id,
            "transcript": transcript,
            "status": "review",
        })
    except TranscriptionError as e:
        failures = sess.record_failure(session_id)
        return jsonify({
            "error": str(e),
            "failure_count": failures,
            "retry_disabled": sess.retry_disabled(session_id),
        }), 422
    except Exception as e:
        failures = sess.record_failure(session_id)
        return jsonify({
            "error": f"Transcription failed: {e}",
            "failure_count": failures,
            "retry_disabled": sess.retry_disabled(session_id),
        }), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@scribe_bp.route("/transcript/<session_id>", methods=["GET"])
def get_transcript(session_id):
    """Retrieve current transcript for a session, plus whether it's been approved."""
    transcript, approved = sess.get_transcript(session_id)
    if transcript is None:
        return jsonify({"error": "no transcript for session"}), 404
    return jsonify({
        "session_id": session_id,
        "transcript": transcript,
        "approved": approved,
        "status": sess.get_state(session_id),
    })


@scribe_bp.route("/transcript/<session_id>", methods=["PUT"])
def edit_transcript(session_id):
    """Store the doctor-edited/approved transcript.

    This endpoint ONLY stores the edit — it never triggers extraction.
    Extraction is an explicit, separate call (/extract/<session_id>).
    """
    data = request.get_json(silent=True) or {}
    transcript = data.get("transcript")
    if not transcript or not isinstance(transcript, str):
        return jsonify({"error": "transcript must be a non-empty string"}), 400

    sess.set_transcript(session_id, transcript, approved=bool(data.get("approved", True)))
    sess.set_state(session_id, "approved" if data.get("approved", True) else "review")

    return jsonify({
        "session_id": session_id,
        "status": sess.get_state(session_id),
        "approved": sess.get_transcript(session_id)[1],
    })


@scribe_bp.route("/extract/<session_id>", methods=["POST"])
def extract_note(session_id):
    """Trigger Groq extraction against the approved transcript for this session.

    Returns 409 if no transcript exists yet, or 400 if the transcript has not
    been explicitly approved — extraction NEVER runs on an unreviewed transcript.
    """
    transcript, approved = sess.get_transcript(session_id)
    if transcript is None:
        return jsonify({"error": "no transcript for session; upload first"}), 409
    if not approved:
        return jsonify({"error": "transcript not approved; doctor must approve before extraction"}), 400

    sess.set_state(session_id, "extracting")
    try:
        note = extract(transcript)
        # Note is staged in the session store until the doctor confirms save.
        sess.set_state(session_id, "extracted")
        return jsonify({
            "session_id": session_id,
            "status": "extracted",
            "note": note,
        })
    except ExtractionError as e:
        sess.set_state(session_id, "extract_error")
        return jsonify({"error": str(e), "status": "extract_error"}), 502


@scribe_bp.route("/save/<session_id>", methods=["POST"])
def save_note(session_id):
    """Persist the structured note into Neo4j as a ConsultationNote node
    attached to the patient, then clear the session state.

    Accepts a patient_id plus the note JSON. Requires that extraction has
    already produced a staged note (status 'extracted').
    """
    data = request.get_json(silent=True) or {}
    patient_id = data.get("patient_id")
    note = data.get("note")

    if not patient_id or not isinstance(patient_id, str):
        return jsonify({"error": "patient_id is required"}), 400
    if not note or not isinstance(note, dict):
        return jsonify({"error": "note must be a JSON object"}), 400

    state = sess.get_state(session_id)
    if state != "extracted":
        return jsonify({"error": f"note not staged for save (state: {state}); run extraction first"}), 409

    summary = note.get("summary", "")
    diagnoses = note.get("diagnoses", []) or []
    action_items = note.get("action_items", []) or []
    meds = note.get("medications_discussed", []) or []

    try:
        with neo4j_get_session() as s:
            result = s.run(
                """
                MATCH (p:Patient {id: $patient_id})
                CREATE (n:ConsultationNote {
                    id: $note_id,
                    summary: $summary,
                    diagnoses: $diagnoses,
                    action_items: $action_items,
                    medications_discussed: $meds,
                    created_at: datetime()
                })
                CREATE (p)-[:HAS_CONSULTATION_NOTE]->(n)
                RETURN n.id AS note_id
                """,
                patient_id=patient_id,
                note_id=str(uuid.uuid4()),
                summary=summary,
                diagnoses=diagnoses,
                action_items=action_items,
                meds=meds,
            )
            record = result.single()
        if record is None:
            # Patient not found — nothing was created.
            return jsonify({"error": f"patient {patient_id} not found"}), 404

        note_id = record["note_id"]

        # Feed diagnoses into Treatment Intelligence (per graph README pattern).
        with neo4j_get_session() as s:
            s.run(
                """
                MATCH (n:ConsultationNote {id: $note_id})
                MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n)
                FOREACH (d in $diagnoses |
                    MERGE (disease:Disease {name: d})
                    CREATE (n)-[:HAS_DIAGNOSIS]->(disease)
                    MERGE (p)-[:RECEIVED_TREATMENT {source: 'consultation', note_id: $note_id}]->(disease)
                )
                """,
                note_id=note_id,
                diagnoses=diagnoses,
            )

        # Session done — clear in-progress state.
        sess.clear(session_id)

        return jsonify({"status": "saved", "note_id": note_id, "patient_id": patient_id}), 201
    except Exception as e:
        sess.set_state(session_id, "save_error")
        return jsonify({"error": f"Failed to save note: {e}"}), 500


@scribe_bp.route("/status/<session_id>", methods=["GET"])
def session_status(session_id):
    """Return current pipeline state: idle, transcribing, review, approved,
    extracting, extracted, extract_error, save_error, saved (or None)."""
    failures = sess.failure_count(session_id)
    return jsonify({
        "session_id": session_id,
        "status": sess.get_state(session_id),
        "failure_count": failures,
        "retry_disabled": sess.retry_disabled(session_id),
    })
