import os

_MODEL_NAME = "medium"
_model = None
_model_path = None


def _load_model():
    global _model, _model_path
    import whisper

    path = os.environ.get("WHISPER_MODEL_PATH")
    if _model is None or _model_path != path:
        _model = whisper.load_model(path or _MODEL_NAME)
        _model_path = path
    return _model


def transcribe(audio_file_path):
    """Transcribe a full audio file via local Whisper.

    Returns the raw transcript text. Raises an exception on failure
    (bad audio, silence, corruption, etc.) — the caller is responsible
    for translating that into the retry/manual-entry flow.
    """
    model = _load_model()
    result = model.transcribe(audio_file_path)
    text = (result.get("text") or "").strip()
    if not text:
        raise TranscriptionError("Whisper produced no transcript (silence or unreadable audio).")
    return text


class TranscriptionError(Exception):
    """Raised when transcription fails and the doctor should be offered
    retry vs. manual entry."""
