"""Application configuration loaded from environment variables (.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")


def _get(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


NEO4J_URI = _get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USERNAME = _get("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = _get("NEO4J_PASSWORD", "medigraph")

GROQ_API_KEY = _get("GROQ_API_KEY", "")
GROQ_MODEL = _get("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_BASE_URL = _get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# Deterministic patient-similarity weights (must sum to 1.0).
SIMILARITY_WEIGHTS = {
    "symptom": 0.35,
    "disease": 0.30,
    "lab": 0.15,
    "treatment": 0.20,
}

SIMILAR_MIN_SCORE = 0.05
SIMILAR_TOP_K = 25

TREATMENT_MIN_CASES = 4
TREATMENT_TOP_K = 10

SHORTAGE_LOW_STOCK_THRESHOLD = 150
EXPIRY_WARNING_DAYS = 90

DATA_DIR = BASE_DIR / "data"
SYNTHETIC_DIR = DATA_DIR / "synthetic"

FLASK_HOST = _get("FLASK_HOST", "127.0.0.1")
FLASK_PORT = int(_get("FLASK_PORT", "5000"))
