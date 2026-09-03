import threading
import time

SESSION_TTL = 3600  # 1 hour; in-progress consultation sessions don't persist forever
MAX_CONSECUTIVE_FAILURES = 3

_PREFIX = "scribe:session:"

# In-memory session store (dict) with per-key expiry timestamps.
# This is a single-user demo — an in-process store is deliberately used over
# Redis or an external cache. Each key maps to (expires_at, value).
_store = {}
_lock = threading.Lock()


def _now():
    return time.time()


def _key(session_id, field):
    return f"{_PREFIX}{session_id}:{field}"


def _transcript_key(session_id):
    return _key(session_id, "transcript")


def _approved_key(session_id):
    return _key(session_id, "approved")


def _failure_key(session_id):
    return _key(session_id, "failures")


def _state_key(session_id):
    return _key(session_id, "state")


def _set(key, value, ttl=SESSION_TTL):
    expires_at = _now() + ttl
    with _lock:
        _store[key] = (expires_at, value)


def _get(key):
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < _now():
            del _store[key]
            return None
        return value


def _delete(*keys):
    with _lock:
        for key in keys:
            _store.pop(key, None)


def set_transcript(session_id, transcript, approved=False):
    """Store (or overwrite) the transcript for a session.

    Extraction must never be triggered by storing a transcript; the
    'approved' flag only marks it ready for the explicit extract call.
    """
    _set(_transcript_key(session_id), transcript)
    _set(_approved_key(session_id), "1" if approved else "0")
    _set(_state_key(session_id), "review")


def get_transcript(session_id):
    """Return (transcript, is_approved) for a session, or (None, False) if none."""
    transcript = _get(_transcript_key(session_id))
    approved = _get(_approved_key(session_id) or "") == "1"
    return transcript, approved


def record_failure(session_id):
    """Increment the consecutive-failure counter. Returns the new count."""
    count = int(_get(_failure_key(session_id)) or 0) + 1
    _set(_failure_key(session_id), str(count))
    return count


def failure_count(session_id):
    val = _get(_failure_key(session_id))
    return int(val) if val is not None else 0


def retry_disabled(session_id):
    """Retry is no longer offered after 3 consecutive failures."""
    return failure_count(session_id) >= MAX_CONSECUTIVE_FAILURES


def set_state(session_id, state):
    _set(_state_key(session_id), state)


def get_state(session_id):
    return _get(_state_key(session_id))


def clear(session_id):
    """Remove all session state (called once the note is saved)."""
    _delete(
        _transcript_key(session_id),
        _approved_key(session_id),
        _failure_key(session_id),
        _state_key(session_id),
    )