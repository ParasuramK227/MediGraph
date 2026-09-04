import os
import requests
from dotenv import load_dotenv

load_dotenv()

_TRANSLATION_MODEL = "openai/gpt-oss-120b"


class TranscriptionError(Exception):
    """Raised when transcription or token minting fails."""


def get_api_key():
    key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not key:
        raise TranscriptionError("ASSEMBLYAI_API_KEY is not configured in .env.")
    return key


def create_realtime_token(expires_in=480):
    """Generate a temporary WebSocket token from AssemblyAI for live in-browser streaming."""
    api_key = get_api_key()
    try:
        from assemblyai.streaming.v3 import StreamingClient, StreamingClientOptions

        client = StreamingClient(StreamingClientOptions(api_key=api_key))
        token = client.create_temporary_token(expires_in_seconds=expires_in)
        if not token:
            raise TranscriptionError("AssemblyAI response missing temporary token.")
        return token
    except Exception as e:
        if isinstance(e, TranscriptionError):
            raise
        raise TranscriptionError(f"Failed to generate AssemblyAI token: {e}")


def transcribe(audio_file_path):
    """Transcribe an audio file via AssemblyAI REST API."""
    api_key = get_api_key()
    try:
        import assemblyai as aai
        aai.settings.api_key = api_key
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(audio_file_path)

        if transcript.status == aai.TranscriptStatus.error:
            raise TranscriptionError(f"AssemblyAI transcription error: {transcript.error}")

        text = (transcript.text or "").strip()
        if not text:
            raise TranscriptionError("AssemblyAI produced no transcript (silence or unreadable audio).")
        return text
    except Exception as e:
        if isinstance(e, TranscriptionError):
            raise
        raise TranscriptionError(f"AssemblyAI transcription failed: {e}")


def translate_text(text, target_lang="English"):
    """Translate clinical speech/transcript into target language (default English)."""
    if not text or not text.strip():
        return ""

    api_key = os.environ.get("GROQ_API_KEY_EXTRACTION") or os.environ.get("GROQ_API_KEY")
    if not api_key:
        return text

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": _TRANSLATION_MODEL,
                "temperature": 0,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            f"You are a real-time clinical medical translator. Translate the patient or doctor's "
                            f"consultation speech into clear, professional {target_lang}. "
                            f"Preserve medical facts, symptoms, and numbers accurately. "
                            f"Return ONLY the direct {target_lang} translation, with no explanation or introductory text."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
            },
            timeout=15,
        )
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            return content.strip()
        return text
    except Exception:
        return text

