"""Tests for treatment outcome aggregation and ranking (pure functions)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.treatment_service import aggregate_outcomes, rank_treatments  # noqa: E402


def _row(tid, tname, outcome, pid):
    return {"treatment_id": tid, "treatment_name": tname, "treatment_type": "pharmacological",
            "outcome": outcome, "duration_days": 30, "patient_id": pid, "effective_for": ["D1"]}


def test_aggregation_counts():
    rows = [
        _row("t1", "Alpha", "success", "p1"),
        _row("t1", "Alpha", "success", "p2"),
        _row("t1", "Alpha", "failure", "p3"),
        _row("t2", "Beta", "partial", "p1"),
    ]
    stats = aggregate_outcomes(rows)
    assert stats["t1"]["cases"] == 3
    assert stats["t1"]["successes"] == 2
    assert stats["t1"]["failures"] == 1
    assert len(stats["t1"]["contributing_patients"]) == 3
    assert stats["t2"]["cases"] == 1


def test_ranking_respects_min_cases():
    rows = [_row("t1", "Alpha", "success", f"p{i}") for i in range(4)]  # below threshold
    ranked = rank_treatments(aggregate_outcomes(rows), min_cases=5)
    assert ranked == []


def test_ranking_orders_by_success_rate():
    rows = (
        [_row("t1", "Alpha", "success", f"p{i}") for i in range(10)]
        + [_row("t1", "Alpha", "failure", "px")]
        + [_row("t2", "Beta", "success", f"q{i}") for i in range(5)]
        + [_row("t2", "Beta", "failure", f"r{i}") for i in range(5)]
    )
    ranked = rank_treatments(aggregate_outcomes(rows), min_cases=5)
    assert ranked[0]["name"] == "Alpha"
    assert ranked[0]["success_rate"] == 90.9 or abs(ranked[0]["success_rate"] - 90.9) < 0.1
    assert ranked[1]["success_rate"] == 50.0


def test_ranking_tie_breaks_by_cases_then_name():
    rows = (
        [_row("b", "Beta", "success", f"p{i}") for i in range(6)]
        + [_row("a", "Alpha", "success", f"q{i}") for i in range(6)]
    )
    ranked = rank_treatments(aggregate_outcomes(rows), min_cases=5)
    # equal rate, equal cases -> alphabetical
    assert [t["name"] for t in ranked] == ["Alpha", "Beta"]
