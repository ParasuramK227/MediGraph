"""LLM client abstraction. Groq is the default implementation.

The LLM is used ONLY for intent understanding and explanation of
already-retrieved results. It never touches Neo4j or business logic.
"""
from __future__ import annotations

import json

import requests

from config import GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL


class LLMError(RuntimeError):
    pass


class LLMClient:
    """Interface; swap implementations without touching callers."""

    def generate(self, messages: list[dict], json_mode: bool = False) -> str:
        raise NotImplementedError


class GroqClient(LLMClient):
    def __init__(self, api_key: str = GROQ_API_KEY, model: str = GROQ_MODEL,
                 base_url: str = GROQ_BASE_URL, timeout: int = 30):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def generate(self, messages: list[dict], json_mode: bool = False) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise LLMError(f"Groq request failed: {exc}") from exc
        if response.status_code != 200:
            raise LLMError(f"Groq returned {response.status_code}: {response.text[:200]}")
        try:
            return response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise LLMError("Unexpected Groq response shape") from exc

    def generate_json(self, messages: list[dict]) -> dict:
        raw = self.generate(messages, json_mode=True)
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise LLMError(f"Groq returned invalid JSON: {raw[:200]}") from exc


_client: LLMClient | None = None


def get_llm_client() -> LLMClient | None:
    """Returns None when no API key is configured -- the app must not break."""
    global _client
    if _client is None and GROQ_API_KEY:
        _client = GroqClient()
    return _client
