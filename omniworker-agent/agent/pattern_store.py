"""Pattern Store — CRUD for detected_patterns in state.db.

Thin layer on top of omniworker_state.SessionDB schema. All writes go
through the same WAL-retry logic as sessions/messages.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Reuse SessionDB connection pattern; if unavailable, degrade gracefully.
try:
    from omniworker_state import SessionDB
except Exception as exc:  # pragma: no cover
    logger.debug("SessionDB import failed in pattern_store: %s", exc)
    SessionDB = None  # type: ignore


class PatternStore:
    """Store and query detected patterns in the session database."""

    def __init__(self, db_path: Optional[Path] = None):
        if SessionDB is None:
            raise RuntimeError("SessionDB is not available; pattern store cannot initialize")
        self._db = SessionDB(db_path)
        # Ensure the patterns table exists (idempotent)
        self._ensure_table()

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _ensure_table(self) -> None:
        """Create detected_patterns table if missing."""
        # We use the same _execute_write helper when available, but SessionDB
        # schema init already runs on connect. Since detected_patterns is a
        # *new* table added after the fact, we issue a standalone CREATE here.
        try:
            with self._db._conn:
                self._db._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS detected_patterns (
                        id TEXT PRIMARY KEY,
                        pattern_hash TEXT NOT NULL,
                        pattern_type TEXT NOT NULL,
                        canonical_prompt TEXT NOT NULL,
                        sample_prompts TEXT,
                        schedule_inferred TEXT,
                        confidence REAL NOT NULL,
                        occurrence_count INTEGER DEFAULT 0,
                        first_seen_at REAL NOT NULL,
                        last_seen_at REAL NOT NULL,
                        status TEXT DEFAULT 'detected',
                        auto_created_job_id TEXT,
                        user_id TEXT,
                        source_platform TEXT,
                        source_chat_id TEXT,
                        metadata TEXT
                    )
                    """
                )
                self._db._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_patterns_status ON detected_patterns(status)"
                )
                self._db._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_patterns_hash ON detected_patterns(pattern_hash)"
                )
                self._db._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_patterns_user ON detected_patterns(user_id, source_platform)"
                )
                self._db._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_patterns_job ON detected_patterns(auto_created_job_id)"
                )
        except Exception as exc:
            logger.warning("Failed to ensure detected_patterns table: %s", exc)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def insert(self, pattern) -> str:
        """Insert a new DetectedPattern and return its generated id."""
        pattern_id = str(uuid.uuid4())
        try:
            def _write(conn):
                conn.execute(
                    """
                    INSERT INTO detected_patterns (
                        id, pattern_hash, pattern_type, canonical_prompt,
                        sample_prompts, schedule_inferred, confidence,
                        occurrence_count, first_seen_at, last_seen_at,
                        status, auto_created_job_id, user_id,
                        source_platform, source_chat_id, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pattern_id,
                        pattern.pattern_hash,
                        pattern.pattern_type,
                        pattern.canonical_prompt,
                        json.dumps(pattern.sample_prompts, ensure_ascii=False),
                        pattern.schedule_inferred,
                        pattern.confidence,
                        pattern.occurrence_count,
                        pattern.first_seen_at,
                        pattern.last_seen_at,
                        pattern.status,
                        pattern.auto_created_job_id,
                        pattern.user_id,
                        pattern.source_platform,
                        pattern.source_chat_id,
                        json.dumps(pattern.metadata, ensure_ascii=False),
                    ),
                )

            self._db._execute_write(_write)
        except Exception as exc:
            logger.warning("Failed to insert pattern: %s", exc)
            raise
        return pattern_id

    def get(self, pattern_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single pattern by id."""
        try:
            row = self._db._conn.execute(
                "SELECT * FROM detected_patterns WHERE id = ?",
                (pattern_id,),
            ).fetchone()
            return self._row_to_dict(row) if row else None
        except Exception as exc:
            logger.warning("Failed to get pattern %s: %s", pattern_id, exc)
            return None

    def get_by_hash(
        self,
        pattern_hash: str,
        user_id: str,
        source_platform: str,
    ) -> Optional[Dict[str, Any]]:
        """Fetch an existing pattern by hash + user + platform."""
        try:
            row = self._db._conn.execute(
                """
                SELECT * FROM detected_patterns
                WHERE pattern_hash = ?
                  AND user_id = ?
                  AND source_platform = ?
                LIMIT 1
                """,
                (pattern_hash, user_id, source_platform),
            ).fetchone()
            return self._row_to_dict(row) if row else None
        except Exception as exc:
            logger.warning("Failed to get pattern by hash: %s", exc)
            return None

    def list_all(
        self,
        user_id: Optional[str] = None,
        platform: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List patterns with optional filters."""
        conditions: List[str] = []
        params: List[Any] = []

        if user_id is not None:
            conditions.append("user_id = ?")
            params.append(user_id)
        if platform is not None:
            conditions.append("source_platform = ?")
            params.append(platform)
        if status is not None:
            conditions.append("status = ?")
            params.append(status)

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"""
            SELECT * FROM detected_patterns
            {where_clause}
            ORDER BY confidence DESC, last_seen_at DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        try:
            rows = self._db._conn.execute(query, params).fetchall()
            return [self._row_to_dict(r) for r in rows if r]
        except Exception as exc:
            logger.warning("Failed to list patterns: %s", exc)
            return []

    def update_confidence(
        self,
        pattern_id: str,
        confidence: float,
        occurrence_count: int,
        last_seen_at: float,
    ) -> None:
        """Bump confidence and occurrence count for an existing pattern."""
        try:
            def _write(conn):
                conn.execute(
                    """
                    UPDATE detected_patterns
                    SET confidence = ?,
                        occurrence_count = ?,
                        last_seen_at = ?
                    WHERE id = ?
                    """,
                    (confidence, occurrence_count, last_seen_at, pattern_id),
                )

            self._db._execute_write(_write)
        except Exception as exc:
            logger.warning("Failed to update pattern %s: %s", pattern_id, exc)

    def update_status(self, pattern_id: str, status: str) -> None:
        """Update status: detected | active | rejected | expired."""
        try:
            def _write(conn):
                conn.execute(
                    "UPDATE detected_patterns SET status = ? WHERE id = ?",
                    (status, pattern_id),
                )

            self._db._execute_write(_write)
        except Exception as exc:
            logger.warning("Failed to update status for %s: %s", pattern_id, exc)

    def mark_auto_created(self, pattern_id: str, job_id: str) -> None:
        """Mark a pattern as having spawned an auto cron job."""
        try:
            def _write(conn):
                conn.execute(
                    """
                    UPDATE detected_patterns
                    SET status = 'active',
                        auto_created_job_id = ?
                    WHERE id = ?
                    """,
                    (job_id, pattern_id),
                )

            self._db._execute_write(_write)
        except Exception as exc:
            logger.warning("Failed to mark auto_created for %s: %s", pattern_id, exc)

    def delete(self, pattern_id: str) -> bool:
        """Remove a pattern permanently."""
        try:
            def _write(conn):
                conn.execute(
                    "DELETE FROM detected_patterns WHERE id = ?",
                    (pattern_id,),
                )

            self._db._execute_write(_write)
            return True
        except Exception as exc:
            logger.warning("Failed to delete pattern %s: %s", pattern_id, exc)
            return False

    # ------------------------------------------------------------------
    # Rate-limit helpers
    # ------------------------------------------------------------------

    def get_last_auto_created_time(
        self,
        user_id: str,
        source_platform: str,
    ) -> Optional[float]:
        """Return timestamp of the most recent auto-cron for this user."""
        try:
            row = self._db._conn.execute(
                """
                SELECT MAX(last_seen_at) as ts
                FROM detected_patterns
                WHERE user_id = ?
                  AND source_platform = ?
                  AND auto_created_job_id IS NOT NULL
                """,
                (user_id, source_platform),
            ).fetchone()
            return row["ts"] if row and row["ts"] else None
        except Exception as exc:
            logger.warning("Failed to get last auto-created time: %s", exc)
            return None

    def set_last_auto_created_time(self, user_id: str, source_platform: str) -> None:
        """Record that we just auto-created a cron job."""
        # We piggy-back on a lightweight meta row in state_meta for this
        # to avoid adding yet another table.
        try:
            key = f"_pattern_auto_created_{user_id}_{source_platform}"
            from omniworker_state import DEFAULT_DB_PATH

            def _write(conn):
                conn.execute(
                    """
                    INSERT INTO state_meta (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """,
                    (key, str(time.time())),
                )

            self._db._execute_write(_write)
        except Exception as exc:
            logger.debug("Failed to set last auto-created time: %s", exc)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_dict(row) -> Dict[str, Any]:
        d = dict(row)
        for key in ("sample_prompts", "metadata"):
            if d.get(key):
                try:
                    d[key] = json.loads(d[key])
                except Exception:
                    pass
        return d

    def close(self) -> None:
        self._db.close()
