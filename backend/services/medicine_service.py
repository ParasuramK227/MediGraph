"""Medicine availability, shortage detection and alternatives.

Deterministic inventory logic: expired stock is always ignored.
Stock model:
  (Hospital|Pharmacy)-[:HAS_INVENTORY {quantity, expiry_date}]->(Medication)
  (DrugBatch)-[:STORED_AT {quantity}]->(Warehouse), (Medication)-[:HAS_BATCH]->(DrugBatch)
"""
from __future__ import annotations

from datetime import date

from config import SHORTAGE_LOW_STOCK_THRESHOLD
from services.graph_service import run_query

RETAIL_AVAILABILITY_QUERY = """
MATCH (f)-[inv:HAS_INVENTORY]->(m:Medication {id: $mid})
WHERE (f:Hospital OR f:Pharmacy) AND inv.expiry_date >= date()
RETURN f.id AS facility_id, f.name AS facility_name,
       head(labels(f)) AS facility_type,
       inv.quantity AS quantity, inv.expiry_date AS expiry_date,
       inv.last_updated AS last_updated,
       f.latitude AS latitude, f.longitude AS longitude
ORDER BY inv.quantity DESC
"""

WAREHOUSE_AVAILABILITY_QUERY = """
MATCH (m:Medication {id: $mid})-[:HAS_BATCH]->(b:DrugBatch)-[st:STORED_AT]->(w:Warehouse)
WHERE b.expiry_date >= date()
RETURN w.id AS facility_id, w.name AS facility_name, 'Warehouse' AS facility_type,
       sum(st.quantity) AS quantity, min(b.expiry_date) AS expiry_date,
       collect(b.id)[..5] AS batch_ids,
       w.latitude AS latitude, w.longitude AS longitude
ORDER BY quantity DESC
"""

MEDICATION_BY_ID = """
MATCH (m:Medication {id: $id})
OPTIONAL MATCH (m)-[:MANUFACTURED_BY]->(man:Manufacturer)
RETURN m.id AS id, m.name AS name, m.generic_name AS generic_name,
       m.form AS form, m.strength AS strength, m.category AS category,
       collect(DISTINCT man.name) AS manufacturers
"""

ALL_MEDICATIONS = """
MATCH (m:Medication)
WHERE $q IS NULL OR toLower(m.name) CONTAINS toLower($q)
       OR toLower(m.generic_name) CONTAINS toLower($q)
RETURN m.id AS id, m.name AS name, m.generic_name AS generic_name,
       m.form AS form, m.strength AS strength, m.category AS category
ORDER BY m.name LIMIT $limit
"""

SHORTAGE_AGGREGATE_QUERY = """
MATCH (m:Medication)
CALL {
    WITH m
    OPTIONAL MATCH (f)-[inv:HAS_INVENTORY]->(m)
    WHERE (f:Hospital OR f:Pharmacy) AND inv.expiry_date >= date()
    RETURN sum(inv.quantity) AS retail_stock
}
CALL {
    WITH m
    OPTIONAL MATCH (m)-[:HAS_BATCH]->(b:DrugBatch)-[st:STORED_AT]->(w:Warehouse)
    WHERE b.expiry_date >= date()
    RETURN sum(st.quantity) AS warehouse_stock
}
RETURN m.id AS id, m.name AS name, m.category AS category,
       toInteger(retail_stock) AS retail_stock,
       toInteger(warehouse_stock) AS warehouse_stock,
       toInteger(retail_stock + warehouse_stock) AS total_stock
"""

ALTERNATIVES_QUERY = """
MATCH (m:Medication {id: $mid})-[:ALTERNATIVE_TO]-(alt:Medication)
RETURN DISTINCT alt.id AS id, alt.name AS name, alt.generic_name AS generic_name,
       alt.strength AS strength
"""


def classify_stock(total_quantity: float | None,
                   threshold: int = SHORTAGE_LOW_STOCK_THRESHOLD) -> str:
    """Pure classification: 'out' / 'low' / 'ok'."""
    total = total_quantity or 0
    if total <= 0:
        return "out"
    if total < threshold:
        return "low"
    return "ok"


def aggregate_availability(retail_rows: list[dict], warehouse_rows: list[dict]) -> dict:
    """Combine retail + warehouse rows into an availability summary. Pure."""
    facilities = []
    for row in retail_rows + warehouse_rows:
        facilities.append(
            {
                "facility_id": row["facility_id"],
                "facility_name": row["facility_name"],
                "facility_type": row["facility_type"],
                "quantity": int(row["quantity"] or 0),
                "expiry_date": _iso(row.get("expiry_date")),
                "last_updated": _iso(row.get("last_updated")),
                "batch_ids": row.get("batch_ids") or [],
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
            }
        )
    facilities.sort(key=lambda f: (-f["quantity"], f["facility_name"]))
    total = sum(f["quantity"] for f in facilities)
    return {
        "facilities": facilities,
        "total_quantity": total,
        "status": classify_stock(total),
        "hospital_count": sum(1 for f in facilities if f["facility_type"] == "Hospital"),
        "pharmacy_count": sum(1 for f in facilities if f["facility_type"] == "Pharmacy"),
        "warehouse_count": sum(1 for f in facilities if f["facility_type"] == "Warehouse"),
    }


def get_medication(medication_id: str) -> dict | None:
    rows = run_query(MEDICATION_BY_ID, {"id": medication_id})
    return rows[0] if rows else None


def search_medications(q: str | None = None, limit: int = 50) -> list[dict]:
    return run_query(ALL_MEDICATIONS, {"q": q, "limit": limit})


def get_availability(medication_id: str) -> dict | None:
    medication = get_medication(medication_id)
    if medication is None:
        return None
    retail = run_query(RETAIL_AVAILABILITY_QUERY, {"mid": medication_id})
    warehouse = run_query(WAREHOUSE_AVAILABILITY_QUERY, {"mid": medication_id})
    summary = aggregate_availability(retail, warehouse)
    today = date.today().isoformat()
    return {
        "medication": medication,
        "as_of": today,
        **summary,
        "method": "deterministic-python+cypher",
    }


def detect_shortages(limit: int = 100) -> list[dict]:
    """Classify every medicine's total valid stock; worst first."""
    rows = run_query(SHORTAGE_AGGREGATE_QUERY)
    shortages = []
    for row in rows:
        status = classify_stock(row["total_stock"])
        if status == "ok":
            continue
        shortages.append(
            {
                "id": row["id"],
                "name": row["name"],
                "category": row["category"],
                "retail_stock": row["retail_stock"] or 0,
                "warehouse_stock": row["warehouse_stock"] or 0,
                "total_stock": row["total_stock"] or 0,
                "status": status,
            }
        )
    shortages.sort(key=lambda s: (s["total_stock"], s["name"]))
    return shortages[:limit]


def find_alternative_medicines(medication_id: str) -> list[dict]:
    """Alternatives explicitly represented via ALTERNATIVE_TO, with their stock."""
    alternatives = run_query(ALTERNATIVES_QUERY, {"mid": medication_id})
    for alt in alternatives:
        availability = get_availability(alt["id"])
        alt["total_quantity"] = availability["total_quantity"] if availability else 0
        alt["status"] = classify_stock(alt["total_quantity"])
    alternatives.sort(key=lambda a: -a["total_quantity"])
    return alternatives


def expiring_batches(within_days: int, include_expired: bool = False) -> list[dict]:
    cypher = """
    MATCH (b:DrugBatch)-[:BATCH_OF|HAS_BATCH]-(m:Medication)
    WHERE b.expiry_date <= date() + duration('P' + $days + 'D')
      AND ($include_expired OR b.expiry_date >= date())
    RETURN b.id AS batch_id, b.expiry_date AS expiry_date,
           b.manufacture_date AS manufacture_date, m.name AS medicine
    ORDER BY b.expiry_date LIMIT 50
    """
    return run_query(cypher, {"days": str(within_days), "include_expired": include_expired})


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value
