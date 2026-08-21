"""Global search + chatbot endpoints."""
from flask import Blueprint, request

from chatbot import chatbot_service
from services import retrieval_service
from utils.validation import ValidationError, require_str

bp = Blueprint("search", __name__, url_prefix="/search")


@bp.get("")
def search():
    try:
        q = require_str(request.args.get("q"), "q", max_len=200)
    except ValidationError as exc:
        return {"data": None, "error": str(exc)}, 400
    return {"data": retrieval_service.hybrid_search(q), "error": None}


chat_bp = Blueprint("chatbot", __name__, url_prefix="/chat")


@chat_bp.post("")
def chat():
    body = request.get_json(silent=True) or {}
    try:
        message = require_str(body.get("message"), "message", max_len=500)
    except ValidationError as exc:
        return {"data": None, "error": str(exc)}, 400
    # Chatbot failures must never break the app: degrade gracefully.
    result = chatbot_service.handle_message(message)
    return {"data": result, "error": None}
