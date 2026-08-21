"""Supply-chain tracing via Neo4j graph traversal.

Traces: Manufacturer -> Supplier -> Distributor -> Warehouse -> Hospital/Pharmacy
Neo4j performs the traversal; this module only shapes the result.
"""
from __future__ import annotations

from services.graph_service import run_query

BATCH_TRACE_QUERY = """
MATCH (b:DrugBatch {id: $bid})
OPTIONAL MATCH (b)-[:BATCH_OF]->(m:Medication)
OPTIONAL MATCH (b)-[:MANUFACTURED_BY]->(man:Manufacturer)
OPTIONAL MATCH (b)-[:SUPPLIED_BY]->(sup:Supplier)
OPTIONAL MATCH (b)-[:DISTRIBUTED_BY]->(dis:Distributor)
OPTIONAL MATCH (b)-[st:STORED_AT]->(w:Warehouse)
RETURN b, collect(DISTINCT m) AS medications,
       collect(DISTINCT man) AS manufacturers,
       collect(DISTINCT sup) AS suppliers,
       collect(DISTINCT dis) AS distributors,
       collect(DISTINCT w{.*, quantity: st.quantity}) AS warehouses
"""

MEDICINE_SUPPLY_CHAIN_QUERY = """
MATCH (m:Medication {id: $mid})-[:HAS_BATCH]->(b:DrugBatch)
WHERE b.expiry_date >= date()
OPTIONAL MATCH (b)-[:MANUFACTURED_BY]->(man:Manufacturer)
OPTIONAL MATCH (b)-[:SUPPLIED_BY]->(sup:Supplier)
OPTIONAL MATCH (b)-[:DISTRIBUTED_BY]->(dis:Distributor)
OPTIONAL MATCH (b)-[st:STORED_AT]->(w:Warehouse)
WITH m, b, man, sup, dis, w, st
ORDER BY st.quantity DESC
WITH m, b, man, sup, dis,
     collect({warehouse: w, quantity: st.quantity})[..4] AS warehouse_rows
UNWIND warehouse_rows AS wr
WITH m, b, man, sup, dis, wr.warehouse AS w, wr.quantity AS qty
OPTIONAL MATCH (w)-[:SUPPLIES]->(f)
WHERE (f:Hospital OR f:Pharmacy) AND EXISTS {
    MATCH (f)-[:HAS_INVENTORY]->(m)
}
RETURN m.id AS medicine_id, m.name AS medicine_name,
       b.id AS batch_id, b.expiry_date AS expiry_date,
       man.id AS manufacturer_id, man.name AS manufacturer_name,
       sup.id AS supplier_id, sup.name AS supplier_name,
       dis.id AS distributor_id, dis.name AS distributor_name,
       w.id AS warehouse_id, w.name AS warehouse_name, qty,
       f.id AS facility_id, f.name AS facility_name, head(labels(f)) AS facility_type
"""


def trace_batch(batch_id: str) -> dict | None:
    """Trace a single drug batch through the supply chain."""
    rows = run_query(BATCH_TRACE_QUERY, {"bid": batch_id})
    if not rows or not rows[0].get("b"):
        return None
    row = rows[0]
    batch = _plain(row["b"])
    nodes = [{"id": batch["id"], "label": batch.get("batch_id", batch["id"]),
              "type": "DrugBatch", "properties": batch}]
    edges = []

    for med in row.get("medications") or []:
        if med and med.get("id"):
            nodes.append(_node(med, "Medication"))
            edges.append(_edge(batch["id"], med["id"], "BATCH_OF"))
    for man in row.get("manufacturers") or []:
        if man and man.get("id"):
            nodes.append(_node(man, "Manufacturer"))
            edges.append(_edge(batch["id"], man["id"], "MANUFACTURED_BY"))
    for sup in row.get("suppliers") or []:
        if sup and sup.get("id"):
            nodes.append(_node(sup, "Supplier"))
            edges.append(_edge(sup["id"], batch["id"], "SUPPLIED_BY"))
    for dis in row.get("distributors") or []:
        if dis and dis.get("id"):
            nodes.append(_node(dis, "Distributor"))
            edges.append(_edge(dis["id"], batch["id"], "DISTRIBUTED_BY"))
    for wh in row.get("warehouses") or []:
        if wh and wh.get("id"):
            props = dict(wh)
            quantity = props.pop("quantity", None)
            nodes.append(_node(props, "Warehouse"))
            edge = _edge(batch["id"], wh["id"], "STORED_AT")
            edge["quantity"] = quantity
            edges.append(edge)

    return {
        "batch": batch,
        "graph": {"nodes": _dedupe_nodes(nodes), "edges": _dedupe_edges(edges)},
        "method": "neo4j-traversal",
    }


def trace_supply_chain(medication_id: str) -> dict | None:
    """Trace the full supply chain of a medicine's valid batches."""
    rows = run_query(MEDICINE_SUPPLY_CHAIN_QUERY, {"mid": medication_id})
    if not rows:
        return None

    medicine_name = rows[0]["medicine_name"]
    nodes = [{"id": medication_id, "label": medicine_name, "type": "Medication",
              "properties": {"id": medication_id, "name": medicine_name}}]
    edges = []
    seen_batches: set[str] = set()

    for row in rows:
        bid = row["batch_id"]
        if bid not in seen_batches:
            seen_batches.add(bid)
            nodes.append({"id": bid, "label": bid, "type": "DrugBatch",
                          "properties": {"id": bid, "expiry_date": _iso(row.get("expiry_date"))}})
            edges.append(_edge(medication_id, bid, "HAS_BATCH"))
            if row.get("manufacturer_id"):
                nodes.append({"id": row["manufacturer_id"], "label": row["manufacturer_name"],
                              "type": "Manufacturer", "properties": {"id": row["manufacturer_id"], "name": row["manufacturer_name"]}})
                edges.append(_edge(bid, row["manufacturer_id"], "MANUFACTURED_BY"))
            if row.get("supplier_id"):
                nodes.append({"id": row["supplier_id"], "label": row["supplier_name"],
                              "type": "Supplier", "properties": {"id": row["supplier_id"], "name": row["supplier_name"]}})
                edges.append(_edge(row["supplier_id"], bid, "SUPPLIED_BY"))
            if row.get("distributor_id"):
                nodes.append({"id": row["distributor_id"], "label": row["distributor_name"],
                              "type": "Distributor", "properties": {"id": row["distributor_id"], "name": row["distributor_name"]}})
                edges.append(_edge(row["distributor_id"], bid, "DISTRIBUTED_BY"))
        if row.get("warehouse_id"):
            nodes.append({"id": row["warehouse_id"], "label": row["warehouse_name"],
                          "type": "Warehouse", "properties": {"id": row["warehouse_id"], "name": row["warehouse_name"]}})
            edge = _edge(bid, row["warehouse_id"], "STORED_AT")
            edge["quantity"] = row.get("qty")
            edges.append(edge)
            if row.get("facility_id"):
                nodes.append({"id": row["facility_id"], "label": row["facility_name"],
                              "type": row["facility_type"], "properties": {"id": row["facility_id"], "name": row["facility_name"]}})
                edges.append(_edge(row["warehouse_id"], row["facility_id"], "SUPPLIES"))

    return {
        "medicine": {"id": medication_id, "name": medicine_name},
        "graph": {"nodes": _dedupe_nodes(nodes), "edges": _dedupe_edges(edges)},
        "method": "neo4j-traversal",
    }


def get_hospital_inventory(hospital_id: str) -> list[dict]:
    cypher = """
    MATCH (f {id: $fid})-[inv:HAS_INVENTORY]->(m:Medication)
    RETURN m.id AS medication_id, m.name AS medicine, inv.quantity AS quantity,
         inv.expiry_date AS expiry_date, inv.last_updated AS last_updated
    ORDER BY inv.quantity ASC
    """
    return run_query(cypher, {"fid": hospital_id})


def _plain(value):
    if isinstance(value, dict):
        return value
    if hasattr(value, "items"):
        return dict(value)
    return value


def _node(props: dict, ntype: str) -> dict:
    return {"id": props["id"], "label": props.get("name", props["id"]),
            "type": ntype, "properties": props}


def _edge(source: str, target: str, rel_type: str) -> dict:
    return {"id": f"{source}-{rel_type}->{target}", "source": source,
            "target": target, "type": rel_type}


def _dedupe_nodes(nodes: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique = []
    for node in nodes:
        if node["id"] not in seen:
            seen.add(node["id"])
            unique.append(node)
    return unique


def _dedupe_edges(edges: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    unique = []
    for edge in edges:
        key = (edge["source"], edge["target"], edge["type"])
        if key not in seen:
            seen.add(key)
            unique.append(edge)
    return unique


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value
