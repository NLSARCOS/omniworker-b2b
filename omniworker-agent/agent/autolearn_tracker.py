"""Shared, persistent autolearning tracker (D5).

Recurring-pattern detection that **survives restarts** and is shared by both the
autonomous daemon and the interactive chat. Before this, the daemon counted task
patterns in memory (lost on restart) and the chat didn't learn at all.

A "pattern" is a normalized task/request bucket (e.g. ``"traducir contrato
legal"``). When the same bucket is seen ``threshold`` times and no skill covers
it yet, :meth:`should_propose` returns True exactly once — the caller surfaces a
"create a skill for this?" proposal (daemon → operator notify; chat → user note).

State is a small JSON map persisted at
``<OMNIWORKER_HOME>/autolearn_patterns.json``.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def _default_path() -> Path:
    try:
        from omniworker_cli.config import get_omniworker_home

        return get_omniworker_home() / "autolearn_patterns.json"
    except Exception:  # noqa: BLE001
        return Path(os.path.expanduser("~/.omniworker/autolearn_patterns.json"))


def bucket_of(text: str) -> str:
    """Stable bucket from free text: first 4 significant lowercased words."""
    words = [w for w in re.sub(r"[^\w\s]", " ", (text or "").lower()).split() if len(w) > 2]
    return " ".join(words[:4]) or "general"


class AutolearnTracker:
    """Persistent count of how often each task pattern has been seen."""

    def __init__(self, *, path: Optional[Path] = None):
        self._path = path or _default_path()
        self._lock = threading.Lock()
        self._state = self._load()

    def _load(self) -> Dict[str, Dict]:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:  # noqa: BLE001 — missing/corrupt → fresh
            pass
        return {}

    def _persist(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._state), encoding="utf-8")
            os.replace(tmp, self._path)
        except Exception as exc:  # noqa: BLE001
            logger.debug("autolearn persist failed: %s", exc)

    def record(self, text: str) -> int:
        """Record one occurrence of the pattern in ``text``; return its new count."""
        bucket = bucket_of(text)
        with self._lock:
            entry = self._state.setdefault(bucket, {"count": 0, "proposed": False})
            entry["count"] += 1
            self._persist()
            return entry["count"]

    def should_propose(self, text: str, *, threshold: int = 3) -> bool:
        """True exactly once, when the pattern reaches ``threshold`` un-proposed."""
        bucket = bucket_of(text)
        with self._lock:
            entry = self._state.get(bucket)
            if not entry or entry.get("proposed"):
                return False
            if entry.get("count", 0) >= threshold:
                entry["proposed"] = True
                self._persist()
                return True
            return False

    def record_and_check(self, text: str, *, threshold: int = 3) -> bool:
        """Convenience: record one occurrence and report if it should propose now."""
        self.record(text)
        return self.should_propose(text, threshold=threshold)

    def count(self, text: str) -> int:
        return self._state.get(bucket_of(text), {}).get("count", 0)
