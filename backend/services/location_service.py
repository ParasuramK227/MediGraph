"""Location-aware medicine search: nearest facilities with valid stock.

Python performs the Haversine distance calculation and ranking.
"""
from __future__ import annotations

from services import medicine_service
from services.graph_service import run_query
from utils.geo import rank_by_distance

MEDICATION_LOOKUP_QUERY = """
MATCH (m:Medication)
WHERE m.id = $q OR toLower(m.name) = toLower($q)
   OR toLower(m.generic_name) = toLower($q)
   OR toLower(m.name) CONTAINS toLower($q)
RETURN m.id AS id, m.name AS name
ORDER BY CASE WHEN m.id = $q THEN 0
              WHEN toLower(m.name) = toLower($q) THEN 1
              ELSE 2 END, m.name
LIMIT 1
"""

CITY_LOOKUP_QUERY = """
MATCH (f) WHERE (f:Hospital OR f:Pharmacy OR f:Warehouse) AND toLower(f.city) = toLower($city)
RETURN f.latitude AS latitude, f.longitude AS longitude LIMIT 1
"""


def resolve_medication(query: str) -> dict | None:
    rows = run_query(MEDICATION_LOOKUP_QUERY, {"q": query})
    return rows[0] if rows else None


def resolve_location(city: str) -> dict | None:
    rows = run_query(CITY_LOOKUP_QUERY, {"city": city})
    return rows[0] if rows else None


def find_nearby_medicine(medicine_query: str, latitude: float, longitude: float,
                         radius_km: float | None = None) -> dict | None:
    """Rank facilities stocking `medicine_query` by distance from (lat, lng)."""
    medication = resolve_medication(medicine_query)
    if medication is None:
        return None

    availability = medicine_service.get_availability(medication["id"])
    stocked = [
        f for f in availability["facilities"]
        if f["quantity"] > 0 and f.get("latitude") is not None
    ]
    origin = {"latitude": latitude, "longitude": longitude}
    ranked = rank_by_distance(origin, stocked)

    if radius_km is not None:
        ranked = [f for f in ranked if f["distance_km"] <= radius_km]

    return {
        "medicine": medication,
        "origin": {"latitude": latitude, "longitude": longitude},
        "radius_km": radius_km,
        "results": ranked,
        "nearest": ranked[0] if ranked else None,
        "method": "haversine-python",
    }
