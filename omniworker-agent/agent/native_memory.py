"""NativeMemory — always-on, zero-config cross-session memory for Flux Agent.

Provides four layers of persistence:

1. BM25Layer      — FTS5 full-text search over all past sessions (always available)
2. VectorLayer    — sqlite-vec semantic search (optional, auto-activates if sqlite-vec
                     or a provider embedding API is available)
3. FactLayer      — structured facts with entity resolution and trust scoring
4. WorkspaceState — active workspace state (edited files, errors, tasks, decisions)

Design goals:
- Zero configuration: works out-of-the-box with no API keys
- Always active: indexed on every turn automatically
- Fast: BM25 prefilter + optional vector rerank
- Transparent: facts are auditable in SQLite tables
- Graceful degradation: if sqlite-vec or embeddings fail, falls back to BM25

Usage (inside run_agent.py):
    from agent.native_memory import NativeMemory, NativeMemoryProvider

    # Direct usage
    native = NativeMemory(session_db)
    native.sync_turn(user_msg, assistant_msg, tool_results, session_id)
    context = native.prefetch(user_message, session_id)
    ws_state = native.get_workspace_state()

    # Via MemoryManager
    provider = NativeMemoryProvider(session_db)
    memory_manager.add_provider(provider)
"""

from __future__ import annotations

import json
import logging
import re
import struct
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy imports for optional dependencies
# ---------------------------------------------------------------------------

_sqlite_vec: Any = None


def _get_sqlite_vec() -> Any:
    global _sqlite_vec
    if _sqlite_vec is None:
        try:
            import sqlite_vec

            _sqlite_vec = sqlite_vec
        except Exception as exc:
            logger.debug("sqlite-vec not available, attempting lazy install: %s", exc)
            try:
                from tools.lazy_deps import ensure

                ensure("memory.sqlite_vec", prompt=False)
                import sqlite_vec

                _sqlite_vec = sqlite_vec
                logger.info("sqlite-vec installed via lazy deps")
            except Exception as install_exc:
                logger.debug("sqlite-vec lazy install failed: %s", install_exc)
    return _sqlite_vec


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAX_INJECTED_TOKENS = 4000  # hard cap on memory context injected per turn
_MAX_CHUNKS_PER_PREFETCH = 20
_CHUNK_OVERLAP_CHARS = 50
_MIN_CHUNK_CHARS = 40
_MAX_CHUNK_CHARS = 800
_VEC_DIMENSIONS = 384  # all-MiniLM-L6-v2
_MEMORY_FENCE = "<memory-context>"

# Entity extraction patterns
_ENTITY_PATTERNS = [
    ("file", re.compile(r"[\w/-]+\.(py|ts|tsx|js|jsx|go|rs|java|cpp|c|rb|swift|kt|cs|php|scala|md|json|yaml|yml|prisma|sql|css|html|vue|svelte)", re.IGNORECASE)),
    ("function", re.compile(r"(?:def|function|fn|func|method)\s+([A-Za-z_]\w*)"),),
    ("class", re.compile(r"(?:class|struct|interface|type)\s+([A-Za-z_]\w*)"),),
    ("module", re.compile(r"(?:module|package|namespace)\s+([A-Za-z_][\w.]*)", re.IGNORECASE)),
    ("error", re.compile(r"(?:Error|Exception|Failure|Failed|panic|traceback)\s*:?\s*([^\n]{10,200})", re.IGNORECASE)),
    ("decision", re.compile(r"(?:decided? to|decidimos|elegimos|usaremos|vamos con|going with|chosen|selected)\s+([^\n.]{10,200})", re.IGNORECASE)),
]

# Scoring weights for BM25 hybrid ranking
# BM25 relevance is the primary signal; recency helps but shouldn't dominate
# so memories from weeks ago are still surfaced when relevant.
_W_BM25 = 0.40
_W_RECENCY = 0.25
_W_SESSION_AFFINITY = 0.20
_W_ROLE = 0.15

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class MemoryChunk:
    id: int
    session_id: str
    turn_id: int
    chunk_type: str  # 'user', 'assistant', 'tool_result', 'error', 'decision', 'file_edit', 'summary'
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    score: float = 0.0


@dataclass
class WorkspaceState:
    recently_edited_files: List[Dict[str, Any]] = field(default_factory=list)
    active_errors: List[Dict[str, Any]] = field(default_factory=list)
    pending_decisions: List[Dict[str, Any]] = field(default_factory=list)
    active_goals: List[Dict[str, Any]] = field(default_factory=list)
    last_task_summary: str = ""


@dataclass
class Fact:
    id: int
    fact_type: str
    subject: str
    predicate: str
    object: Optional[str]
    confidence: float
    occurrence_count: int
    first_seen: float
    last_seen: float


# ---------------------------------------------------------------------------
# Embedder abstraction
# ---------------------------------------------------------------------------


class Embedder(ABC):
    """Abstract embedder — implementations may be local ONNX or remote API."""

    @abstractmethod
    def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Return list of embedding vectors, or None on failure."""

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Embedding vector dimensions."""


class NullEmbedder(Embedder):
    """No-op embedder — disables vector search gracefully."""

    def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        return None

    @property
    def dimensions(self) -> int:
        return 0


class ProviderEmbedder(Embedder):
    """Uses the configured LLM provider's embedding API (OpenAI, etc.).

    Falls back to NullEmbedder if no embedding API is available.
    """

    def __init__(self, api_key: str = "", base_url: str = "", model: str = "text-embedding-3-small") -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self._client: Any = None

    @property
    def dimensions(self) -> int:
        return 1536  # text-embedding-3-small

    def _lazy_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            from openai import OpenAI

            self._client = OpenAI(api_key=self.api_key, base_url=self.base_url or None)
            return self._client
        except Exception as exc:
            logger.debug("ProviderEmbedder: OpenAI client init failed: %s", exc)
            return None

    def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        client = self._lazy_client()
        if client is None:
            return None
        try:
            resp = client.embeddings.create(model=self.model, input=texts)
            return [item.embedding for item in resp.data]
        except Exception as exc:
            logger.debug("ProviderEmbedder: embedding API failed: %s", exc)
            return None


# ---------------------------------------------------------------------------
# BM25Layer
# ---------------------------------------------------------------------------


class BM25Layer:
    """Full-text search over memory chunks using SQLite FTS5.

    Always available — requires only SQLite (ships with Python).
    """

    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        self._conn.executescript(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
                content, tokenize='trigram'
            );
            CREATE TABLE IF NOT EXISTS memory_chunks (
                id INTEGER PRIMARY KEY,
                session_id TEXT NOT NULL,
                turn_id INTEGER NOT NULL,
                chunk_type TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_memory_chunks_session ON memory_chunks(session_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_memory_chunks_type ON memory_chunks(chunk_type);
            CREATE TRIGGER IF NOT EXISTS memory_chunks_fts_insert AFTER INSERT ON memory_chunks BEGIN
                INSERT INTO memory_chunks_fts(rowid, content) VALUES (new.id, new.content);
            END;
            CREATE TRIGGER IF NOT EXISTS memory_chunks_fts_delete AFTER DELETE ON memory_chunks BEGIN
                DELETE FROM memory_chunks_fts WHERE rowid = old.id;
            END;
            """
        )

    def index(self, chunk: MemoryChunk) -> None:
        cur = self._conn.execute(
            """
            INSERT INTO memory_chunks(session_id, turn_id, chunk_type, content, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (chunk.session_id, chunk.turn_id, chunk.chunk_type, chunk.content,
             json.dumps(chunk.metadata) if chunk.metadata else None, chunk.created_at),
        )
        chunk.id = cur.lastrowid

    def search(
        self,
        query: str,
        session_id: str = "",
        k: int = 10,
    ) -> List[MemoryChunk]:
        """Search memory chunks using BM25 with recency + session affinity scoring."""
        if not query or not query.strip():
            return []

        # Sanitize query for FTS5 MATCH (quote each token)
        tokens = [t for t in query.strip().split() if len(t) > 2]
        if not tokens:
            return []
        quoted = " ".join(f'"{t}"' for t in tokens)

        now = time.time()
        rows = self._conn.execute(
            """
            SELECT c.id, c.session_id, c.turn_id, c.chunk_type, c.content, c.metadata, c.created_at,
                   rank
            FROM memory_chunks_fts f
            JOIN memory_chunks c ON c.id = f.rowid
            WHERE memory_chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (quoted, k * 3),
        ).fetchall()

        results: List[MemoryChunk] = []
        for row in rows:
            chunk = MemoryChunk(
                id=row[0],
                session_id=row[1],
                turn_id=row[2],
                chunk_type=row[3],
                content=row[4],
                metadata=json.loads(row[5]) if row[5] else {},
                created_at=row[6],
            )
            # Composite scoring
            bm25_score = -row[7] if row[7] is not None else 0.0
            age_hours = (now - chunk.created_at) / 3600.0
            recency = max(0.0, 1.0 - (age_hours / 720.0))  # decay over 30 days
            session_affinity = 2.0 if chunk.session_id == session_id else 1.0
            role_weight = 1.5 if chunk.chunk_type in ("decision", "error", "file_edit") else 1.0

            chunk.score = (
                _W_BM25 * bm25_score
                + _W_RECENCY * recency
                + _W_SESSION_AFFINITY * session_affinity
                + _W_ROLE * role_weight
            )
            results.append(chunk)

        results.sort(key=lambda c: c.score, reverse=True)
        return results[:k]

    def clear_session(self, session_id: str) -> None:
        self._conn.execute("DELETE FROM memory_chunks WHERE session_id = ?", (session_id,))


# ---------------------------------------------------------------------------
# VectorLayer
# ---------------------------------------------------------------------------


class VectorLayer:
    """Semantic vector search using sqlite-vec.

    Optional — gracefully disables itself if sqlite-vec or an embedder
    is not available.
    """

    def __init__(self, conn: Any, embedder: Optional[Embedder] = None) -> None:
        self._conn = conn
        self._embedder = embedder or NullEmbedder()
        self._available = False
        self._lock = threading.Lock()
        self._ensure_table()

    def _ensure_table(self) -> None:
        sv = _get_sqlite_vec()
        if sv is None:
            logger.info("VectorLayer: sqlite-vec not available, vector search disabled")
            return
        try:
            self._conn.enable_load_extension(True)
            sv.load(self._conn)
            self._conn.enable_load_extension(False)
            dims = self._embedder.dimensions or _VEC_DIMENSIONS
            self._conn.execute(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(embedding float[{dims}])"
            )
            self._available = True
            logger.info("VectorLayer: initialized with %d dimensions", dims)
        except Exception as exc:
            logger.warning("VectorLayer: initialization failed: %s", exc)
            self._available = False

    @property
    def is_available(self) -> bool:
        return self._available

    def index(self, chunk: MemoryChunk) -> None:
        if not self._available or chunk.id <= 0:
            return
        embeddings = self._embedder.embed([chunk.content])
        if embeddings is None or not embeddings:
            return
        vec = embeddings[0]
        # Pack floats -> little-endian bytes
        blob = struct.pack("<" + "f" * len(vec), *vec)
        try:
            self._conn.execute(
                "INSERT INTO memory_embeddings(rowid, embedding) VALUES (?, ?)",
                (chunk.id, blob),
            )
        except Exception as exc:
            logger.debug("VectorLayer: failed to index chunk %s: %s", chunk.id, exc)

    def search(
        self,
        query: str,
        candidate_ids: Optional[List[int]] = None,
        k: int = 10,
    ) -> List[Tuple[int, float]]:
        """Return (chunk_id, distance) ranked by vector similarity.

        If candidate_ids is provided, restricts search to those chunks
        (useful for reranking BM25 results).
        """
        if not self._available:
            return []
        embeddings = self._embedder.embed([query])
        if embeddings is None or not embeddings:
            return []
        vec = embeddings[0]
        blob = struct.pack("<" + "f" * len(vec), *vec)

        try:
            if candidate_ids:
                placeholders = ",".join("?" * len(candidate_ids))
                rows = self._conn.execute(
                    f"""
                    SELECT rowid, distance
                    FROM memory_embeddings
                    WHERE embedding MATCH ?
                      AND rowid IN ({placeholders})
                    ORDER BY distance
                    LIMIT ?
                    """,
                    (blob, *candidate_ids, k),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT rowid, distance
                    FROM memory_embeddings
                    WHERE embedding MATCH ?
                    ORDER BY distance
                    LIMIT ?
                    """,
                    (blob, k),
                ).fetchall()
            return [(row[0], row[1]) for row in rows]
        except Exception as exc:
            logger.debug("VectorLayer: search failed: %s", exc)
            return []


# ---------------------------------------------------------------------------
# FactLayer
# ---------------------------------------------------------------------------


class FactLayer:
    """Structured facts with entity resolution and trust scoring."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS memory_facts (
                id INTEGER PRIMARY KEY,
                session_id TEXT,
                fact_type TEXT NOT NULL,
                subject TEXT NOT NULL,
                predicate TEXT NOT NULL,
                object TEXT,
                confidence REAL DEFAULT 1.0,
                occurrence_count INTEGER DEFAULT 1,
                first_seen REAL,
                last_seen REAL,
                UNIQUE(subject, predicate, object) ON CONFLICT REPLACE
            );
            CREATE INDEX IF NOT EXISTS idx_facts_type ON memory_facts(fact_type);
            CREATE INDEX IF NOT EXISTS idx_facts_subject ON memory_facts(subject);
            CREATE INDEX IF NOT EXISTS idx_facts_last_seen ON memory_facts(last_seen DESC);
            """
        )

    def extract_facts(self, text: str, session_id: str = "", turn_id: int = 0) -> List[Fact]:
        """Extract structured facts from raw text using regex patterns."""
        facts: List[Fact] = []
        now = time.time()
        for fact_type, pattern in _ENTITY_PATTERNS:
            for match in pattern.finditer(text):
                if fact_type == "file":
                    subject = match.group(0)
                    predicate = "mentioned_in"
                    obj = f"turn_{turn_id}"
                elif fact_type == "error":
                    subject = match.group(1).strip()[:200]
                    predicate = "error_type"
                    obj = match.group(0)[:200]
                elif fact_type == "decision":
                    subject = match.group(1).strip()[:200]
                    predicate = "decided"
                    obj = "true"
                else:
                    subject = match.group(1) if match.lastindex else match.group(0)
                    predicate = "defined_as"
                    obj = None

                # Deduplicate against existing facts in this extraction batch
                key = (subject.lower(), predicate.lower(), (obj or "").lower())
                if any(
                    (f.subject.lower(), f.predicate.lower(), (f.object or "").lower()) == key
                    for f in facts
                ):
                    continue

                facts.append(
                    Fact(
                        id=0,
                        fact_type=fact_type,
                        subject=subject,
                        predicate=predicate,
                        object=obj,
                        confidence=0.85,
                        occurrence_count=1,
                        first_seen=now,
                        last_seen=now,
                    )
                )
        return facts

    def store(self, facts: List[Fact], session_id: str = "") -> None:
        for fact in facts:
            self._conn.execute(
                """
                INSERT INTO memory_facts(session_id, fact_type, subject, predicate, object,
                                         confidence, occurrence_count, first_seen, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(subject, predicate, object) DO UPDATE SET
                    occurrence_count = occurrence_count + 1,
                    confidence = MAX(memory_facts.confidence, excluded.confidence),
                    last_seen = excluded.last_seen,
                    session_id = excluded.session_id
                """,
                (
                    session_id,
                    fact_type,
                    fact.subject,
                    fact.predicate,
                    fact.object,
                    fact.confidence,
                    fact.occurrence_count,
                    fact.first_seen,
                    fact.last_seen,
                ),
            )

    def search(self, query: str, k: int = 5) -> List[Fact]:
        """Find facts relevant to a query (simple keyword match on subject/object)."""
        tokens = [t.lower() for t in query.strip().split() if len(t) > 2]
        if not tokens:
            return []
        conditions = " OR ".join(
            "LOWER(subject) LIKE ? OR LOWER(object) LIKE ?" for _ in tokens
        )
        params: List[Any] = []
        for t in tokens:
            params.extend([f"%{t}%", f"%{t}%"])
        params.append(k)

        rows = self._conn.execute(
            f"""
            SELECT id, session_id, fact_type, subject, predicate, object,
                   confidence, occurrence_count, first_seen, last_seen
            FROM memory_facts
            WHERE {conditions}
            ORDER BY occurrence_count DESC, confidence DESC, last_seen DESC
            LIMIT ?
            """,
            tuple(params),
        ).fetchall()

        return [
            Fact(
                id=row[0],
                fact_type=row[2],
                subject=row[3],
                predicate=row[4],
                object=row[5],
                confidence=row[6],
                occurrence_count=row[7],
                first_seen=row[8],
                last_seen=row[9],
            )
            for row in rows
        ]


# ---------------------------------------------------------------------------
# WorkspaceStateLayer
# ---------------------------------------------------------------------------


class WorkspaceStateLayer:
    """Active workspace state persisted in SQLite key-value store."""

    _KEY_FILES = "recently_edited_files"
    _KEY_ERRORS = "active_errors"
    _KEY_DECISIONS = "pending_decisions"
    _KEY_GOALS = "active_goals"
    _KEY_LAST_TASK = "last_task_summary"
    _MAX_FILES = 20
    _MAX_ERRORS = 10
    _MAX_DECISIONS = 10
    _MAX_GOALS = 5

    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self._ensure_table()

    def _ensure_table(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )

    def _get_json(self, key: str, default: Any = None) -> Any:
        row = self._conn.execute(
            "SELECT value FROM workspace_state WHERE key = ?", (key,)
        ).fetchone()
        if row is None:
            return default
        try:
            return json.loads(row[0])
        except Exception:
            return default

    def _set_json(self, key: str, value: Any) -> None:
        self._conn.execute(
            """
            INSERT INTO workspace_state(key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (key, json.dumps(value), time.time()),
        )

    def on_file_edit(self, path: str, diff_summary: str = "", session_id: str = "") -> None:
        files: List[Dict[str, Any]] = self._get_json(self._KEY_FILES, [])
        # Move to front if exists, otherwise prepend
        files = [f for f in files if f.get("path") != path]
        files.insert(0, {"path": path, "summary": diff_summary, "session_id": session_id, "at": time.time()})
        self._set_json(self._KEY_FILES, files[: self._MAX_FILES])

    def on_error(self, error: str, file: str = "", session_id: str = "") -> None:
        errors: List[Dict[str, Any]] = self._get_json(self._KEY_ERRORS, [])
        errors.insert(0, {"error": error[:500], "file": file, "session_id": session_id, "at": time.time(), "status": "open"})
        self._set_json(self._KEY_ERRORS, errors[: self._MAX_ERRORS])

    def resolve_error(self, error_pattern: str) -> None:
        errors: List[Dict[str, Any]] = self._get_json(self._KEY_ERRORS, [])
        for e in errors:
            if error_pattern in e.get("error", ""):
                e["status"] = "resolved"
        self._set_json(self._KEY_ERRORS, errors)

    def on_decision(self, question: str, answer: str = "", session_id: str = "") -> None:
        decisions: List[Dict[str, Any]] = self._get_json(self._KEY_DECISIONS, [])
        decisions.insert(0, {"question": question[:300], "answer": answer[:500], "session_id": session_id, "at": time.time()})
        self._set_json(self._KEY_DECISIONS, decisions[: self._MAX_DECISIONS])

    def on_goal(self, goal: str, progress: float = 0.0, session_id: str = "") -> None:
        goals: List[Dict[str, Any]] = self._get_json(self._KEY_GOALS, [])
        goals = [g for g in goals if g.get("goal") != goal]
        goals.insert(0, {"goal": goal[:300], "progress": progress, "session_id": session_id, "at": time.time()})
        self._set_json(self._KEY_GOALS, goals[: self._MAX_GOALS])

    def set_task_summary(self, summary: str) -> None:
        self._set_json(self._KEY_LAST_TASK, summary[:1000])

    def get_state(self) -> WorkspaceState:
        return WorkspaceState(
            recently_edited_files=self._get_json(self._KEY_FILES, []),
            active_errors=[e for e in self._get_json(self._KEY_ERRORS, []) if e.get("status") == "open"],
            pending_decisions=self._get_json(self._KEY_DECISIONS, []),
            active_goals=self._get_json(self._KEY_GOALS, []),
            last_task_summary=self._get_json(self._KEY_LAST_TASK, ""),
        )

    def clear(self) -> None:
        for key in (self._KEY_FILES, self._KEY_ERRORS, self._KEY_DECISIONS, self._KEY_GOALS, self._KEY_LAST_TASK):
            self._conn.execute("DELETE FROM workspace_state WHERE key = ?", (key,))

    def format_for_prompt(self, max_tokens: int = 800) -> str:
        """Format workspace state as text for system prompt injection."""
        ws = self.get_state()
        parts: List[str] = []
        parts.append("## Active Workspace State")

        if ws.last_task_summary:
            parts.append(f"**Current task:** {ws.last_task_summary}")

        if ws.active_goals:
            parts.append("**Active goals:**")
            for g in ws.active_goals:
                bar = "█" * int(g.get("progress", 0) * 10) + "░" * (10 - int(g.get("progress", 0) * 10))
                parts.append(f"  [{bar}] {g.get('goal', '')}")

        if ws.recently_edited_files:
            parts.append("**Recently edited files:**")
            for f in ws.recently_edited_files[:5]:
                parts.append(f"  - {f.get('path', '')}")

        if ws.active_errors:
            parts.append("**Active errors (not yet resolved):**")
            for e in ws.active_errors[:3]:
                parts.append(f"  - {e.get('error', '')[:120]}")

        if ws.pending_decisions:
            parts.append("**Pending decisions:**")
            for d in ws.pending_decisions[:3]:
                parts.append(f"  - {d.get('question', '')[:120]}")

        text = "\n".join(parts)
        # Rough token cap (chars / 4)
        if len(text) > max_tokens * 4:
            text = text[: max_tokens * 4] + "\n...[truncated]"
        return text


# ---------------------------------------------------------------------------
# Chunker
# ---------------------------------------------------------------------------


def _chunk_text(text: str, max_chars: int = _MAX_CHUNK_CHARS, overlap: int = _CHUNK_OVERLAP_CHARS) -> List[str]:
    """Split text into overlapping chunks."""
    if len(text) <= max_chars:
        return [text]
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = start + max_chars
        # Try to break at sentence boundary
        if end < len(text):
            for delim in ("\n\n", ". ", "; ", "\n"):
                idx = text.rfind(delim, start + max_chars // 2, end + len(delim))
                if idx != -1:
                    end = idx + len(delim)
                    break
        chunks.append(text[start:end].strip())
        start = end - overlap
    return [c for c in chunks if len(c) >= _MIN_CHUNK_CHARS]


# ---------------------------------------------------------------------------
# NativeMemory (core orchestrator)
# ---------------------------------------------------------------------------


class NativeMemory:
    """Always-on cross-session memory for Flux Agent.

    Hybrid search: BM25 (always) → optional vector rerank → fact lookup.
    """

    def __init__(
        self,
        conn: Any,
        embedder: Optional[Embedder] = None,
    ) -> None:
        self._conn = conn
        self._bm25 = BM25Layer(conn)
        self._vector = VectorLayer(conn, embedder)
        self._facts = FactLayer(conn)
        self._workspace = WorkspaceStateLayer(conn)
        self._last_injected_chunks: set[int] = set()
        self._lock = threading.Lock()

    # -- Public API ------------------------------------------------------------

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        tool_results: List[Dict[str, Any]],
        session_id: str,
        turn_id: int = 0,
    ) -> None:
        """Index a completed turn into all memory layers."""
        now = time.time()

        # 1. Chunk and index messages
        chunks: List[MemoryChunk] = []
        for role, text in (("user", user_content), ("assistant", assistant_content)):
            if text and text.strip():
                for piece in _chunk_text(text):
                    chunks.append(
                        MemoryChunk(
                            id=0,
                            session_id=session_id,
                            turn_id=turn_id,
                            chunk_type=role,
                            content=piece,
                            created_at=now,
                        )
                    )

        # 2. Chunk and index tool results
        for tr in tool_results:
            content = tr.get("content") or ""
            if isinstance(content, (list, dict)):
                content = json.dumps(content)
            if content and str(content).strip():
                tool_name = tr.get("tool_name", "") or tr.get("name", "")
                is_error = "error" in str(content).lower() or tr.get("is_error")
                ctype = "error" if is_error else "tool_result"
                for piece in _chunk_text(str(content)):
                    chunks.append(
                        MemoryChunk(
                            id=0,
                            session_id=session_id,
                            turn_id=turn_id,
                            chunk_type=ctype,
                            content=piece,
                            metadata={"tool": tool_name, "is_error": bool(is_error)},
                            created_at=now,
                        )
                    )
                # Track errors in workspace state
                if is_error:
                    self._workspace.on_error(str(content)[:500], session_id=session_id)

        # 3. Index chunks (BM25 + vector)
        for chunk in chunks:
            self._bm25.index(chunk)
            self._vector.index(chunk)

        # 4. Extract and store facts
        all_text = f"{user_content}\n{assistant_content}\n"
        for tr in tool_results:
            c = tr.get("content") or ""
            all_text += f"{c}\n"
        facts = self._facts.extract_facts(all_text, session_id, turn_id)
        self._facts.store(facts, session_id)

        # 5. Track file edits in workspace state
        for tr in tool_results:
            tool_name = tr.get("tool_name", "") or tr.get("name", "")
            if tool_name in ("write_file", "edit_file", "apply_diff", "patch"):
                path = tr.get("path") or tr.get("file") or ""
                if path:
                    self._workspace.on_file_edit(path, session_id=session_id)

    def prefetch(self, query: str, session_id: str = "", k: int = _MAX_CHUNKS_PER_PREFETCH) -> str:
        """Recall relevant context for the upcoming turn.

        Returns formatted text ready for injection into the system prompt.
        """
        if not query or not query.strip():
            return ""

        # 1. BM25 search (always works)
        bm25_results = self._bm25.search(query, session_id=session_id, k=k * 2)
        if not bm25_results:
            return ""

        # 2. Optional vector rerank
        if self._vector.is_available:
            candidate_ids = [c.id for c in bm25_results]
            vec_results = self._vector.search(query, candidate_ids=candidate_ids, k=k)
            vec_ids = {r[0] for r in vec_results}
            # Boost BM25 scores with vector distance
            for chunk in bm25_results:
                for vid, dist in vec_results:
                    if chunk.id == vid:
                        # Lower distance = higher boost (0.0 to 0.3)
                        chunk.score += 0.3 * max(0.0, 1.0 - dist)
            bm25_results.sort(key=lambda c: c.score, reverse=True)

        # 3. Fact lookup
        facts = self._facts.search(query, k=5)

        # 4. Deduplicate and format
        selected = bm25_results[:k]
        with self._lock:
            # Don't re-inject chunks injected in the immediately previous turn
            selected = [c for c in selected if c.id not in self._last_injected_chunks]
            self._last_injected_chunks = {c.id for c in selected}

        parts: List[str] = []
        parts.append("## Recalled Context (from past sessions)")

        if facts:
            parts.append("**Known facts:**")
            for f in facts:
                obj_str = f" → {f.object}" if f.object else ""
                parts.append(f"  - {f.subject} {f.predicate}{obj_str}")

        if selected:
            parts.append("**Relevant past turns:**")
            for chunk in selected:
                age = ""
                age_hours = (time.time() - chunk.created_at) / 3600
                if age_hours < 1:
                    age = " (just now)"
                elif age_hours < 24:
                    age = f" ({int(age_hours)}h ago)"
                else:
                    age = f" ({int(age_hours / 24)}d ago)"
                parts.append(f"  [{chunk.chunk_type}{age}] {chunk.content[:300]}")

        text = "\n".join(parts)
        # Rough token estimate
        if len(text) > _MAX_INJECTED_TOKENS * 4:
            text = text[: _MAX_INJECTED_TOKENS * 4] + "\n...[truncated]"
        return text

    def get_workspace_state(self) -> WorkspaceState:
        return self._workspace.get_state()

    def get_workspace_state_text(self, max_tokens: int = 800) -> str:
        return self._workspace.format_for_prompt(max_tokens)

    def on_file_edit(self, path: str, diff_summary: str = "", session_id: str = "") -> None:
        self._workspace.on_file_edit(path, diff_summary, session_id)

    def on_error(self, error: str, file: str = "", session_id: str = "") -> None:
        self._workspace.on_error(error, file, session_id)

    def on_decision(self, question: str, answer: str = "", session_id: str = "") -> None:
        self._workspace.on_decision(question, answer, session_id)

    def on_goal(self, goal: str, progress: float = 0.0, session_id: str = "") -> None:
        self._workspace.on_goal(goal, progress, session_id)

    def set_task_summary(self, summary: str) -> None:
        self._workspace.set_task_summary(summary)

    def clear_workspace(self) -> None:
        self._workspace.clear()

    def clear_session(self, session_id: str) -> None:
        self._bm25.clear_session(session_id)

    @property
    def has_vector_search(self) -> bool:
        return self._vector.is_available


# ---------------------------------------------------------------------------
# MemoryProvider adapter for MemoryManager
# ---------------------------------------------------------------------------

from agent.memory_provider import MemoryProvider


class NativeMemoryProvider(MemoryProvider):
    """Adapter that exposes NativeMemory through the MemoryProvider interface.

    Registered automatically by run_agent.py so NativeMemory is always active
    regardless of whether an external memory provider is configured.
    """

    def __init__(self, session_db: Any, embedder: Optional[Embedder] = None) -> None:
        self._native = NativeMemory(session_db._conn if hasattr(session_db, "_conn") else session_db, embedder)
        self._session_id: str = ""
        self._turn_counter: int = 0

    @property
    def name(self) -> str:
        return "native"

    def is_available(self) -> bool:
        return True  # Always available — only needs SQLite

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        self._session_id = session_id
        self._turn_counter = 0

    def system_prompt_block(self) -> str:
        ws_text = self._native.get_workspace_state_text(max_tokens=600)
        if not ws_text:
            return ""
        return (
            "## Your Workspace State\n"
            "The following reflects your current active workspace. "
            "It is automatically maintained and updated as you work.\n\n"
            f"{ws_text}"
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        sid = session_id or self._session_id
        return self._native.prefetch(query, session_id=sid)

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        # NativeMemory prefetch is fast enough (<100ms) that background
        # queuing is unnecessary. We do it inline in prefetch().
        pass

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
        tool_results: Optional[List[Dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> None:
        sid = session_id or self._session_id
        self._turn_counter += 1
        tr = tool_results or []
        self._native.sync_turn(user_content, assistant_content, tr, sid, self._turn_counter)

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        # NativeMemory does not expose tools to the model — it works silently.
        return []

    def on_session_switch(
        self,
        new_session_id: str,
        *,
        parent_session_id: str = "",
        reset: bool = False,
        **kwargs: Any,
    ) -> None:
        self._session_id = new_session_id
        if reset:
            self._turn_counter = 0
            self._native.clear_workspace()

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        # Extract facts from messages about to be compressed
        all_text = "\n".join(
            str(m.get("content", "")) for m in messages if m.get("content")
        )
        facts = self._native._facts.extract_facts(all_text, self._session_id)
        self._native._facts.store(facts, self._session_id)
        # Also update task summary from the last assistant message
        for m in reversed(messages):
            if m.get("role") == "assistant" and m.get("content"):
                self._native.set_task_summary(str(m["content"])[:500])
                break
        return ""

    def on_memory_write(
        self,
        action: str,
        target: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        # Mirror built-in memory writes into native memory as decisions/facts
        if action == "add" and content:
            self._native.on_decision(content, session_id=self._session_id)

    def shutdown(self) -> None:
        pass
