"""Offline FTS5 SQLite Memory Provider for Flux Agent.

Uses the local SQLite state.db (which already has FTS5 virtual tables
and triggers indexing all messages) to find relevant conversation context offline.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)


class OfflineFTSMemoryProvider(MemoryProvider):
    """Offline FTS5 SQLite Memory Provider."""

    def __init__(self):
        self._db_path: Optional[Path] = None
        self._session_db = None
        self._active_session_id: str = ""

    @property
    def name(self) -> str:
        return "offline_fts"

    def is_available(self) -> bool:
        # FTS5 offline SQLite is always available on standard Python deployments
        return True

    def initialize(self, session_id: str, **kwargs) -> None:
        self._active_session_id = session_id
        home = kwargs.get("flux-agent_home", str(Path.home() / ".flux-agent"))
        self._db_path = Path(home) / "state.db"

        try:
            from flux-agent_state import SessionDB
            self._session_db = SessionDB(db_path=self._db_path)
            logger.info("offline_fts: initialized with state.db at %s", self._db_path)
        except Exception as e:
            logger.error("offline_fts: failed to initialize SessionDB: %s", e)

    def _get_session_lineage(self, session_id: str, max_depth: int = 5) -> List[str]:
        """Walk the parent_session_id chain to find related sessions."""
        chain = [session_id]
        if not self._session_db:
            return chain
        try:
            current = session_id
            for _ in range(max_depth):
                row = self._session_db.get_session(current)
                parent = (row or {}).get("parent_session_id", "")
                if not parent or parent in chain:
                    break
                chain.append(parent)
                current = parent
        except Exception:
            pass
        return chain

    @staticmethod
    def _recency_factor(timestamp) -> float:
        """Exponential decay: half-life of 24 hours."""
        if not timestamp:
            return 0.1  # Very old / no timestamp
        try:
            import time
            age_hours = (time.time() - float(timestamp)) / 3600.0
            if age_hours < 0:
                age_hours = 0
            # 0.5^(age_hours / 24) — 1.0 at now, 0.5 at 24h, 0.25 at 48h
            return 0.5 ** (age_hours / 24.0)
        except Exception:
            return 0.1

    @staticmethod
    def _snippet_fingerprint(text: str) -> str:
        """Cheap dedup fingerprint: lowercase, strip whitespace, take first 150 chars."""
        return " ".join(text.lower().split())[:150]

    def _search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        if not self._session_db:
            return []
        try:
            # Pull extra results for re-scoring and dedup
            raw_results = self._session_db.search_messages(
                query=query,
                limit=limit * 3 + 5,
            )

            # Build session lineage for affinity scoring
            session_chain = set(self._get_session_lineage(self._active_session_id))

            seen_fingerprints: set = set()
            scored: list = []

            for r in raw_results:
                snippet = r.get("snippet") or ""
                if not snippet.strip():
                    continue

                # Skip exact echo of the current query
                if r.get("session_id") == self._active_session_id and snippet.strip() == query.strip():
                    continue

                # Dedup: skip near-identical snippets
                fp = self._snippet_fingerprint(snippet)
                if fp in seen_fingerprints:
                    continue
                seen_fingerprints.add(fp)

                # Composite score: BM25 rank × recency × session_affinity × role_weight
                # BM25 rank from SQLite is negative (lower = better), normalize to positive
                bm25_rank = abs(r.get("rank", -1.0))
                base_score = 1.0 / (1.0 + bm25_rank)  # Normalize to 0-1 range

                recency = self._recency_factor(r.get("timestamp"))

                # Session affinity: results from the current session chain are 2x more relevant
                session_boost = 2.0 if r.get("session_id") in session_chain else 1.0

                # Role weight: assistant responses (especially with decisions) are more valuable
                role_boost = 1.5 if r.get("role") == "assistant" else 1.0

                composite_score = base_score * recency * session_boost * role_boost

                scored.append((r, composite_score))

            # Sort by composite score descending
            scored.sort(key=lambda x: x[1], reverse=True)

            output = []
            for r, _score in scored[:limit]:
                snippet = r.get("snippet") or ""
                output.append({
                    "id": r.get("id"),
                    "session_id": r.get("session_id"),
                    "role": r.get("role"),
                    "content": snippet,
                    "snippet": snippet,
                    "source": r.get("source"),
                    "timestamp": r.get("timestamp"),
                })
            return output
        except Exception as e:
            logger.warning("offline_fts: search failed: %s", e)
            return []

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        if not query or not query.strip():
            return ""

        results = self._search(query, limit=5)
        if not results:
            return ""

        lines = ["### Relevant context from offline local conversation history:"]
        for r in results:
            role_label = "User" if r["role"] == "user" else "Assistant"
            content = r["content"] or ""
            if len(content) > 300:
                content = content[:300] + "..."
            timestamp_str = ""
            if r.get("timestamp"):
                from datetime import datetime
                try:
                    timestamp_str = datetime.fromtimestamp(r["timestamp"]).strftime('%Y-%m-%d %H:%M')
                    timestamp_str = f" ({timestamp_str})"
                except Exception:
                    pass
            lines.append(f"- [{role_label} on {r['source'] or 'desktop'}{timestamp_str}] {content}")
        return "\n".join(lines)

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        # No-op because the agent loop natively inserts messages into state.db
        pass

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "offline_memory_search",
                "description": "Search the local FTS5 database of all past conversations and sessions offline.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "FTS5 query or keywords to search for.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of historical messages to return.",
                            "default": 5,
                        },
                    },
                    "required": ["query"],
                },
            }
        ]

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        if tool_name == "offline_memory_search":
            results = self._search(
                args.get("query", ""),
                limit=min(args.get("limit", 5), 10)
            )
            return json.dumps({"results": results}, ensure_ascii=False)
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    def shutdown(self) -> None:
        if self._session_db:
            try:
                self._session_db.close()
            except Exception:
                pass
            self._session_db = None

    def on_session_switch(
        self,
        new_session_id: str,
        *,
        parent_session_id: str = "",
        reset: bool = False,
        **kwargs,
    ) -> None:
        self._active_session_id = new_session_id


def register(ctx):
    ctx.register_memory_provider(OfflineFTSMemoryProvider())
