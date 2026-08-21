#!/usr/bin/env python3
"""Quick verification of graph contents (node/relationship counts)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from services.graph_explore import get_schema, get_stats  # noqa: E402
from services.graph_service import close_driver, run_query  # noqa: E402


def main() -> None:
    stats = get_stats()
    schema = get_schema()
    print("== Node counts ==")
    for label, count in sorted(stats["node_types"].items()):
        print(f"  {label:<16} {count}")
    print(f"  TOTAL           {stats['total_nodes']}")
    print(f"  Relationships   {stats['total_relationships']}")
    print("\n== Relationship types ==")
    for rel in schema["relationship_types"]:
        print(f"  {rel['type']:<24} {rel['count']}")
    sample = run_query(
        "MATCH (p:Patient)-[:HAS_DIAGNOSIS]->(d:Disease)-[:TREATED_BY|EFFECTIVE_FOR]-(t:Treatment)"
        "-[:USES_MEDICATION]->(m:Medication)-[:HAS_BATCH]->(:DrugBatch)"
        "-[:STORED_AT]->(:Warehouse) RETURN p.name LIMIT 3"
    )
    print(f"\nFull clinical->supply chain traversals found: {len(sample)}")
    close_driver()


if __name__ == "__main__":
    main()
