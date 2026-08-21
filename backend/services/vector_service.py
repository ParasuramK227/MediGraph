"""Lightweight in-memory TF-IDF vector search over clinical text.

Deliberately dependency-free: tokenization + TF-IDF + cosine similarity in
pure Python. Used for unstructured content (clinical notes, evidence
summaries, study abstracts). The graph remains the source of truth; this is
an auxiliary retrieval signal for GraphRAG.
"""
from __future__ import annotations

import math
import re
from collections import Counter

from services.graph_service import run_query

DOCS_QUERY = """
MATCH (n)
WHERE (n:MedicalRecord OR n:Evidence OR n:ClinicalStudy) AND n.summary IS NOT NULL
RETURN n.id AS id, n.summary AS text,
       head(labels(n)) AS doc_type,
       coalesce(n.patient_id, n.supports_treatment_id, n.title) AS entity_ref
"""

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "the", "and", "for", "with", "was", "were", "has", "had", "have", "this",
    "that", "from", "his", "her", "their", "which", "are", "not", "but",
    "patient", "showed", "also", "after", "been", "being", "into", "such",
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS and len(t) > 1]


class VectorIndex:
    """Minimal TF-IDF cosine-similarity index."""

    def __init__(self, documents: list[dict]):
        # documents: [{id, text, doc_type, entity_ref}]
        self.documents = documents
        self.doc_tokens = [tokenize(d.get("text") or "") for d in documents]
        self.doc_counts = [Counter(tokens) for tokens in self.doc_tokens]
        self.n_docs = len(documents)
        self.df: Counter = Counter()
        for counts in self.doc_counts:
            self.df.update(counts.keys())
        self.idf = {
            term: math.log((self.n_docs + 1) / (freq + 1)) + 1
            for term, freq in self.df.items()
        }
        self.vectors = [self._vectorize(counts) for counts in self.doc_counts]

    def _vectorize(self, term_counts: Counter) -> dict[str, float]:
        vector = {
            term: (1 + math.log(count)) * self.idf.get(term, 0.0)
            for term, count in term_counts.items()
            if term in self.idf
        }
        norm = math.sqrt(sum(w * w for w in vector.values())) or 1.0
        return {term: w / norm for term, w in vector.items()}

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        query_vector = self._vectorize(Counter(tokenize(query)))
        if not query_vector:
            return []
        scored = []
        for i, vector in enumerate(self.vectors):
            score = sum(
                weight * query_vector.get(term, 0.0) for term, weight in vector.items()
                if term in query_vector
            )
            if score > 0:
                doc = self.documents[i]
                scored.append(
                    {
                        "id": doc["id"],
                        "doc_type": doc.get("doc_type"),
                        "entity_ref": doc.get("entity_ref"),
                        "snippet": (doc.get("text") or "")[:220],
                        "score": round(score, 4),
                    }
                )
        scored.sort(key=lambda d: -d["score"])
        return scored[:top_k]


_index: VectorIndex | None = None


def get_index() -> VectorIndex:
    """Lazily build the index from graph-stored document text."""
    global _index
    if _index is None:
        docs = run_query(DOCS_QUERY)
        _index = VectorIndex(docs)
    return _index


def reset_index() -> None:
    global _index
    _index = None


def search_documents(query: str, top_k: int = 5) -> list[dict]:
    return get_index().search(query, top_k=top_k)
