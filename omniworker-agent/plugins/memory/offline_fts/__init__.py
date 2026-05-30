"""Offline FTS5 SQLite Memory Provider for OmniWorker.

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
        home = kwargs.get("omniworker_home", str(Path.home() / ".omniworker"))
        self._db_path = Path(home) / "state.db"

        try:
            from omniworker_state import SessionDB
            self._session_db = SessionDB(db_path=self._db_path)
            logger.info("offline_fts: initialized with state.db at %s", self._db_path)
        except Exception as e:
            logger.error("offline_fts: failed to initialize SessionDB: %s", e)

    def _search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        if not self._session_db:
            return []
        try:
            # Retrieve relevant messages using FTS5 BM25 relevance
            results = self._session_db.search_messages(
                query=query,
                limit=limit + 2,  # Pull a few extra to filter out active user query
            )

            output = []
            for r in results:
                snippet = r.get("snippet") or ""
                # Exclude the exact user query from the active session to avoid echoing the current turn
                if r.get("session_id") == self._active_session_id and snippet.strip() == query.strip():
                    continue

                output.append({
                    "id": r.get("id"),
                    "session_id": r.get("session_id"),
                    "role": r.get("role"),
                    "content": snippet,
                    "snippet": snippet,
                    "source": r.get("source"),
                    "timestamp": r.get("timestamp")
                })
            return output[:limit]
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
