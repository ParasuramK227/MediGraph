"""Graph exploration service backing the dedicated Knowledge Graph page.

Transforms Neo4j results into the stable {nodes, edges} payload consumed by
React/Cytoscape. Raw driver objects never reach the frontend.
"""
from __future__ import annotations

from services.graph_service import run_query

SEARCHABLE_LABELS = (
    "Patient", "Disease", "Symptom", "Treatment", "Medication", "DrugBatch",
    "Hospital", "Pharmacy", "Warehouse", "Manufacturer", "Supplier",
    "Distributor",
)

SEARCH_QUERY = """
MATCH (n)
WHERE any(l IN labels(n) WHERE l IN $labels)
  AND (toLower(coalesce(n.name, '')) CONTAINS toLower($q)
       OR toLower(coalesce(n.title, '')) CONTAINS toLower($q)
       OR toLower(coalesce(n.id, '')) CONTAINS toLower($q))
RETURN n.id AS id, coalesce(n.name, n.title, n.id) AS label,
       head(labels(n)) AS type
ORDER BY size(coalesce(n.name, n.title, n.id)), label
LIMIT $limit
"""

ENTITY_QUERY = """
MATCH (n {id: $id})
RETURN n.id AS id, coalesce(n.name, n.title, n.id) AS label,
       head(labels(n)) AS type, properties(n) AS properties
"""

NEIGHBORS_QUERY = """
MATCH (n {id: $id})-[r]-(m)
RETURN n.id AS source_id,
       type(r) AS rel_type,
       startNode(r).id AS edge_source, endNode(r).id AS edge_target,
       properties(r) AS rel_props,
       m.id AS neighbor_id,
       coalesce(m.name, m.title, m.id) AS neighbor_label,
       head(labels(m)) AS neighbor_type,
       properties(m) AS neighbor_properties
"""

SUBGRAPH_EDGES_QUERY = """
MATCH (a)-[r]->(b)
WHERE a.id IN $ids AND b.id IN $ids
RETURN a.id AS source, b.id AS target, type(r) AS rel_type,
       properties(r) AS rel_props
"""

LABEL_STATS_QUERY = """
MATCH (n) UNWIND labels(n) AS label
RETURN label, count(*) AS count ORDER BY label
"""

REL_STATS_QUERY = """
MATCH ()-[r]->() RETURN type(r) AS rel_type, count(*) AS count
ORDER BY rel_type
"""


def search_entities(q: str, types: list[str] | None = None, limit: int = 20) -> list[dict]:
    labels = [t for t in (types or SEARCHABLE_LABELS) if t in SEARCHABLE_LABELS]
    if not labels:
        labels = list(SEARCHABLE_LABELS)
    return run_query(SEARCH_QUERY, {"q": q, "labels": labels, "limit": limit})


def get_entity(entity_id: str) -> dict | None:
    rows = run_query(ENTITY_QUERY, {"id": entity_id})
    return rows[0] if rows else None


def get_neighbors(entity_id: str) -> dict:
    """Return the node's neighbors as a graph payload + relationship list."""
    rows = run_query(NEIGHBORS_QUERY, {"id": entity_id})
    nodes, edges, relationships = [], [], []
    seen_nodes, seen_edges = set(), set()

    entity = get_entity(entity_id)
    if entity:
        nodes.append({"id": entity["id"], "label": entity["label"],
                      "type": entity["type"], "properties": entity.get("properties") or {}})
        seen_nodes.add(entity["id"])

    for row in rows:
        neighbor_id = row["neighbor_id"]
        if not neighbor_id or neighbor_id == entity_id:
            continue
        if neighbor_id not in seen_nodes:
            seen_nodes.add(neighbor_id)
            nodes.append(
                {
                    "id": neighbor_id,
                    "label": row["neighbor_label"] or neighbor_id,
                    "type": row["neighbor_type"],
                    "properties": row.get("neighbor_properties") or {},
                }
            )
        edge_key = (row["edge_source"], row["edge_target"], row["rel_type"])
        if edge_key not in seen_edges and row["edge_source"] in seen_nodes and row["edge_target"] in seen_nodes:
            seen_edges.add(edge_key)
            edges.append(
                {
                    "id": f"{edge_key[0]}-{edge_key[1]}-{edge_key[2]}-{len(edges)}",
                    "source": edge_key[0],
                    "target": edge_key[1],
                    "type": row["rel_type"],
                }
            )
        relationships.append(
            {
                "type": row["rel_type"],
                "direction": "out" if row["edge_source"] == entity_id else "in",
                "other_id": neighbor_id,
                "other_label": row["neighbor_label"],
                "other_type": row["neighbor_type"],
                "properties": row.get("rel_props") or {},
            }
        )

    return {
        "center": entity_id,
        "nodes": nodes,
        "edges": edges,
        "relationships": relationships,
    }


def get_subgraph(entity_id: str, depth: int = 1) -> dict:
    """Focused subgraph around an entity, including edges among neighbors."""
    neighborhood = get_neighbors(entity_id)
    ids = [node["id"] for node in neighborhood["nodes"]]
    if len(ids) > 1:
        inner_rows = run_query(SUBGRAPH_EDGES_QUERY, {"ids": ids[:400]})
        existing = {(e["source"], e["target"], e["type"]) for e in neighborhood["edges"]}
        for i, row in enumerate(inner_rows):
            key = (row["source"], row["target"], row["rel_type"])
            if key not in existing:
                existing.add(key)
                neighborhood["edges"].append(
                    {
                        "id": f"{key[0]}-{key[1]}-{key[2]}-{i}",
                        "source": key[0],
                        "target": key[1],
                        "type": key[2],
                    }
                )
    return {"center": entity_id, "depth": depth, **{
        "nodes": neighborhood["nodes"], "edges": neighborhood["edges"]}}


def get_schema() -> dict:
    """Node/relationship catalogue for filters and the legend."""
    return {
        "node_types": [
            {"type": row["label"], "count": row["count"]}
            for row in run_query(LABEL_STATS_QUERY)
        ],
        "relationship_types": [
            {"type": row["rel_type"], "count": row["count"]}
            for row in run_query(REL_STATS_QUERY)
        ],
        "searchable_types": list(SEARCHABLE_LABELS),
    }


def get_stats() -> dict:
    node_types = {row["label"]: row["count"] for row in run_query(LABEL_STATS_QUERY)}
    rel_count = run_query("MATCH ()-[r]->() RETURN count(r) AS c")[0]["c"]
    return {
        "total_nodes": sum(node_types.values()),
        "total_relationships": rel_count,
        "node_types": node_types,
    }
