"""Tool Sequence Detector — find recurring tool-call patterns in session history.

Analyzes messages in state.db to detect sequences of tool calls that repeat
across sessions (e.g.  web_search → web_extract → web_extract).  When a
sequence recurs often enough, it becomes a candidate for compression into a
single custom tool.

100% local analysis — no LLM calls, no token cost.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ToolSequence:
    """A single occurrence of a tool-call sequence within one turn."""
    tools: List[str]
    session_id: str
    timestamp: float
    user_id: str
    platform: str


@dataclass
class SequenceCluster:
    """A group of similar tool sequences."""
    sequence_hash: str
    canonical_sequence: List[str]
    occurrences: List[ToolSequence] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.occurrences)

    @property
    def first_seen(self) -> float:
        return min(o.timestamp for o in self.occurrences)

    @property
    def last_seen(self) -> float:
        return max(o.timestamp for o in self.occurrences)


@dataclass
class DetectedToolSequence:
    sequence_hash: str
    canonical_sequence: List[str]
    occurrence_count: int
    confidence: float
    first_seen_at: float
    last_seen_at: float
    sample_sessions: List[str]
    user_id: str
    source_platform: str
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

_READ_ONLY_SAFE_TOOLS = frozenset({
    "read_file", "search_files", "skill_view", "skills_list",
    "web_search", "web_extract", "session_search", "vision_analyze",
})


def _extract_tool_sequences_from_db(
    db,
    cutoff: float,
) -> List[ToolSequence]:
    """Pull assistant tool_calls from state.db and flatten into sequences.

    A 'turn' is defined as the span of assistant messages between two user
    messages.  We collect the ordered list of tool names called in that turn.
    """
    sequences: List[ToolSequence] = []

    try:
        # Get all messages ordered by session + timestamp
        rows = db._conn.execute(
            """
            SELECT m.role, m.content, m.timestamp, m.session_id,
                   COALESCE(s.user_id, '') as user_id,
                   COALESCE(s.source, '') as platform
            FROM messages m
            JOIN sessions s ON m.session_id = s.id
            WHERE m.timestamp >= ?
            ORDER BY m.session_id, m.timestamp ASC
            """,
            (cutoff,),
        ).fetchall()
    except Exception as exc:
        logger.warning("Failed to query messages for tool sequence scan: %s", exc)
        return sequences

    # Walk rows session-by-session, grouping tool calls between user messages
    current_tools: List[str] = []
    current_meta: Dict[str, Any] = {}

    for row in rows:
        role = row["role"] or ""
        session_id = row["session_id"] or ""
        content = row["content"] or ""

        if role == "user":
            # Flush previous turn
            if current_tools and current_meta:
                sequences.append(ToolSequence(
                    tools=list(current_tools),
                    session_id=current_meta.get("session_id", ""),
                    timestamp=current_meta.get("timestamp", 0.0),
                    user_id=current_meta.get("user_id", ""),
                    platform=current_meta.get("platform", ""),
                ))
            current_tools = []
            current_meta = {
                "session_id": session_id,
                "timestamp": row["timestamp"] or 0.0,
                "user_id": row["user_id"] or "",
                "platform": row["platform"] or "",
            }
        elif role == "assistant":
            # Parse tool_calls from content if present
            tool_names = _parse_tool_calls(content)
            current_tools.extend(tool_names)

    # Flush final turn
    if current_tools and current_meta:
        sequences.append(ToolSequence(
            tools=list(current_tools),
            session_id=current_meta.get("session_id", ""),
            timestamp=current_meta.get("timestamp", 0.0),
            user_id=current_meta.get("user_id", ""),
            platform=current_meta.get("platform", ""),
        ))

    return sequences


def _parse_tool_calls(content: str) -> List[str]:
    """Extract tool names from an assistant message that contains tool_calls.

    Handles both OpenAI-format JSON embedded in content and raw strings.
    """
    names: List[str] = []
    if not content:
        return names

    # Try to find a JSON array of tool_calls
    stripped = content.strip()
    if stripped.startswith("["):
        try:
            data = json.loads(stripped)
            if isinstance(data, list):
                for tc in data:
                    if isinstance(tc, dict):
                        fn = tc.get("function") or tc.get("tool_call")
                        if isinstance(fn, dict):
                            n = fn.get("name")
                            if n:
                                names.append(str(n))
                        else:
                            n = tc.get("name") or tc.get("tool_name")
                            if n:
                                names.append(str(n))
            return names
        except json.JSONDecodeError:
            pass

    # Fallback: heuristic scan for known patterns
    # e.g.  'tool_calls': [{'function': {'name': 'web_search', ...}}]
    try:
        if "tool_calls" in stripped:
            # crude but fast: look for "name": "xxx" inside tool_call blocks
            import re as _re
            for m in _re.finditer(r'"name"\s*:\s*"([^"]+)"', stripped):
                names.append(m.group(1))
    except Exception:
        pass

    return names


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

_MIN_SEQUENCE_LENGTH = 2
_MAX_SEQUENCE_LENGTH = 8


def _normalize_sequence(seq: List[str]) -> List[str]:
    """Filter and cap sequence length for clustering."""
    # Drop duplicates at the end (terminal retries)
    # e.g. [search, extract, extract] stays, but [search, search, search] → [search]
    # Actually we keep exact order; dedup only contiguous repeats beyond 2
    deduped: List[str] = []
    for tool in seq:
        if len(deduped) >= 2 and deduped[-1] == tool and deduped[-2] == tool:
            continue  # third+ contiguous repeat — likely retry loop
        deduped.append(tool)

    if len(deduped) < _MIN_SEQUENCE_LENGTH:
        return []
    if len(deduped) > _MAX_SEQUENCE_LENGTH:
        deduped = deduped[:_MAX_SEQUENCE_LENGTH]
    return deduped


def _sequence_similarity(a: List[str], b: List[str]) -> float:
    """Return similarity of two tool-name sequences."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Compare as space-joined strings with SequenceMatcher
    sa = " ".join(a)
    sb = " ".join(b)
    return SequenceMatcher(None, sa, sb).ratio()


def _make_sequence_hash(seq: List[str]) -> str:
    return hashlib.sha256("→".join(seq).encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def cluster_tool_sequences(
    sequences: List[ToolSequence],
    similarity_threshold: float = 0.80,
) -> List[SequenceCluster]:
    """Group similar tool sequences into clusters."""
    clusters: List[SequenceCluster] = []

    for occ in sequences:
        normalized = _normalize_sequence(occ.tools)
        if not normalized:
            continue

        best_cluster: Optional[SequenceCluster] = None
        best_score = 0.0

        for cluster in clusters:
            score = _sequence_similarity(normalized, cluster.canonical_sequence)
            if score > best_score:
                best_score = score
                best_cluster = cluster

        if best_cluster and best_score >= similarity_threshold:
            best_cluster.occurrences.append(occ)
            # Update canonical to the most frequent sequence in cluster
            counts: Dict[str, int] = defaultdict(int)
            for o in best_cluster.occurrences:
                key = "→".join(_normalize_sequence(o.tools))
                if key:
                    counts[key] += 1
            if counts:
                best_key = max(counts.items(), key=lambda kv: (kv[1], len(kv[0])))[0]
                best_cluster.canonical_sequence = best_key.split("→")
                best_cluster.sequence_hash = _make_sequence_hash(best_cluster.canonical_sequence)
        else:
            clusters.append(SequenceCluster(
                sequence_hash=_make_sequence_hash(normalized),
                canonical_sequence=normalized,
                occurrences=[occ],
            ))

    return clusters


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score_sequence_cluster(cluster: SequenceCluster) -> float:
    """Return confidence score in [0, 1]."""
    occurrences = cluster.count

    # Need at least 3 occurrences to be confident
    if occurrences < 3:
        return 0.0

    # 1. Occurrence density (35%)
    occurrence_score = min(occurrences / 5.0, 1.0)

    # 2. Sequence length bonus (25%) — longer sequences are more valuable
    seq_len = len(cluster.canonical_sequence)
    length_score = min(seq_len / 5.0, 1.0)

    # 3. Consistency (25%) — how many different variants vs canonical
    canonical_str = "→".join(cluster.canonical_sequence)
    matches = sum(
        1 for o in cluster.occurrences
        if "→".join(_normalize_sequence(o.tools)) == canonical_str
    )
    consistency = matches / occurrences if occurrences > 0 else 0.0

    # 4. Recency (15%)
    now = time.time()
    days_since = (now - cluster.last_seen) / 86400
    recency_score = max(0.0, 1.0 - (days_since / 14.0))  # decays over 14 days

    confidence = (
        occurrence_score * 0.35 +
        length_score * 0.25 +
        consistency * 0.25 +
        recency_score * 0.15
    )

    return round(confidence, 3)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def scan_for_tool_sequences(
    db_path=None,
    lookback_days: int = 30,
    similarity_threshold: float = 0.80,
    min_confidence: float = 0.70,
) -> List[DetectedToolSequence]:
    """Scan session history and return recurring tool-call sequences.

    This is the main entry point.  Returns sequences sorted by confidence
    descending.  Callers (e.g. pattern_engine) can surface high-confidence
    results to the agent as tool-creation candidates.
    """
    cutoff = time.time() - (lookback_days * 86400)

    try:
        from omniworker_state import SessionDB
    except Exception as exc:
        logger.warning("Cannot import SessionDB for tool sequence scan: %s", exc)
        return []

    db = SessionDB(db_path)
    try:
        sequences = _extract_tool_sequences_from_db(db, cutoff)
    except Exception as exc:
        logger.warning("Failed to extract tool sequences: %s", exc)
        db.close()
        return []
    finally:
        db.close()

    if len(sequences) < 3:
        return []

    clusters = cluster_tool_sequences(sequences, similarity_threshold)

    results: List[DetectedToolSequence] = []
    for cluster in clusters:
        confidence = _score_sequence_cluster(cluster)
        if confidence < min_confidence:
            continue

        sample_sessions = list({o.session_id for o in cluster.occurrences})[:5]
        latest = max(cluster.occurrences, key=lambda o: o.timestamp)

        results.append(DetectedToolSequence(
            sequence_hash=cluster.sequence_hash,
            canonical_sequence=cluster.canonical_sequence,
            occurrence_count=cluster.count,
            confidence=confidence,
            first_seen_at=cluster.first_seen,
            last_seen_at=cluster.last_seen,
            sample_sessions=sample_sessions,
            user_id=latest.user_id or "",
            source_platform=latest.platform or "",
            metadata={
                "sequence_length": len(cluster.canonical_sequence),
                "consistency": round(
                    sum(
                        1 for o in cluster.occurrences
                        if _normalize_sequence(o.tools) == cluster.canonical_sequence
                    ) / cluster.count, 3
                ) if cluster.count > 0 else 0.0,
            },
        ))

    results.sort(key=lambda r: r.confidence, reverse=True)
    return results


# ---------------------------------------------------------------------------
# Convenience helper for background review
# ---------------------------------------------------------------------------

def get_top_tool_sequence_candidates(
    db_path=None,
    top_n: int = 3,
    min_confidence: float = 0.75,
) -> List[Dict[str, Any]]:
    """Return the top N tool-sequence candidates as plain dicts.

    Lightweight wrapper intended for the background review fork to inject
    sequence context into the review prompt without heavy dependencies.
    """
    detected = scan_for_tool_sequences(
        db_path=db_path,
        lookback_days=14,   # shorter window — recent habits matter more
        min_confidence=min_confidence,
    )
    return [
        {
            "sequence": " → ".join(d.canonical_sequence),
            "occurrences": d.occurrence_count,
            "confidence": d.confidence,
        }
        for d in detected[:top_n]
    ]
