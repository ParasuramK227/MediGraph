"""Deterministic geographic helpers."""
import math


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def rank_by_distance(origin: dict, facilities: list[dict]) -> list[dict]:
    """Sort facilities by distance from an origin {latitude, longitude}.

    Each facility gains a `distance_km` property; nearest first.
    """
    ranked = []
    for facility in facilities:
        distance = haversine_km(
            origin["latitude"],
            origin["longitude"],
            facility["latitude"],
            facility["longitude"],
        )
        entry = dict(facility)
        entry["distance_km"] = round(distance, 2)
        ranked.append(entry)
    ranked.sort(key=lambda f: (f["distance_km"], -(f.get("quantity") or 0)))
    return ranked
