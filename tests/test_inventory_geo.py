"""Tests for inventory aggregation, stock classification and geo math."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.medicine_service import aggregate_availability, classify_stock  # noqa: E402
from utils.geo import haversine_km, rank_by_distance  # noqa: E402


def test_classify_stock_thresholds():
    assert classify_stock(0) == "out"
    assert classify_stock(None) == "out"
    assert classify_stock(5, threshold=20) == "low"
    assert classify_stock(19, threshold=20) == "low"
    assert classify_stock(20, threshold=20) == "ok"
    assert classify_stock(500, threshold=20) == "ok"
    # network-scale default threshold
    assert classify_stock(100) == "low"
    assert classify_stock(150) == "ok"


def test_aggregate_availability_totals_and_sorting():
    retail = [
        {"facility_id": "h1", "facility_name": "Hosp A", "facility_type": "Hospital",
         "quantity": 10, "expiry_date": None, "last_updated": None},
        {"facility_id": "p1", "facility_name": "Pharm B", "facility_type": "Pharmacy",
         "quantity": 40, "expiry_date": None, "last_updated": None},
    ]
    warehouse = [
        {"facility_id": "w1", "facility_name": "WH C", "facility_type": "Warehouse",
         "quantity": 100, "expiry_date": None, "last_updated": None, "batch_ids": ["B1"]},
    ]
    summary = aggregate_availability(retail, warehouse)
    assert summary["total_quantity"] == 150
    assert summary["status"] == "ok"
    assert summary["facilities"][0]["facility_name"] == "WH C"  # sorted desc by qty
    assert summary["hospital_count"] == 1 and summary["warehouse_count"] == 1


def test_haversine_known_distance():
    # Chennai -> Bengaluru is roughly 290 km
    d = haversine_km(13.0827, 80.2707, 12.9716, 77.5946)
    assert 270 < d < 310


def test_haversine_zero():
    assert haversine_km(10, 10, 10, 10) == 0.0


def test_rank_by_distance_nearest_first_with_stock_tiebreak():
    origin = {"latitude": 13.0827, "longitude": 80.2707}
    facilities = [
        {"name": "Far", "latitude": 12.9716, "longitude": 77.5946, "quantity": 50},
        {"name": "Near", "latitude": 13.09, "longitude": 80.28, "quantity": 5},
        {"name": "Near2", "latitude": 13.09, "longitude": 80.28, "quantity": 9},
    ]
    ranked = rank_by_distance(origin, facilities)
    assert [f["name"] for f in ranked][:3] == ["Near2", "Near", "Far"]
    assert all("distance_km" in f for f in ranked)
