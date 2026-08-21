"""Provenance stamping: every important answer carries its method + time."""


def stamp(payload: dict, method: str, sources: list[str] | None = None) -> dict:
    from datetime import datetime, timezone

    stamped = dict(payload)
    stamped["provenance"] = {
        "method": method,
        "sources": sources or [],
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "computed_by": "deterministic-python-services",
    }
    return stamped
