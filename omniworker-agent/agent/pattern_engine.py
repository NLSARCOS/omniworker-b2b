"""Pattern Engine — detect user habits from conversation history.

Analyzes user messages in state.db to find temporal and content patterns,
then scores their confidence. When a pattern crosses the configured threshold,
it can automatically create a cron job.

100% local analysis — no LLM calls, no external APIs, no token cost.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set, Tuple

from omniworker_constants import get_omniworker_home

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

# Strip specific dates/times so "report for 2025-05-20" clusters with "report for 2025-05-21"
_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_TIME_RE = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
_RELATIVE_DATE_RE = re.compile(
    r"\b(?:hoy|ayer|mañana|today|yesterday|tomorrow|este|esta|estos|estas|this|next|last)\b",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"\b\d+\b")
_WHITESPACE_RE = re.compile(r"\s+")

# Short prompts we never pattern-match (greetings, thanks, acks)
_EXCLUDED_SHORT = frozenset({
    "hola", "hi", "hello", "hey", "buenos dias", "buenas", "buenas tardes",
    "buenas noches", "gracias", "thanks", "thank you", "ok", "okay", "okey",
    "si", "yes", "no", "nope", "sure", "claro", "dale", "listo", "done",
    "perfecto", "perfect", "bien", "good", "great", "awesome", "cool",
    "nice", "genial", "excelente", "bye", "adios", "see you", "saludos",
    "?", "!", "...", "..", ".", "o", "0", "1", "2", "3", "4", "5",
})


def _normalize_prompt(text: str) -> str:
    """Return a canonical form of a prompt for clustering comparisons."""
    if not text:
        return ""
    t = text.lower().strip()
    # Remove code blocks (they're usually one-off content)
    t = re.sub(r"```[\s\S]*?```", "", t)
    t = re.sub(r"`[^`]+`", "", t)
    # Remove URLs
    t = re.sub(r"https?://\S+", "", t)
    # Remove specific dates/times/numbers so similar requests cluster
    t = _DATE_RE.sub("", t)
    t = _TIME_RE.sub("", t)
    t = _RELATIVE_DATE_RE.sub("", t)
    t = _NUMBER_RE.sub("", t)
    # Collapse whitespace
    t = _WHITESPACE_RE.sub(" ", t)
    return t.strip()


def _is_excluded_prompt(text: str) -> bool:
    """Return True if a prompt should never be pattern-matched."""
    if not text:
        return True
    stripped = text.strip().lower()
    if len(stripped) < 10:
        return True
    if stripped in _EXCLUDED_SHORT:
        return True
    # Exclude single emoji or very short punctuation
    if len(stripped) <= 3 and not any(c.isalnum() for c in stripped):
        return True
    return False


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _load_config() -> Dict[str, Any]:
    """Read autolearning config from ~/.hermes/config.yaml."""
    try:
        from omniworker_cli.config import load_config
        cfg = load_config()
    except Exception as exc:
        logger.debug("Failed to load config for pattern engine: %s", exc)
        return {}
    if not isinstance(cfg, dict):
        return {}
    al = cfg.get("autolearning") or {}
    if not isinstance(al, dict):
        return {}
    return al


def _cfg(key: str, default: Any) -> Any:
    return _load_config().get(key, default)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class UserMessage:
    content: str
    normalized: str
    timestamp: float
    session_id: str
    platform: str
    chat_id: str
    user_id: str


@dataclass
class PatternCluster:
    pattern_hash: str
    canonical_prompt: str
    messages: List[UserMessage] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.messages)

    @property
    def first_seen(self) -> float:
        return min(m.timestamp for m in self.messages)

    @property
    def last_seen(self) -> float:
        return max(m.timestamp for m in self.messages)

    def timestamps(self) -> List[float]:
        return sorted(m.timestamp for m in self.messages)


@dataclass
class DetectedPattern:
    pattern_hash: str
    pattern_type: str          # 'temporal' | 'sequence'
    canonical_prompt: str
    sample_prompts: List[str]
    schedule_inferred: Optional[str]
    confidence: float
    occurrence_count: int
    first_seen_at: float
    last_seen_at: float
    status: str                # 'detected' | 'active' | 'rejected' | 'expired'
    auto_created_job_id: Optional[str]
    user_id: str
    source_platform: str
    source_chat_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def _compute_similarity(a: str, b: str) -> float:
    """Return similarity ratio in [0, 1]."""
    if not a or not b:
        return 0.0
    # Quick exact match
    if a == b:
        return 1.0
    # SequenceMatcher is fast enough for local clustering
    return SequenceMatcher(None, a, b).ratio()


def _make_pattern_hash(canonical: str) -> str:
    """Deterministic hash for a normalized prompt cluster."""
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def cluster_messages(
    messages: List[UserMessage],
    similarity_threshold: float = 0.82,
) -> List[PatternCluster]:
    """Group similar user messages into clusters."""
    clusters: List[PatternCluster] = []

    for msg in messages:
        if not msg.normalized:
            continue
        best_cluster: Optional[PatternCluster] = None
        best_score = 0.0

        for cluster in clusters:
            score = _compute_similarity(msg.normalized, cluster.canonical_prompt)
            if score > best_score:
                best_score = score
                best_cluster = cluster

        if best_cluster and best_score >= similarity_threshold:
            best_cluster.messages.append(msg)
            # Update canonical to the most frequent (or longest if tie)
            counts: Dict[str, int] = defaultdict(int)
            for m in best_cluster.messages:
                counts[m.normalized] += 1
            best = max(counts.items(), key=lambda kv: (kv[1], len(kv[0])))
            best_cluster.canonical_prompt = best[0]
            best_cluster.pattern_hash = _make_pattern_hash(best[0])
        else:
            clusters.append(PatternCluster(
                pattern_hash=_make_pattern_hash(msg.normalized),
                canonical_prompt=msg.normalized,
                messages=[msg],
            ))

    return clusters


# ---------------------------------------------------------------------------
# Temporal analysis
# ---------------------------------------------------------------------------

def _analyze_temporal(cluster: PatternCluster) -> Tuple[Optional[str], float, Dict[str, Any]]:
    """Infer a cron schedule from message timestamps.

    Returns (schedule_string, regularity_score, metadata).
    """
    timestamps = cluster.timestamps()
    if len(timestamps) < 2:
        return None, 0.0, {}

    intervals = [timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)]
    if not intervals:
        return None, 0.0, {}

    avg_interval = sum(intervals) / len(intervals)
    # Regularity: how consistent are intervals? (stddev / mean, lower is better)
    if len(intervals) > 1:
        variance = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
        stddev = variance ** 0.5
        cv = stddev / avg_interval if avg_interval > 0 else 1.0
        regularity = max(0.0, 1.0 - cv)
    else:
        regularity = 0.5

    # Hour-of-day consistency
    hours = [time.localtime(ts).tm_hour for ts in timestamps]
    hour_counts = defaultdict(int)
    for h in hours:
        hour_counts[h] += 1
    most_common_hour, most_common_count = max(hour_counts.items(), key=lambda kv: kv[1])
    hour_consistency = most_common_count / len(hours)

    # Day-of-week consistency
    weekdays = [time.localtime(ts).tm_wday for ts in timestamps]
    weekday_counts = defaultdict(int)
    for wd in weekdays:
        weekday_counts[wd] += 1
    most_common_wd, most_common_wd_count = max(weekday_counts.items(), key=lambda kv: kv[1])
    weekday_consistency = most_common_wd_count / len(weekdays)

    # Decide schedule
    schedule: Optional[str] = None

    # Daily at specific hour?
    if hour_consistency >= 0.7 and len(timestamps) >= 2:
        schedule = f"0 {most_common_hour} * * *"
        # Refine: weekdays only?
        if weekday_consistency >= 0.8 and most_common_wd_count >= 3:
            # If mostly same weekday, use weekly
            schedule = f"0 {most_common_hour} * * {most_common_wd}"
        elif all(wd < 5 for wd in weekdays) and weekday_consistency < 0.5:
            # If all on weekdays but scattered, maybe Mon-Fri
            pass  # keep daily for now, user can adjust in UI

    # Short interval (every N minutes/hours)?
    if schedule is None and avg_interval > 0:
        minutes = avg_interval / 60
        if 25 <= minutes <= 35:
            schedule = "30m"
        elif 55 <= minutes <= 65:
            schedule = "1h"
        elif 115 <= minutes <= 125:
            schedule = "2h"
        elif 170 <= minutes <= 190:
            schedule = "3h"
        elif 23 * 60 <= minutes <= 25 * 60:
            schedule = "1d"

    meta = {
        "avg_interval_hours": round(avg_interval / 3600, 2),
        "regularity": round(regularity, 3),
        "hour_consistency": round(hour_consistency, 3),
        "most_common_hour": most_common_hour,
        "weekday_consistency": round(weekday_consistency, 3),
        "most_common_weekday": most_common_wd,
    }

    return schedule, regularity, meta


# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------

def _score_pattern(
    cluster: PatternCluster,
    schedule: Optional[str],
    regularity: float,
    meta: Dict[str, Any],
) -> float:
    """Return confidence score in [0, 1]."""
    occurrences = cluster.count
    min_occurrences = _cfg("min_occurrences", 3)

    # 1. Occurrence density (30%)
    occurrence_score = min(occurrences / min_occurrences, 1.0) if min_occurrences > 0 else 1.0

    # 2. Regularity of intervals (25%)
    regularity_score = regularity

    # 3. Time-of-day consistency (20%)
    time_consistency = meta.get("hour_consistency", 0.0)

    # 4. Semantic similarity within cluster (15%)
    if occurrences >= 2:
        sims = []
        canonical = cluster.canonical_prompt
        for msg in cluster.messages:
            sims.append(_compute_similarity(canonical, msg.normalized))
        similarity_score = sum(sims) / len(sims)
    else:
        similarity_score = 1.0

    # 5. Recency (10%) — more recent patterns score higher
    now = time.time()
    last_seen = cluster.last_seen
    days_since = (now - last_seen) / 86400
    recency_score = max(0.0, 1.0 - (days_since / 7.0))  # decays over 7 days

    confidence = (
        occurrence_score * 0.30 +
        regularity_score * 0.25 +
        time_consistency * 0.20 +
        similarity_score * 0.15 +
        recency_score * 0.10
    )

    # Boost if we have a clear schedule inference
    if schedule and occurrence_score >= 1.0 and regularity_score >= 0.6:
        confidence = min(1.0, confidence + 0.05)

    return round(confidence, 3)


# ---------------------------------------------------------------------------
# Main scanning logic
# ---------------------------------------------------------------------------

def scan_for_patterns(
    user_messages: List[UserMessage],
    similarity_threshold: Optional[float] = None,
) -> List[DetectedPattern]:
    """Analyze a list of user messages and return detected patterns.

    This is the main entry point for the pattern engine. It clusters messages,
    analyzes temporal patterns, scores confidence, and returns candidates.
    """
    if similarity_threshold is None:
        similarity_threshold = float(_cfg("similarity_threshold", 0.82))

    # Filter excluded prompts
    filtered = [m for m in user_messages if not _is_excluded_prompt(m.content)]
    if len(filtered) < 2:
        return []

    clusters = cluster_messages(filtered, similarity_threshold)

    results: List[DetectedPattern] = []
    for cluster in clusters:
        if cluster.count < 2:
            continue

        schedule, regularity, meta = _analyze_temporal(cluster)
        confidence = _score_pattern(cluster, schedule, regularity, meta)

        sample_prompts = [m.content for m in cluster.messages[:5]]

        # Determine platform/chat from the most recent message
        latest = max(cluster.messages, key=lambda m: m.timestamp)

        results.append(DetectedPattern(
            pattern_hash=cluster.pattern_hash,
            pattern_type="temporal" if schedule else "sequence",
            canonical_prompt=cluster.canonical_prompt,
            sample_prompts=sample_prompts,
            schedule_inferred=schedule,
            confidence=confidence,
            occurrence_count=cluster.count,
            first_seen_at=cluster.first_seen,
            last_seen_at=cluster.last_seen,
            status="detected",
            auto_created_job_id=None,
            user_id=latest.user_id or "",
            source_platform=latest.platform or "",
            source_chat_id=latest.chat_id or "",
            metadata=meta,
        ))

    # Sort by confidence descending
    results.sort(key=lambda p: p.confidence, reverse=True)
    return results


# ---------------------------------------------------------------------------
# High-level scan from database
# ---------------------------------------------------------------------------

def scan_sessions_from_db(
    db_path=None,
    lookback_days: Optional[int] = None,
    user_id: Optional[str] = None,
    platform: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> List[DetectedPattern]:
    """Pull recent user messages from state.db and run pattern detection.

    Args:
        db_path: Path to state.db. Defaults to OMNIWORKER_HOME/state.db.
        lookback_days: How far back to look. Defaults to config or 30.
        user_id: Filter by user. If None, scans all users separately.
        platform: Filter by platform.
        chat_id: Filter by chat.
    """
    if lookback_days is None:
        lookback_days = int(_cfg("lookback_days", 30))

    cutoff = time.time() - (lookback_days * 86400)

    try:
        from omniworker_state import SessionDB
    except Exception as exc:
        logger.warning("Cannot import SessionDB for pattern scan: %s", exc)
        return []

    db = SessionDB(db_path)
    try:
        rows = db._conn.execute(
            """
            SELECT m.content, m.timestamp, m.session_id,
                   COALESCE(s.source, '') as platform,
                   COALESCE(s.user_id, '') as user_id
            FROM messages m
            JOIN sessions s ON m.session_id = s.id
            WHERE m.role = 'user'
              AND m.timestamp >= ?
              AND LENGTH(COALESCE(m.content, '')) >= 10
            ORDER BY m.timestamp ASC
            """,
            (cutoff,),
        ).fetchall()
    except Exception as exc:
        logger.warning("Failed to query messages for pattern scan: %s", exc)
        db.close()
        return []

    # Group by user+platform+chat for per-scope scanning
    grouped: Dict[Tuple[str, str, str], List[UserMessage]] = defaultdict(list)
    for row in rows:
        content = row["content"] or ""
        ts = row["timestamp"] or 0.0
        sid = row["session_id"] or ""
        plat = row["platform"] or ""
        uid = row["user_id"] or ""
        # We don't have chat_id in sessions table; derive from session metadata if possible
        chat_id_guess = sid  # fallback

        key = (uid, plat, chat_id_guess)
        grouped[key].append(UserMessage(
            content=content,
            normalized=_normalize_prompt(content),
            timestamp=ts,
            session_id=sid,
            platform=plat,
            chat_id=chat_id_guess,
            user_id=uid,
        ))

    all_patterns: List[DetectedPattern] = []
    for key, msgs in grouped.items():
        patterns = scan_for_patterns(msgs)
        all_patterns.extend(patterns)

    db.close()
    return all_patterns


# ---------------------------------------------------------------------------
# Background thread runner
# ---------------------------------------------------------------------------

_scan_thread: Optional[threading.Thread] = None
_last_scan_time: float = 0.0
_SCAN_MIN_INTERVAL_SECONDS: float = 43200.0  # 12 hours = max 2 scans per day


def spawn_background_scan(
    db_path=None,
    on_pattern_detected=None,
    on_auto_created=None,
) -> None:
    """Start a background thread that scans for patterns once.

    Args:
        on_pattern_detected: callback(pattern: DetectedPattern) -> None
        on_auto_created: callback(pattern: DetectedPattern, job_id: str) -> None
    """
    global _scan_thread, _last_scan_time

    if not _cfg("enabled", True):
        logger.debug("Autolearning disabled, skipping pattern scan")
        return

    # Rate-limit: max 2 deep scans per day by default.
    # User habits don't change minute-to-minute; daily scanning is plenty.
    now = time.time()
    min_interval_hours = float(_cfg("scan_interval_hours", 12))
    min_interval = min_interval_hours * 3600
    if now - _last_scan_time < min_interval:
        logger.debug(
            "Pattern scan rate-limited (last scan %.1fh ago, min %.1fh), skipping",
            (now - _last_scan_time) / 3600,
            min_interval_hours,
        )
        return

    if _scan_thread is not None and _scan_thread.is_alive():
        logger.debug("Pattern scan already running, skipping")
        return

    _last_scan_time = now

    def _run():
        try:
            patterns = scan_sessions_from_db(db_path)
            if not patterns:
                return

            min_confidence = float(_cfg("min_confidence", 0.85))
            auto_create = bool(_cfg("auto_create_cron", True))

            # Import store here to avoid circular imports at module load
            try:
                from agent.pattern_store import PatternStore
            except Exception:
                logger.warning("PatternStore not available, skipping persistence")
                return

            store = PatternStore(db_path)
            for pat in patterns:
                existing = store.get_by_hash(pat.pattern_hash, pat.user_id, pat.source_platform)
                if existing:
                    # Update occurrence count and confidence
                    store.update_confidence(
                        existing["id"],
                        confidence=pat.confidence,
                        occurrence_count=pat.occurrence_count,
                        last_seen_at=pat.last_seen_at,
                    )
                    continue

                # New pattern
                pattern_id = store.insert(pat)
                if on_pattern_detected:
                    try:
                        on_pattern_detected(pat)
                    except Exception:
                        pass

                # Auto-create cron job if proactive and confident enough
                if auto_create and pat.confidence >= min_confidence and pat.schedule_inferred:
                    _maybe_auto_create_cron(pat, pattern_id, store, on_auto_created)

            store.close()
        except Exception as exc:
            logger.warning("Background pattern scan failed: %s", exc, exc_info=True)

    _scan_thread = threading.Thread(target=_run, daemon=True)
    _scan_thread.start()


def _maybe_auto_create_cron(
    pat: DetectedPattern,
    pattern_id: str,
    store,
    on_auto_created=None,
) -> None:
    """Create a cron job from a high-confidence pattern."""
    try:
        from tools.cronjob_tools import cronjob
    except Exception as exc:
        logger.warning("Cannot import cronjob tool for auto-creation: %s", exc)
        return

    # Rate limit: max 1 auto-created job per 24h per user
    last_auto = store.get_last_auto_created_time(pat.user_id, pat.source_platform)
    if last_auto and (time.time() - last_auto) < 86400:
        logger.debug("Rate limit: skipping auto-cron for user %s", pat.user_id)
        return

    # Build a nice name
    name = pat.canonical_prompt[:50].strip()
    if len(name) >= 50:
        name = name[:47] + "..."
    name = f"🧠 {name}"

    # Build deliver string
    deliver = "local"
    if pat.source_platform and pat.source_chat_id:
        deliver = f"{pat.source_platform}:{pat.source_chat_id}"

    result = cronjob(
        action="create",
        prompt=pat.canonical_prompt,
        schedule=pat.schedule_inferred,
        name=name,
        deliver=deliver,
    )

    try:
        parsed = json.loads(result)
        if parsed.get("success"):
            job_id = parsed.get("job_id")
            store.mark_auto_created(pattern_id, job_id)
            store.set_last_auto_created_time(pat.user_id, pat.source_platform)
            logger.info(
                "Auto-created cron job %s from pattern %s (confidence=%.2f)",
                job_id, pattern_id, pat.confidence,
            )
            if on_auto_created:
                try:
                    on_auto_created(pat, job_id)
                except Exception:
                    pass
        else:
            logger.warning("Auto-cron creation failed: %s", parsed.get("error"))
    except Exception as exc:
        logger.warning("Failed to parse cronjob response: %s", exc)
