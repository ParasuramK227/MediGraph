"""Neo4j driver management and graph<->API transformations.

All Cypher access funnels through `run_query` / `run_write` so services stay
thin and responses are plain dicts (never raw driver types).
"""
from __future__ import annotations

import threading
from datetime import date, datetime

from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from config import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD


class GraphConnectionError(RuntimeError):
    pass


_driver = None
_lock = threading.Lock()


def get_driver():
    global _driver
    if _driver is None:
        with _lock:
            if _driver is None:
                try:
                    _driver = GraphDatabase.driver(
                        NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD)
                    )
                    _driver.verify_connectivity()
                except ServiceUnavailable as exc:
                    raise GraphConnectionError(
                        "Cannot connect to Neo4j. Is the database running?"
                    ) from exc
    return _driver


def close_driver():
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


def run_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a read query, return a list of plain dict records."""
    with get_driver().session() as session:
        result = session.run(cypher, params or {})
        return [_record_to_dict(record) for record in result]


def run_write(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a write query inside a managed transaction."""
    with get_driver().session() as session:
        def _tx(tx):
            return [_record_to_dict(r) for r in tx.run(cypher, params or {})]
        return session.execute_write(_tx)


def run_many(cypher: str, rows: list[dict], batch_size: int = 500) -> int:
    """Run the same write statement for many parameter sets, batched."""
    written = 0
    with get_driver().session() as session:
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]

            def _tx(tx):
                nonlocal written
                for row in batch:
                    tx.run(cypher, row)
                written += len(batch)

            session.execute_write(_tx)
    return written


def _record_to_dict(record) -> dict:
    return {key: _to_plain(value) for key, value in record.items()}


def _to_plain(value):
    if isinstance(value, dict):
        return {k: _to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    # neo4j.time.Date / DateTime / Time are distinct classes with isoformat()
    if hasattr(value, "isoformat") and not isinstance(value, (str, bytes, int, float)):
        try:
            return value.isoformat()
        except Exception:
            pass
    if hasattr(value, "items"):  # neo4j Node / Relationship
        props = {k: _to_plain(v) for k, v in value.items()}
        node_id = props.get("id") or getattr(value, "element_id", None)
        labels = sorted(getattr(value, "labels", []) or [])
        return {"id": node_id, "labels": labels, "properties": props}
    return value


def node_summary(node: dict) -> dict:
    """Compact {id,label,type} view of a node dict produced by `_to_plain`."""
    props = node.get("properties", {})
    labels = node.get("labels", [])
    ntype = labels[0] if labels else "Unknown"
    label = (
        props.get("name")
        or props.get("title")
        or props.get("batch_id")
        or node.get("id", "")
    )
    return {
        "id": node.get("id") or props.get("id"),
        "label": label,
        "type": ntype,
        "properties": props,
    }
