"""ProviderStateStore — persist provider-specific state across model switches.

Problem: When the agent switches models (e.g. OpenAI → Anthropic → Codex),
provider-specific metadata like Codex call_ids, Gemini thought signatures, or
Anthropic thinking blocks are lost. The next turn with the new provider may
fail because required replay fields are missing.

Solution: Save provider_data bags per turn in SQLite. On model switch or
agent reconstruction, recover and sanitize the state for the target provider.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Provider-specific fields that are safe to replay only on the same provider family
_PROVIDER_SPECIFIC_FIELDS: Dict[str, List[str]] = {
    "openai": ["codex_reasoning_items", "codex_message_items", "call_id", "response_item_id"],
    "anthropic": ["reasoning_details"],
    "google": ["extra_content"],
    "gemini": ["extra_content"],
    "deepseek": ["reasoning_content"],
    "moonshot": ["reasoning_content"],
    "kimi-code": ["reasoning_content"],
}

# Normalize provider names
_PROVIDER_ALIASES = {
    "openai": "openai",
    "anthropic": "anthropic",
    "claude": "anthropic",
    "google": "google",
    "gemini": "google",
    "deepseek": "deepseek",
    "moonshot": "moonshot",
    "kimi": "moonshot",
    "kimi-code": "moonshot",
    "minimax": "minimax",
    "nvidia": "nvidia",
    "opencode-go": "opencode-go",
    "z-ai": "z-ai",
}


def _normalize_provider(name: str) -> str:
    return _PROVIDER_ALIASES.get((name or "").lower().strip(), (name or "").lower().strip())


class ProviderStateStore:
    """SQLite-backed store for provider-specific turn state.

    Usage (run_agent.py):
        self._provider_state = ProviderStateStore(self._session_db._conn)

        # After each turn
        self._provider_state.save_turn_state(
            session_id=self.session_id,
            turn_idx=self._turn_counter,
            provider=self.provider,
            model=self.model,
            provider_data=normalized_response.provider_data,
        )

        # On model switch
        recovered = self._provider_state.get_recoverable_state(
            session_id=self.session_id,
            target_provider=new_provider,
        )
    """

    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self._ensure_table()

    def _ensure_table(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS provider_state (
                id INTEGER PRIMARY KEY,
                session_id TEXT NOT NULL,
                turn_idx INTEGER NOT NULL,
                provider TEXT NOT NULL,
                model TEXT,
                provider_data TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_provider_state_session
                ON provider_state(session_id, turn_idx DESC);
            CREATE INDEX IF NOT EXISTS idx_provider_state_provider
                ON provider_state(session_id, provider);
            """
        )

    def save_turn_state(
        self,
        session_id: str,
        turn_idx: int,
        provider: str,
        model: str,
        provider_data: Dict[str, Any],
    ) -> None:
        """Persist provider_data for a single turn.

        Only saves non-empty provider_data to avoid DB bloat.
        """
        if not provider_data:
            return
        try:
            self._conn.execute(
                """
                INSERT INTO provider_state(session_id, turn_idx, provider, model, provider_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    turn_idx,
                    _normalize_provider(provider),
                    model or "",
                    json.dumps(provider_data, ensure_ascii=False),
                    time.time(),
                ),
            )
        except Exception as exc:
            logger.debug("ProviderStateStore save failed: %s", exc)

    def get_recoverable_state(
        self,
        session_id: str,
        target_provider: str,
        max_turns: int = 10,
    ) -> Dict[str, Any]:
        """Recover provider state for the target provider.

        Returns the most recent provider_data for the SAME provider family,
        sanitized to remove fields that are not applicable.

        If no state exists for the exact provider, returns an empty dict.
        """
        target = _normalize_provider(target_provider)
        try:
            rows = self._conn.execute(
                """
                SELECT provider_data, provider
                FROM provider_state
                WHERE session_id = ? AND provider = ?
                ORDER BY turn_idx DESC
                LIMIT ?
                """,
                (session_id, target, max_turns),
            ).fetchall()
        except Exception as exc:
            logger.debug("ProviderStateStore query failed: %s", exc)
            return {}

        if not rows:
            return {}

        # Merge the most recent states, keeping only fields valid for target
        merged: Dict[str, Any] = {}
        for row in rows:
            try:
                data = json.loads(row[0])
            except Exception:
                continue
            source_provider = _normalize_provider(row[1])
            sanitized = self._sanitize_for_provider(data, target, source_provider)
            # Deeper values win (more recent)
            for key, value in sanitized.items():
                if value is not None:
                    merged[key] = value
        return merged

    def get_all_states_for_session(self, session_id: str) -> List[Dict[str, Any]]:
        """Return all provider states for a session (for debugging/migration)."""
        rows = self._conn.execute(
            """
            SELECT turn_idx, provider, model, provider_data, created_at
            FROM provider_state
            WHERE session_id = ?
            ORDER BY turn_idx DESC
            """,
            (session_id,),
        ).fetchall()
        return [
            {
                "turn_idx": r[0],
                "provider": r[1],
                "model": r[2],
                "provider_data": json.loads(r[3]) if r[3] else {},
                "created_at": r[4],
            }
            for r in rows
        ]

    def clear_session(self, session_id: str) -> None:
        self._conn.execute(
            "DELETE FROM provider_state WHERE session_id = ?", (session_id,)
        )

    @staticmethod
    def _sanitize_for_provider(
        data: Dict[str, Any],
        target_provider: str,
        source_provider: str,
    ) -> Dict[str, Any]:
        """Remove provider-specific fields that are not valid for the target.

        Examples:
        - Codex call_ids are only valid for OpenAI → strip for Anthropic
        - Anthropic thinking signatures are only valid for Anthropic → strip for OpenAI
        - Gemini thought signatures are only valid for Google → strip for others
        """
        target = _normalize_provider(target_provider)
        source = _normalize_provider(source_provider)

        if target == source:
            return dict(data)

        result = dict(data)
        target_fields = set(_PROVIDER_SPECIFIC_FIELDS.get(target, []))
        source_fields = set(_PROVIDER_SPECIFIC_FIELDS.get(source, []))

        # Remove fields that belong ONLY to the source provider
        for field in source_fields - target_fields:
            result.pop(field, None)

        # Special case: Codex reasoning items must be preserved when switching
        # between OpenAI models (even different ones), but stripped for non-OpenAI
        if target != "openai":
            for codex_key in ("codex_reasoning_items", "codex_message_items", "call_id", "response_item_id"):
                result.pop(codex_key, None)

        # Special case: Anthropic thinking signatures must be preserved for
        # Anthropic-family providers, stripped for third-party Anthropic proxies
        # that cannot validate signatures (MiniMax, Azure, Kimi, DeepSeek)
        if target == "anthropic":
            # Keep reasoning_details if going to native Anthropic
            pass
        else:
            result.pop("reasoning_details", None)

        return result


# ---------------------------------------------------------------------------
# Helpers for transports to use
# ---------------------------------------------------------------------------


def attach_provider_state_to_tool_calls(
    tool_calls: List[Dict[str, Any]],
    provider_state: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Replay provider-specific metadata onto tool calls.

    Used by transports when reconstructing a conversation for a provider
    that requires metadata replay (e.g. Codex call_id on tool results).
    """
    if not provider_state:
        return tool_calls

    enriched = []
    for tc in tool_calls:
        tc_copy = dict(tc)
        # Codex: attach call_id if available
        if "call_id" in provider_state:
            tc_copy["call_id"] = provider_state["call_id"]
        if "response_item_id" in provider_state:
            tc_copy["response_item_id"] = provider_state["response_item_id"]
        # Gemini: attach thought signature
        if "extra_content" in provider_state:
            tc_copy.setdefault("provider_data", {})
            tc_copy["provider_data"]["extra_content"] = provider_state["extra_content"]
        enriched.append(tc_copy)
    return enriched
