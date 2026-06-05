#!/usr/bin/env python3
"""
Memory Tool Module - Persistent Curated Memory

Provides bounded, file-backed memory that persists across sessions. Two stores:
  - MEMORY.md: agent's personal notes and observations (environment facts, project
    conventions, tool quirks, things learned)
  - USER.md: what the agent knows about the user (preferences, communication style,
    expectations, workflow habits)

Both are injected into the system prompt as a frozen snapshot at session start.
Mid-session writes update files on disk immediately (durable) but do NOT change
the system prompt -- this preserves the prefix cache for the entire session.
The snapshot refreshes on the next session start.

Entry delimiter: § (section sign). Entries can be multiline.
Character limits (not tokens) because char counts are model-independent.

Design:
- Single `memory` tool with action parameter: add, replace, remove, read
- replace/remove use short unique substring matching (not full text or IDs)
- Behavioral guidance lives in the tool schema description
- Frozen snapshot pattern: system prompt is stable, tool responses show live state
"""

import json
import logging
import math
import os
import re
import tempfile
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from omniworker_constants import get_omniworker_home
from typing import Dict, Any, List, Optional

from utils import atomic_replace

# fcntl is Unix-only; on Windows use msvcrt for file locking
msvcrt = None
try:
    import fcntl
except ImportError:
    fcntl = None
    try:
        import msvcrt
    except ImportError:
        pass

logger = logging.getLogger(__name__)

# Where memory files live — resolved dynamically so profile overrides
# (OMNIWORKER_HOME env var changes) are always respected.  The old module-level
# constant was cached at import time and could go stale if a profile switch
# happened after the first import.
def get_memory_dir() -> Path:
    """Return the profile-scoped memories directory."""
    return get_omniworker_home() / "memories"

ENTRY_DELIMITER = "\n§\n"

# Per-entry metadata is stored as a discreet inline HTML comment on the first
# line of the entry's persisted form, e.g.:
#
#     <!-- ts=2026-06-03 imp=0.7 -->
#     User prefers dark mode
#
# This keeps MEMORY.md/USER.md readable, survives round-trips, and is fully
# backward compatible: legacy entries with no comment load fine (treated as
# ts=unknown / imp=0.5).  The in-memory entry lists always hold the CLEAN
# content (no comment) so substring matching, dedup, and char accounting are
# unchanged; metadata lives in a parallel dict keyed by clean content.
_META_COMMENT_RE = re.compile(
    r"^<!--\s*(?:ts=(?P<ts>[0-9]{4}-[0-9]{2}-[0-9]{2}|unknown))?\s*"
    r"(?:imp=(?P<imp>[01](?:\.[0-9]+)?))?\s*-->\s*\n?",
    re.IGNORECASE,
)

# Defaults for entries that have no metadata (legacy or unspecified).
_DEFAULT_IMPORTANCE = 0.5
# Importance assigned to LLM-consolidated entries.
_CONSOLIDATED_IMPORTANCE = 0.6
# Capacity fraction at which add() attempts consolidation instead of rejecting.
_CONSOLIDATION_THRESHOLD = 0.85
# Fraction of top-scored entries preserved verbatim during consolidation.
_PRESERVE_TOP_FRACTION = 0.30
# Recency half-life (days) for the importance × recency score.
_SCORE_HALF_LIFE_DAYS = 30.0
# Rough chars-per-token estimate for token-aware limits (no tokenizer dep).
_CHARS_PER_TOKEN = 4


def _today_str() -> str:
    """Return today's date as an ISO string (YYYY-MM-DD)."""
    return date.today().isoformat()


def _parse_entry_metadata(raw: str) -> tuple:
    """Split a persisted entry into (clean_content, meta_dict).

    ``meta_dict`` is ``{"ts": <iso str or None>, "imp": <float>}``.  Legacy
    entries (no metadata comment) get ts=None and imp=_DEFAULT_IMPORTANCE.
    """
    m = _META_COMMENT_RE.match(raw)
    if not m:
        return raw, {"ts": None, "imp": _DEFAULT_IMPORTANCE}

    ts = m.group("ts")
    if ts and ts.lower() == "unknown":
        ts = None
    imp_str = m.group("imp")
    try:
        imp = float(imp_str) if imp_str is not None else _DEFAULT_IMPORTANCE
    except (TypeError, ValueError):
        imp = _DEFAULT_IMPORTANCE
    imp = max(0.0, min(1.0, imp))
    clean = raw[m.end():]
    return clean, {"ts": ts, "imp": imp}


def _format_entry_with_metadata(content: str, meta: Optional[Dict[str, Any]]) -> str:
    """Render an entry for persistence with its metadata comment prefix.

    Entries without metadata (None) are written as-is for cleanliness.
    """
    if not meta:
        return content
    ts = meta.get("ts")
    imp = meta.get("imp", _DEFAULT_IMPORTANCE)
    ts_part = ts if ts else "unknown"
    return f"<!-- ts={ts_part} imp={imp:g} -->\n{content}"


def _entry_score(meta: Optional[Dict[str, Any]], now: Optional[date] = None) -> float:
    """Score = importance * 0.5^(days_since_ts / half_life).

    Entries with no timestamp are treated as old (score = importance applied
    to an effectively zero recency factor) so they sort to the end.
    """
    if not meta:
        return 0.0
    imp = meta.get("imp", _DEFAULT_IMPORTANCE)
    ts = meta.get("ts")
    if not ts:
        # No timestamp -> goes to the very end regardless of importance.
        return -1.0
    try:
        entry_date = datetime.strptime(ts, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return -1.0
    today = now or date.today()
    days = max(0, (today - entry_date).days)
    recency = math.pow(0.5, days / _SCORE_HALF_LIFE_DAYS)
    return imp * recency


# ---------------------------------------------------------------------------
# Memory content scanning — lightweight check for injection/exfiltration
# in content that gets injected into the system prompt.
# ---------------------------------------------------------------------------

_MEMORY_THREAT_PATTERNS = [
    # Prompt injection
    (r'ignore\s+(previous|all|above|prior)\s+instructions', "prompt_injection"),
    (r'you\s+are\s+now\s+', "role_hijack"),
    (r'do\s+not\s+tell\s+the\s+user', "deception_hide"),
    (r'system\s+prompt\s+override', "sys_prompt_override"),
    (r'disregard\s+(your|all|any)\s+(instructions|rules|guidelines)', "disregard_rules"),
    (r'act\s+as\s+(if|though)\s+you\s+(have\s+no|don\'t\s+have)\s+(restrictions|limits|rules)', "bypass_restrictions"),
    # Exfiltration via curl/wget with secrets
    (r'curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)', "exfil_curl"),
    (r'wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)', "exfil_wget"),
    (r'cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)', "read_secrets"),
    # Persistence via shell rc
    (r'authorized_keys', "ssh_backdoor"),
    (r'\$HOME/\.ssh|\~/\.ssh', "ssh_access"),
    (r'\$HOME/\.omniworker/\.env|\~/\.omniworker/\.env', "omniworker_env"),
]

# Subset of invisible chars for injection detection
_INVISIBLE_CHARS = {
    '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff',
    '\u202a', '\u202b', '\u202c', '\u202d', '\u202e',
}


def _scan_memory_content(content: str) -> Optional[str]:
    """Scan memory content for injection/exfil patterns. Returns error string if blocked."""
    # Check invisible unicode
    for char in _INVISIBLE_CHARS:
        if char in content:
            return f"Blocked: content contains invisible unicode character U+{ord(char):04X} (possible injection)."

    # Check threat patterns
    for pattern, pid in _MEMORY_THREAT_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            return f"Blocked: content matches threat pattern '{pid}'. Memory entries are injected into the system prompt and must not contain injection or exfiltration payloads."

    return None


ENGRAM_URL = "http://127.0.0.1:7437"

def _engram_request(method: str, path: str, data: Optional[Dict[str, Any]] = None) -> Optional[Any]:
    url = f"{ENGRAM_URL}{path}"
    req = urllib.request.Request(url, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
        json_data = json.dumps(data).encode("utf-8")
        req.data = json_data
    try:
        with urllib.request.urlopen(req, timeout=2.0) as response:
            if response.status >= 200 and response.status < 300:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else {}
    except Exception as e:
        logger.debug(f"[Engram] REST request {method} {path} failed: {e}")
    return None

class MemoryStore:
    """
    Bounded curated memory with file persistence. One instance per AIAgent.

    Maintains two parallel states:
      - _system_prompt_snapshot: frozen at load time, used for system prompt injection.
        Never mutated mid-session. Keeps prefix cache stable.
      - memory_entries / user_entries: live state, mutated by tool calls, persisted to disk.
        Tool responses always reflect this live state.
    """

    def __init__(
        self,
        memory_char_limit: int = 2200,
        user_char_limit: int = 1375,
        memory_token_limit: Optional[int] = None,
        user_token_limit: Optional[int] = None,
    ):
        self.memory_entries: List[str] = []
        self.user_entries: List[str] = []
        self.memory_char_limit = memory_char_limit
        self.user_char_limit = user_char_limit
        # Optional token-aware limits.  When set (non-null), the effective
        # budget is measured in estimated tokens (chars / _CHARS_PER_TOKEN)
        # rather than raw chars.  Null = use the char limits above.
        self.memory_token_limit = memory_token_limit
        self.user_token_limit = user_token_limit
        # Per-entry metadata, keyed by clean entry content:
        #   {content: {"ts": "YYYY-MM-DD" | None, "imp": float}}
        self.memory_meta: Dict[str, Dict[str, Any]] = {}
        self.user_meta: Dict[str, Dict[str, Any]] = {}
        # Frozen snapshot for system prompt -- set once at load_from_disk()
        self._system_prompt_snapshot: Dict[str, str] = {"memory": "", "user": ""}

    def load_from_disk(self):
        """Load entries from Engram server, with fallback to MEMORY.md and USER.md."""
        mem_dir = get_memory_dir()
        mem_dir.mkdir(parents=True, exist_ok=True)

        engram_loaded = False
        obs = _engram_request("GET", "/observations/recent?project=omniworker&limit=100")
        if obs is not None and isinstance(obs, list):
            try:
                mem_list = []
                user_content = ""
                for o in obs:
                    if o.get("topic_key") == "user-profile" or o.get("type") == "user-profile":
                        user_content = o.get("content") or ""
                    else:
                        mem_list.append(o)
                
                # Sort facts ascending by ID
                mem_list.sort(key=lambda x: x.get("id", 0))
                self.memory_entries = [o.get("content", "").strip() for o in mem_list if o.get("content", "").strip()]
                self.user_entries = [e.strip() for e in user_content.split(ENTRY_DELIMITER) if e.strip()]
                
                engram_loaded = True
                logger.info("[Engram] Successfully loaded memory entries from local server.")
            except Exception as e:
                logger.warning(f"[Engram] Parsing observations failed, falling back to disk: {e}")

        if not engram_loaded:
            self.memory_entries, self.memory_meta = self._read_file_with_meta(mem_dir / "MEMORY.md")
            self.user_entries, self.user_meta = self._read_file_with_meta(mem_dir / "USER.md")
        else:
            # Engram-sourced entries carry no inline metadata; assign defaults.
            self.memory_meta = {e: {"ts": None, "imp": _DEFAULT_IMPORTANCE} for e in self.memory_entries}
            self.user_meta = {e: {"ts": None, "imp": _DEFAULT_IMPORTANCE} for e in self.user_entries}

        # Deduplicate entries (preserves order, keeps first occurrence)
        self.memory_entries = list(dict.fromkeys(self.memory_entries))
        self.user_entries = list(dict.fromkeys(self.user_entries))

        # Capture frozen snapshot for system prompt injection
        self._system_prompt_snapshot = {
            "memory": self._render_block("memory", self.memory_entries),
            "user": self._render_block("user", self.user_entries),
        }

    @staticmethod
    @contextmanager
    def _file_lock(path: Path):
        """Acquire an exclusive file lock for read-modify-write safety.

        Uses a separate .lock file so the memory file itself can still be
        atomically replaced via os.replace().
        """
        lock_path = path.with_suffix(path.suffix + ".lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)

        if fcntl is None and msvcrt is None:
            yield
            return

        if msvcrt and (not lock_path.exists() or lock_path.stat().st_size == 0):
            lock_path.write_text(" ", encoding="utf-8")

        fd = open(lock_path, "r+" if msvcrt else "a+", encoding="utf-8")
        try:
            if fcntl:
                fcntl.flock(fd, fcntl.LOCK_EX)
            else:
                fd.seek(0)
                msvcrt.locking(fd.fileno(), msvcrt.LK_LOCK, 1)
            yield
        finally:
            if fcntl:
                fcntl.flock(fd, fcntl.LOCK_UN)
            elif msvcrt:
                try:
                    fd.seek(0)
                    msvcrt.locking(fd.fileno(), msvcrt.LK_UNLCK, 1)
                except (OSError, IOError):
                    pass
            fd.close()

    @staticmethod
    def _path_for(target: str) -> Path:
        mem_dir = get_memory_dir()
        if target == "user":
            return mem_dir / "USER.md"
        return mem_dir / "MEMORY.md"

    def _reload_target(self, target: str):
        """Re-read entries from disk into in-memory state.

        Called under file lock to get the latest state before mutating.
        """
        fresh, fresh_meta = self._read_file_with_meta(self._path_for(target))
        fresh = list(dict.fromkeys(fresh))  # deduplicate
        self._set_entries(target, fresh)
        # Keep metadata only for surviving entries.
        self._set_meta(target, {e: fresh_meta.get(e, {"ts": None, "imp": _DEFAULT_IMPORTANCE}) for e in fresh})

    def save_to_disk(self, target: str):
        """Persist entries to the appropriate file. Called after every mutation."""
        get_memory_dir().mkdir(parents=True, exist_ok=True)
        self._write_file(
            self._path_for(target),
            self._entries_for(target),
            self._meta_for(target),
        )

    def _entries_for(self, target: str) -> List[str]:
        if target == "user":
            return self.user_entries
        return self.memory_entries

    def _set_entries(self, target: str, entries: List[str]):
        if target == "user":
            self.user_entries = entries
        else:
            self.memory_entries = entries

    def _meta_for(self, target: str) -> Dict[str, Dict[str, Any]]:
        if target == "user":
            return self.user_meta
        return self.memory_meta

    def _set_meta(self, target: str, meta: Dict[str, Dict[str, Any]]):
        if target == "user":
            self.user_meta = meta
        else:
            self.memory_meta = meta

    def _get_entry_meta(self, target: str, content: str) -> Dict[str, Any]:
        """Return metadata for an entry, defaulting to legacy values."""
        return self._meta_for(target).get(
            content, {"ts": None, "imp": _DEFAULT_IMPORTANCE}
        )

    def _token_limit(self, target: str) -> Optional[int]:
        if target == "user":
            return self.user_token_limit
        return self.memory_token_limit

    def _size(self, text: str, target: str) -> int:
        """Measure ``text`` in the unit (chars or est. tokens) used by ``target``.

        When a token limit is configured for the target, sizes are estimated
        tokens (chars // _CHARS_PER_TOKEN); otherwise raw chars.
        """
        if self._token_limit(target) is not None:
            return len(text) // _CHARS_PER_TOKEN
        return len(text)

    def _char_count(self, target: str) -> int:
        """Current usage of ``target`` in its effective unit (chars or tokens)."""
        entries = self._entries_for(target)
        if not entries:
            return 0
        return self._size(ENTRY_DELIMITER.join(entries), target)

    def _char_limit(self, target: str) -> int:
        """Effective limit for ``target``.

        Token-aware when ``memory_token_limit`` / ``user_token_limit`` is set
        (default null = the historical char limits).
        """
        tok = self._token_limit(target)
        if tok is not None:
            return tok
        if target == "user":
            return self.user_char_limit
        return self.memory_char_limit

    def add(self, target: str, content: str, importance: float = _DEFAULT_IMPORTANCE) -> Dict[str, Any]:
        """Append a new entry with timestamp + importance metadata.

        When the resulting store would exceed the configured limit, first
        attempts an LLM-driven consolidation of the lowest-scored entries
        (auto-summarisation) to make room.  Only if consolidation is
        unavailable or fails does it fall back to rejecting the entry.
        """
        content = content.strip()
        if not content:
            return {"success": False, "error": "Content cannot be empty."}

        try:
            importance = float(importance)
        except (TypeError, ValueError):
            importance = _DEFAULT_IMPORTANCE
        importance = max(0.0, min(1.0, importance))

        # Scan for injection/exfiltration before accepting
        scan_error = _scan_memory_content(content)
        if scan_error:
            return {"success": False, "error": scan_error}

        # Try writing to Engram
        try:
            if target == "user":
                obs = _engram_request("GET", "/observations/recent?project=omniworker&limit=100")
                existing_profile = None
                if obs is not None and isinstance(obs, list):
                    existing_profile = next((o for o in obs if o.get("topic_key") == "user-profile" or o.get("type") == "user-profile"), None)
                
                current_profile_content = existing_profile.get("content") or "" if existing_profile else ""
                current_entries = [e.strip() for e in current_profile_content.split(ENTRY_DELIMITER) if e.strip()]
                if content not in current_entries:
                    current_entries.append(content)
                new_profile_content = ENTRY_DELIMITER.join(current_entries)
                
                if existing_profile:
                    _engram_request("PATCH", f"/observations/{existing_profile['id']}", {"content": new_profile_content})
                else:
                    _engram_request("POST", "/observations", {
                        "session_id": "desktop-session-default",
                        "type": "user-profile",
                        "title": "User Profile",
                        "content": new_profile_content,
                        "topic_key": "user-profile",
                        "scope": "personal"
                    })
            else:
                _engram_request("POST", "/observations", {
                    "session_id": "desktop-session-default",
                    "type": "fact",
                    "title": content[:40] + ("..." if len(content) > 40 else ""),
                    "content": content,
                    "project": "omniworker",
                    "scope": "personal"
                })
        except Exception as e:
            logger.warning(f"[Engram] add observation failed: {e}")

        # Always replicate to flat files
        with self._file_lock(self._path_for(target)):
            # Re-read from disk under lock to pick up writes from other sessions
            self._reload_target(target)

            entries = self._entries_for(target)
            limit = self._char_limit(target)

            # Reject exact duplicates
            if content in entries:
                return self._success_response(target, "Entry already exists (no duplicate added).")

            # Calculate what the new total would be
            new_entries = entries + [content]
            new_total = self._size(ENTRY_DELIMITER.join(new_entries), target)

            consolidation_note = None
            # Consolidate proactively once the prospective total crosses 85%
            # of the budget — don't wait until the add is fully blocked.  This
            # keeps headroom so the agent keeps learning instead of stalling.
            if new_total > limit * _CONSOLIDATION_THRESHOLD:
                # Try auto-consolidation before giving up.  This compresses the
                # lowest-scored entries into compact high-level facts, freeing
                # room so the agent keeps learning instead of stalling at 100%.
                consolidated = self._maybe_consolidate(target)
                if not consolidated:
                    # Consolidation unavailable/failed.  Only block if the add
                    # actually overflows the hard limit; otherwise let it pass
                    # (we're between 85% and 100%, still room).
                    if new_total > limit:
                        current = self._char_count(target)
                        return {
                            "success": False,
                            "error": (
                                f"Memory at {current:,}/{limit:,} chars. "
                                f"Adding this entry ({len(content)} chars) would exceed the limit. "
                                f"Replace or remove existing entries first."
                            ),
                            "current_entries": entries,
                            "usage": f"{current:,}/{limit:,}",
                        }
                else:
                    consolidation_note = consolidated
                    # Re-read post-consolidation state and re-check the budget.
                    entries = self._entries_for(target)
                    new_entries = entries + [content]
                    new_total = self._size(ENTRY_DELIMITER.join(new_entries), target)

                if new_total > limit:
                    current = self._char_count(target)
                    return {
                        "success": False,
                        "error": (
                            f"Memory at {current:,}/{limit:,} chars after consolidation. "
                            f"Adding this entry ({len(content)} chars) would still exceed the limit. "
                            f"Replace or remove existing entries first."
                        ),
                        "current_entries": entries,
                        "usage": f"{current:,}/{limit:,}",
                    }

            entries.append(content)
            self._set_entries(target, entries)
            self._meta_for(target)[content] = {"ts": _today_str(), "imp": importance}
            self.save_to_disk(target)

        msg = "Entry added."
        if consolidation_note:
            msg = f"Entry added. {consolidation_note}"
        return self._success_response(target, msg)

    def _maybe_consolidate(self, target: str) -> Optional[str]:
        """Compress the lowest-scored entries into compact high-level facts.

        Preserves the top ~30% of entries (by importance × recency) verbatim
        and asks an auxiliary LLM to consolidate the rest into fewer, denser
        facts.  The consolidated entries are tagged ``imp=0.6`` with today's
        timestamp.

        Returns a short human-readable note on success, or ``None`` when
        consolidation could not run or made no progress (caller then falls
        back to the legacy reject-on-overflow behaviour).  This method NEVER
        loses data without a replacement: the current file is backed up to a
        ``.bak`` sibling before any in-place replacement, and any failure
        leaves the store untouched.
        """
        try:
            from agent.auxiliary_client import call_llm
        except Exception as e:
            logger.debug(f"[Memory] consolidation unavailable (no call_llm): {e}")
            return None

        entries = list(self._entries_for(target))
        if len(entries) < 3:
            # Nothing meaningful to consolidate.
            return None

        meta = self._meta_for(target)
        today = date.today()
        scored = sorted(
            entries,
            key=lambda e: _entry_score(meta.get(e, {"ts": None, "imp": _DEFAULT_IMPORTANCE}), today),
            reverse=True,
        )
        keep_count = max(1, int(round(len(scored) * _PRESERVE_TOP_FRACTION)))
        preserved = scored[:keep_count]
        to_consolidate = scored[keep_count:]
        if len(to_consolidate) < 2:
            # Not enough low-value entries to bother compressing.
            return None

        store_name = "user profile" if target == "user" else "agent memory"
        joined = "\n---\n".join(to_consolidate)
        prompt = (
            f"You are consolidating a bounded {store_name} that is nearly full. "
            "Below are the lowest-priority entries. Merge and compress them into "
            "FEWER, higher-level facts that preserve the durable information while "
            "dropping redundancy and ephemeral detail. Keep each consolidated fact "
            "to a single concise line. Do NOT invent facts not present below. Do NOT "
            "include any greeting, preamble, or commentary. Output ONLY the "
            "consolidated facts, one per line, separated by a line containing just "
            "'---'.\n\nEntries to consolidate:\n\n" + joined
        )

        try:
            response = call_llm(
                task="compression",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
            )
            raw = response.choices[0].message.content
            if not isinstance(raw, str):
                raw = str(raw) if raw else ""
            raw = raw.strip()
        except Exception as e:
            logger.warning(f"[Memory] consolidation LLM call failed: {e}")
            return None

        if not raw:
            logger.warning("[Memory] consolidation returned empty content; skipping.")
            return None

        # Parse the consolidated facts.
        consolidated = [c.strip() for c in raw.split("---")]
        consolidated = [c for c in consolidated if c]
        if not consolidated:
            logger.warning("[Memory] consolidation produced no usable facts; skipping.")
            return None

        # Reject if any consolidated fact trips the safety scanner — never
        # inject unvetted LLM output into the system-prompt-bound store.
        for c in consolidated:
            if _scan_memory_content(c):
                logger.warning("[Memory] consolidation output failed safety scan; skipping.")
                return None

        # Sanity: consolidation must actually shrink the consolidated set.
        before_size = self._size(ENTRY_DELIMITER.join(to_consolidate), target)
        after_size = self._size(ENTRY_DELIMITER.join(consolidated), target)
        if after_size >= before_size:
            logger.info("[Memory] consolidation did not reduce size; skipping.")
            return None

        # Back up the current file before replacing anything, so a crash mid
        # write can never lose data without a recoverable copy on disk.
        try:
            path = self._path_for(target)
            if path.exists():
                bak = path.with_suffix(path.suffix + ".bak")
                bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        except (OSError, IOError) as e:
            logger.warning(f"[Memory] could not write consolidation backup: {e}")
            return None

        # Build the new entry list: preserved (verbatim) + consolidated (new
        # metadata).  Preserve original ordering of the kept entries.
        kept_set = set(preserved)
        new_entries = [e for e in entries if e in kept_set]
        new_meta: Dict[str, Dict[str, Any]] = {e: meta.get(e, {"ts": None, "imp": _DEFAULT_IMPORTANCE}) for e in new_entries}
        ts = _today_str()
        for c in consolidated:
            if c in new_meta:
                continue
            new_entries.append(c)
            new_meta[c] = {"ts": ts, "imp": _CONSOLIDATED_IMPORTANCE}

        # Deduplicate while preserving order.
        new_entries = list(dict.fromkeys(new_entries))
        self._set_entries(target, new_entries)
        self._set_meta(target, {e: new_meta.get(e, {"ts": None, "imp": _DEFAULT_IMPORTANCE}) for e in new_entries})
        self.save_to_disk(target)

        logger.info(
            "[Memory] consolidated %d entries into %d (target=%s).",
            len(to_consolidate), len(consolidated), target,
        )
        return f"Consolidated {len(to_consolidate)} low-priority entries into {len(consolidated)} to free space."

    def replace(self, target: str, old_text: str, new_content: str) -> Dict[str, Any]:
        """Find entry containing old_text substring, replace it with new_content."""
        old_text = old_text.strip()
        new_content = new_content.strip()
        if not old_text:
            return {"success": False, "error": "old_text cannot be empty."}
        if not new_content:
            return {"success": False, "error": "new_content cannot be empty. Use 'remove' to delete entries."}

        # Scan replacement content for injection/exfiltration
        scan_error = _scan_memory_content(new_content)
        if scan_error:
            return {"success": False, "error": scan_error}

        # Try writing to Engram
        try:
            if target == "user":
                obs = _engram_request("GET", "/observations/recent?project=omniworker&limit=100")
                existing_profile = None
                if obs is not None and isinstance(obs, list):
                    existing_profile = next((o for o in obs if o.get("topic_key") == "user-profile" or o.get("type") == "user-profile"), None)
                
                if existing_profile:
                    current_profile_content = existing_profile.get("content") or ""
                    current_entries = [e.strip() for e in current_profile_content.split(ENTRY_DELIMITER) if e.strip()]
                    matches = [i for i, e in enumerate(current_entries) if old_text in e]
                    if matches:
                        current_entries[matches[0]] = new_content
                        new_profile_content = ENTRY_DELIMITER.join(current_entries)
                        _engram_request("PATCH", f"/observations/{existing_profile['id']}", {"content": new_profile_content})
            else:
                obs = _engram_request("GET", "/observations/recent?project=omniworker&limit=100")
                if obs is not None and isinstance(obs, list):
                    matching_obs = next((o for o in obs if o.get("type") == "fact" and old_text in (o.get("content") or "")), None)
                    if matching_obs:
                        _engram_request("PATCH", f"/observations/{matching_obs['id']}", {
                            "content": new_content,
                            "title": new_content[:40] + ("..." if len(new_content) > 40 else "")
                        })
        except Exception as e:
            logger.warning(f"[Engram] replace observation failed: {e}")

        # Always replicate to flat files
        with self._file_lock(self._path_for(target)):
            self._reload_target(target)

            entries = self._entries_for(target)
            matches = [(i, e) for i, e in enumerate(entries) if old_text in e]

            if not matches:
                return {"success": False, "error": f"No entry matched '{old_text}'."}

            if len(matches) > 1:
                # If all matches are identical (exact duplicates), operate on the first one
                unique_texts = {e for _, e in matches}
                if len(unique_texts) > 1:
                    previews = [e[:80] + ("..." if len(e) > 80 else "") for _, e in matches]
                    return {
                        "success": False,
                        "error": f"Multiple entries matched '{old_text}'. Be more specific.",
                        "matches": previews,
                    }
                # All identical -- safe to replace just the first

            idx = matches[0][0]
            limit = self._char_limit(target)

            # Check that replacement doesn't blow the budget
            test_entries = entries.copy()
            test_entries[idx] = new_content
            new_total = self._size(ENTRY_DELIMITER.join(test_entries), target)

            if new_total > limit:
                return {
                    "success": False,
                    "error": (
                        f"Replacement would put memory at {new_total:,}/{limit:,} chars. "
                        f"Shorten the new content or remove other entries first."
                    ),
                }

            old_content = entries[idx]
            entries[idx] = new_content
            self._set_entries(target, entries)
            # Carry forward the old entry's importance, refresh its timestamp.
            meta = self._meta_for(target)
            old_meta = meta.pop(old_content, None)
            meta[new_content] = {
                "ts": _today_str(),
                "imp": old_meta.get("imp", _DEFAULT_IMPORTANCE) if old_meta else _DEFAULT_IMPORTANCE,
            }
            self.save_to_disk(target)

        return self._success_response(target, "Entry replaced.")

    def remove(self, target: str, old_text: str) -> Dict[str, Any]:
        """Remove the entry containing old_text substring."""
        old_text = old_text.strip()
        if not old_text:
            return {"success": False, "error": "old_text cannot be empty."}

        # Try writing to Engram
        try:
            if target == "user":
                obs = _engram_request("GET", "/observations/recent?project=omniworker&limit=100")
                existing_profile = None
                if obs is not None and isinstance(obs, list):
                    existing_profile = next((o for o in obs if o.get("topic_key") == "user-profile" or o.get("type") == "user-profile"), None)
                
                if existing_profile:
                    current_profile_content = existing_profile.get("content") or ""
                    current_entries = [e.strip() for e in current_profile_content.split(ENTRY_DELIMITER) if e.strip()]
                    matches = [i for i, e in enumerate(current_entries) if old_text in e]
                    if matches:
                        current_entries.pop(matches[0])
                        new_profile_content = ENTRY_DELIMITER.join(current_entries)
                        _engram_request("PATCH", f"/observations/{existing_profile['id']}", {"content": new_profile_content})
            else:
                obs = _engram_request("GET", "/observations/recent?project=omniworker&limit=100")
                if obs is not None and isinstance(obs, list):
                    matching_obs = next((o for o in obs if o.get("type") == "fact" and old_text in (o.get("content") or "")), None)
                    if matching_obs:
                        _engram_request("DELETE", f"/observations/{matching_obs['id']}?hard=true")
        except Exception as e:
            logger.warning(f"[Engram] remove observation failed: {e}")

        # Always replicate to flat files
        with self._file_lock(self._path_for(target)):
            self._reload_target(target)

            entries = self._entries_for(target)
            matches = [(i, e) for i, e in enumerate(entries) if old_text in e]

            if not matches:
                return {"success": False, "error": f"No entry matched '{old_text}'."}

            if len(matches) > 1:
                # If all matches are identical (exact duplicates), remove the first one
                unique_texts = {e for _, e in matches}
                if len(unique_texts) > 1:
                    previews = [e[:80] + ("..." if len(e) > 80 else "") for _, e in matches]
                    return {
                        "success": False,
                        "error": f"Multiple entries matched '{old_text}'. Be more specific.",
                        "matches": previews,
                    }
                # All identical -- safe to remove just the first

            idx = matches[0][0]
            removed = entries.pop(idx)
            self._set_entries(target, entries)
            self._meta_for(target).pop(removed, None)
            self.save_to_disk(target)

        return self._success_response(target, "Entry removed.")

    def format_for_system_prompt(self, target: str) -> Optional[str]:
        """
        Return the frozen snapshot for system prompt injection.

        This returns the state captured at load_from_disk() time, NOT the live
        state. Mid-session writes do not affect this. This keeps the system
        prompt stable across all turns, preserving the prefix cache.

        Returns None if the snapshot is empty (no entries at load time).
        """
        block = self._system_prompt_snapshot.get(target, "")
        return block if block else None

    # -- Internal helpers --

    def _success_response(self, target: str, message: str = None) -> Dict[str, Any]:
        entries = self._entries_for(target)
        current = self._char_count(target)
        limit = self._char_limit(target)
        pct = min(100, int((current / limit) * 100)) if limit > 0 else 0

        resp = {
            "success": True,
            "target": target,
            "entries": entries,
            "usage": f"{pct}% — {current:,}/{limit:,} chars",
            "entry_count": len(entries),
        }
        if message:
            resp["message"] = message
        return resp

    def _render_block(self, target: str, entries: List[str]) -> str:
        """Render a system prompt block with header and usage indicator.

        Entries are ordered by ``importance * 0.5^(days_since_ts / 30)``
        (descending) so the most important and recent facts are injected
        first.  Entries without a timestamp sort to the end.  The original
        list is not mutated.
        """
        if not entries:
            return ""

        today = date.today()
        ordered = sorted(
            entries,
            key=lambda e: _entry_score(self._get_entry_meta(target, e), today),
            reverse=True,
        )

        limit = self._char_limit(target)
        content = ENTRY_DELIMITER.join(ordered)
        current = self._size(content, target)
        pct = min(100, int((current / limit) * 100)) if limit > 0 else 0

        if target == "user":
            header = f"USER PROFILE (who the user is) [{pct}% — {current:,}/{limit:,} chars]"
        else:
            header = f"MEMORY (your personal notes) [{pct}% — {current:,}/{limit:,} chars]"

        separator = "═" * 46
        return f"{separator}\n{header}\n{separator}\n{content}"

    @staticmethod
    def _read_file(path: Path) -> List[str]:
        """Read a memory file and split into clean entries (metadata stripped).

        Kept for backward compatibility (tests and external callers use it).
        Use :meth:`_read_file_with_meta` when metadata is needed.

        No file locking needed: _write_file uses atomic rename, so readers
        always see either the previous complete file or the new complete file.
        """
        entries, _ = MemoryStore._read_file_with_meta(path)
        return entries

    @staticmethod
    def _read_file_with_meta(path: Path) -> tuple:
        """Read a memory file, returning (clean_entries, meta_by_content).

        Each persisted entry may carry a leading ``<!-- ts=… imp=… -->``
        comment; it is parsed off here so the in-memory entry text stays
        clean.  Legacy entries without a comment get default metadata.
        """
        if not path.exists():
            return [], {}
        try:
            raw = path.read_text(encoding="utf-8")
        except (OSError, IOError):
            return [], {}

        if not raw.strip():
            return [], {}

        # Use ENTRY_DELIMITER for consistency with _write_file. Splitting by "§"
        # alone would incorrectly split entries that contain "§" in their content.
        entries: List[str] = []
        meta_by_content: Dict[str, Dict[str, Any]] = {}
        for chunk in raw.split(ENTRY_DELIMITER):
            chunk = chunk.strip("\n")
            if not chunk.strip():
                continue
            clean, meta = _parse_entry_metadata(chunk)
            clean = clean.strip()
            if not clean:
                continue
            entries.append(clean)
            meta_by_content[clean] = meta
        return entries, meta_by_content

    @staticmethod
    def _write_file(path: Path, entries: List[str], meta_by_content: Optional[Dict[str, Dict[str, Any]]] = None):
        """Write entries to a memory file using atomic temp-file + rename.

        Each entry is persisted with its metadata comment prefix when
        metadata is available for it.

        Previous implementation used open("w") + flock, but "w" truncates the
        file *before* the lock is acquired, creating a race window where
        concurrent readers see an empty file. Atomic rename avoids this:
        readers always see either the old complete file or the new one.
        """
        meta_by_content = meta_by_content or {}
        rendered = [
            _format_entry_with_metadata(e, meta_by_content.get(e))
            for e in entries
        ]
        content = ENTRY_DELIMITER.join(rendered) if rendered else ""
        try:
            # Write to temp file in same directory (same filesystem for atomic rename)
            fd, tmp_path = tempfile.mkstemp(
                dir=str(path.parent), suffix=".tmp", prefix=".mem_"
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(content)
                    f.flush()
                    os.fsync(f.fileno())
                atomic_replace(tmp_path, path)
            except BaseException:
                # Clean up temp file on any failure
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise
        except (OSError, IOError) as e:
            raise RuntimeError(f"Failed to write memory file {path}: {e}")


def memory_tool(
    action: str,
    target: str = "memory",
    content: str = None,
    old_text: str = None,
    importance: float = _DEFAULT_IMPORTANCE,
    store: Optional[MemoryStore] = None,
) -> str:
    """
    Single entry point for the memory tool. Dispatches to MemoryStore methods.

    Returns JSON string with results.
    """
    if store is None:
        return tool_error("Memory is not available. It may be disabled in config or this environment.", success=False)

    if target not in {"memory", "user"}:
        return tool_error(f"Invalid target '{target}'. Use 'memory' or 'user'.", success=False)

    if action == "add":
        if not content:
            return tool_error("Content is required for 'add' action.", success=False)
        result = store.add(target, content, importance=importance)

    elif action == "replace":
        if not old_text:
            return tool_error("old_text is required for 'replace' action.", success=False)
        if not content:
            return tool_error("content is required for 'replace' action.", success=False)
        result = store.replace(target, old_text, content)

    elif action == "remove":
        if not old_text:
            return tool_error("old_text is required for 'remove' action.", success=False)
        result = store.remove(target, old_text)

    else:
        return tool_error(f"Unknown action '{action}'. Use: add, replace, remove", success=False)

    return json.dumps(result, ensure_ascii=False)


def check_memory_requirements() -> bool:
    """Memory tool has no external requirements -- always available."""
    return True


# =============================================================================
# OpenAI Function-Calling Schema
# =============================================================================

MEMORY_SCHEMA = {
    "name": "memory",
    "description": (
        "Save durable information to persistent memory that survives across sessions. "
        "Memory is injected into future turns, so keep it compact and focused on facts "
        "that will still matter later.\n\n"
        "WHEN TO SAVE (do this proactively, don't wait to be asked):\n"
        "- User corrects you or says 'remember this' / 'don't do that again'\n"
        "- User shares a preference, habit, or personal detail (name, role, timezone, coding style)\n"
        "- You discover something about the environment (OS, installed tools, project structure)\n"
        "- You learn a convention, API quirk, or workflow specific to this user's setup\n"
        "- You identify a stable fact that will be useful again in future sessions\n\n"
        "PRIORITY: User preferences and corrections > environment facts > procedural knowledge. "
        "The most valuable memory prevents the user from having to repeat themselves.\n\n"
        "Do NOT save task progress, session outcomes, completed-work logs, or temporary TODO "
        "state to memory; use session_search to recall those from past transcripts.\n"
        "If you've discovered a new way to do something, solved a problem that could be "
        "necessary later, save it as a skill with the skill tool.\n\n"
        "TWO TARGETS:\n"
        "- 'user': who the user is -- name, role, preferences, communication style, pet peeves\n"
        "- 'memory': your notes -- environment facts, project conventions, tool quirks, lessons learned\n\n"
        "ACTIONS: add (new entry), replace (update existing -- old_text identifies it), "
        "remove (delete -- old_text identifies it).\n\n"
        "SKIP: trivial/obvious info, things easily re-discovered, raw data dumps, and temporary task state."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add", "replace", "remove"],
                "description": "The action to perform."
            },
            "target": {
                "type": "string",
                "enum": ["memory", "user"],
                "description": "Which memory store: 'memory' for personal notes, 'user' for user profile."
            },
            "content": {
                "type": "string",
                "description": "The entry content. Required for 'add' and 'replace'."
            },
            "old_text": {
                "type": "string",
                "description": "Short unique substring identifying the entry to replace or remove."
            },
            "importance": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": (
                    "Optional importance score (0.0-1.0, default 0.5) for an 'add'. "
                    "Higher = surfaced earlier in the system prompt and protected "
                    "from automatic consolidation. Use >0.7 for durable user "
                    "preferences/corrections, ~0.5 for general facts, <0.3 for "
                    "low-stakes details."
                ),
            },
        },
        "required": ["action", "target"],
    },
}


# --- Registry ---
from tools.registry import registry, tool_error

registry.register(
    name="memory",
    toolset="memory",
    schema=MEMORY_SCHEMA,
    handler=lambda args, **kw: memory_tool(
        action=args.get("action", ""),
        target=args.get("target", "memory"),
        content=args.get("content"),
        old_text=args.get("old_text"),
        importance=args.get("importance", _DEFAULT_IMPORTANCE),
        store=kw.get("store")),
    check_fn=check_memory_requirements,
    emoji="🧠",
)




