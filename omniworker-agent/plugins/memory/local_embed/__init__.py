"""Local embeddings memory plugin for OmniWorker.

Uses a local llama.cpp server (localhost:11435) for embeddings generation
and SQLite for vector storage + cosine-similarity search.

Requires the local LLM server to be running. The desktop installer
auto-starts it; otherwise run ~/.omniworker/local-llm/scripts/start-local-llm.sh
"""

from __future__ import annotations

import json
import logging
import math
import sqlite3
import threading
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)

LOCAL_LLM_URL = "http://127.0.0.1:11435"
EMBED_ENDPOINT = f"{LOCAL_LLM_URL}/embedding"
DB_NAME = "local_embed.db"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_server() -> bool:
    try:
        req = urllib.request.Request(f"{LOCAL_LLM_URL}/health", method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def _get_embedding(text: str) -> Optional[List[float]]:
    try:
        payload = json.dumps({"content": text}).encode("utf-8")
        req = urllib.request.Request(
            EMBED_ENDPOINT,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            # llama.cpp embedding format: {"embedding": [...]}
            return data.get("embedding")
    except Exception as e:
        logger.warning("local_embed: embedding request failed: %s", e)
        return None


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

class LocalEmbedMemoryProvider(MemoryProvider):
    """Local SQLite + llama.cpp embeddings memory provider."""

    def __init__(self):
        self._db_path: Optional[Path] = None
        self._lock = threading.Lock()
        self._prefetch_result = ""

    @property
    def name(self) -> str:
        return "local_embed"

    def is_available(self) -> bool:
        """Return True if the local LLM server is reachable."""
        return _check_server()

    def initialize(self, session_id: str, **kwargs) -> None:
        home = kwargs.get("omniworker_home", str(Path.home() / ".omniworker"))
        self._db_path = Path(home) / DB_NAME

        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content TEXT NOT NULL,
                    embedding TEXT NOT NULL,
                    source TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_docs_source ON documents(source)"
            )
            conn.commit()

        logger.info("local_embed: initialized at %s", self._db_path)

    def _search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        emb = _get_embedding(query)
        if not emb:
            return []

        with sqlite3.connect(self._db_path) as conn:
            rows = conn.execute(
                "SELECT id, content, embedding, source FROM documents ORDER BY id DESC LIMIT 1000"
            ).fetchall()

        scored = []
        for row in rows:
            doc_emb = json.loads(row[2])
            sim = _cosine_similarity(emb, doc_emb)
            scored.append((sim, row))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "id": r[1][0],
                "content": r[1][1],
                "source": r[1][3],
                "score": r[0],
            }
            for r in scored[:top_k]
        ]

    def _add_document(self, content: str, source: str = "") -> bool:
        emb = _get_embedding(content)
        if not emb:
            return False

        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO documents (content, embedding, source) VALUES (?, ?, ?)",
                (content, json.dumps(emb), source),
            )
            conn.commit()
        return True

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        results = self._search(query, top_k=5)
        if not results:
            return ""

        lines = ["### Relevant context from local memory"]
        for r in results:
            lines.append(f"- [{r['source'] or 'memory'}] {r['content'][:300]}")
        return "\n".join(lines)

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        # Index both user and assistant messages as separate documents
        if user_content:
            self._add_document(user_content, source="user")
        if assistant_content:
            self._add_document(assistant_content, source="assistant")

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "local_memory_search",
                "description": "Search the local embedded memory for relevant documents, notes, or past context.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query. Be specific to get relevant results.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results to return (1-10).",
                            "default": 5,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "local_memory_add",
                "description": "Add a new document or note to the local embedded memory for future recall.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The text to store. Can be a note, summary, fact, or document excerpt.",
                        },
                        "source": {
                            "type": "string",
                            "description": "Optional source label (e.g. 'user_note', 'summary', 'document').",
                            "default": "",
                        },
                    },
                    "required": ["content"],
                },
            },
        ]

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        if tool_name == "local_memory_search":
            results = self._search(args.get("query", ""), top_k=min(args.get("limit", 5), 10))
            return json.dumps({"results": results}, ensure_ascii=False)

        if tool_name == "local_memory_add":
            ok = self._add_document(args.get("content", ""), args.get("source", ""))
            return json.dumps({"success": ok}, ensure_ascii=False)

        return json.dumps({"error": f"Unknown tool: {tool_name}"})
