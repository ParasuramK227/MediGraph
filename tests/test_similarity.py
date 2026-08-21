"""Unit tests for deterministic similarity math (no database required)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.similarity_service import compute_similarity_score, jaccard  # noqa: E402


def test_jaccard_basic():
    assert jaccard({"a", "b"}, {"a", "b"}) == 1.0
    assert jaccard({"a"}, {"b"}) == 0.0
    assert jaccard(set(), set()) == 0.0
    assert abs(jaccard({"a", "b", "c"}, {"a", "b"}) - 2 / 3) < 1e-9


def test_identical_profiles_score_one():
    profile = {
        "symptoms": ["fever", "cough"],
        "diseases": ["Influenza"],
        "labs": ["CRP|high"],
        "treatments": ["Antiviral Therapy"],
    }
    result = compute_similarity_score(profile, profile)
    assert result["score"] == 1.0
    assert all(v == 1.0 for v in result["breakdown"].values())


def test_disjoint_profiles_score_zero():
    a = {"symptoms": ["fever"], "diseases": ["A"], "labs": [], "treatments": []}
    b = {"symptoms": ["rash"], "diseases": ["B"], "labs": [], "treatments": []}
    assert compute_similarity_score(a, b)["score"] == 0.0


def test_weights_are_applied():
    a = {"symptoms": ["x"], "diseases": [], "labs": [], "treatments": []}
    b = {"symptoms": ["x"], "diseases": [], "labs": [], "treatments": []}
    weights = {"symptom": 1.0, "disease": 0.0, "lab": 0.0, "treatment": 0.0}
    assert compute_similarity_score(a, b, weights)["score"] == 1.0


def test_symptom_weight_dominates_default():
    a = {"symptoms": ["s1", "s2", "s3"], "diseases": ["D1"], "labs": [], "treatments": []}
    b = {"symptoms": ["s1", "s2", "s3"], "diseases": ["D2"], "labs": [], "treatments": []}
    score = compute_similarity_score(a, b)["score"]
    # symptoms identical (0.35) + diseases disjoint -> expect exactly 0.35
    assert abs(score - 0.35) < 1e-9
