"""External signal intake — initiative from the outside world (Objetivo 1, C6).

The orchestrator already decomposes objectives a human files. This closes the
loop: external sources (an incoming email, a calendar event, a webhook/Zapier)
turn into kanban tasks **with no human carding them**.

Integration seam
----------------
Any connector (email gateway, calendar sync, webhook handler) drops a normalized
signal as a JSON file into ``<OMNIWORKER_HOME>/signals/inbox/``:

    {"id": "...", "source": "email", "sender": "cliente@x.com",
     "subject": "Necesito un presupuesto", "body": "...", "ts": 169...}

The daemon polls that inbox each tick, decides whether each signal is actionable,
creates a kanban task for the actionable ones, and moves the file to
``signals/processed/`` (or ``signals/ignored/``). The connectors themselves stay
out of this module — it only needs normalized signals, so it's fully testable.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Phrases that mark a signal as a request worth acting on. Tuned for ES/EN.
_ACTIONABLE_HINTS = (
    "necesito", "necesitamos", "podrías", "podrian", "pueden", "quisiera",
    "presupuesto", "cotiz", "propuesta", "ayuda con", "solicito", "requiero",
    "agendar", "reunión", "reunion", "meeting", "schedule", "request",
    "can you", "could you", "i need", "please", "quote", "proposal",
)
# Signals that are clearly not requests (auto-replies, newsletters, noise).
_IGNORE_HINTS = (
    "unsubscribe", "no-reply", "noreply", "newsletter", "out of office",
    "fuera de la oficina", "respuesta automática", "do not reply",
)


def is_actionable(signal: Dict[str, Any]) -> bool:
    """Heuristic: does this external signal warrant a task?

    Actionable when it reads like a request (hint phrase or a question) and is
    not obvious noise. Conservative: when unsure, returns False (no task).
    """
    sender = str(signal.get("sender", "") or "").lower()
    text = f"{signal.get('subject', '') or ''} {signal.get('body', '') or ''}".lower()

    if any(h in sender for h in ("no-reply", "noreply", "mailer-daemon")):
        return False
    if any(h in text for h in _IGNORE_HINTS):
        return False
    if any(h in text for h in _ACTIONABLE_HINTS):
        return True
    # A direct question from a real sender is actionable too.
    return "?" in text and len(text.strip()) > 10


def signal_to_task(signal: Dict[str, Any]) -> Dict[str, str]:
    """Build a ``{title, body}`` task spec from a normalized signal."""
    source = str(signal.get("source", "señal") or "señal")
    subject = str(signal.get("subject", "") or "").strip()
    sender = str(signal.get("sender", "") or "").strip()
    body = str(signal.get("body", "") or "").strip()

    title = subject or _first_sentence(body) or f"Atender {source}"
    title = re.sub(r"\s+", " ", title)[:120]

    ctx_lines = [f"Origen: {source}"]
    if sender:
        ctx_lines.append(f"De: {sender}")
    if body:
        ctx_lines.append(f"\n{body}")
    return {"title": title, "body": "\n".join(ctx_lines)}


def _first_sentence(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    m = re.split(r"(?<=[.!?])\s", text, maxsplit=1)
    return m[0][:120] if m else text[:120]


def ingest_signal(
    kanban_conn,
    signal: Dict[str, Any],
    *,
    actionable_fn: Optional[Callable[[Dict[str, Any]], bool]] = None,
    created_by: str = "signal-intake",
) -> Optional[str]:
    """Create a kanban task from a signal when actionable. Returns task id or None.

    Idempotent on ``signal['id']`` so re-processing the same signal never
    duplicates a task.
    """
    decide = actionable_fn or is_actionable
    if not decide(signal):
        return None

    spec = signal_to_task(signal)
    sid = str(signal.get("id") or "").strip()
    from omniworker_cli import kanban_db

    try:
        return kanban_db.create_task(
            kanban_conn,
            title=spec["title"],
            body=spec["body"] or None,
            created_by=created_by,
            idempotency_key=f"signal-{sid}" if sid else None,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not create task from signal %s: %s", sid or "?", exc)
        return None


# ── inbox polling (the daemon seam) ──────────────────────────────────────────


def _signals_dir() -> Path:
    try:
        from omniworker_cli.config import get_omniworker_home

        base = get_omniworker_home()
    except Exception:  # noqa: BLE001
        base = Path(os.path.expanduser("~/.omniworker"))
    return base / "signals"


def poll_signal_inbox(
    kanban_conn,
    *,
    inbox_dir: Optional[Path] = None,
    actionable_fn: Optional[Callable[[Dict[str, Any]], bool]] = None,
    max_files: int = 20,
) -> List[str]:
    """Process JSON signals dropped in the inbox. Returns created task ids.

    Each file is read, ingested, then moved to ``processed/`` (task created) or
    ``ignored/`` (not actionable / bad file). Never raises.
    """
    base = (inbox_dir.parent if inbox_dir else _signals_dir())
    inbox = inbox_dir or (base / "inbox")
    processed = base / "processed"
    ignored = base / "ignored"
    for d in (inbox, processed, ignored):
        try:
            d.mkdir(parents=True, exist_ok=True)
        except Exception:  # noqa: BLE001
            return []

    created: List[str] = []
    files = sorted(inbox.glob("*.json"))[:max_files]
    for f in files:
        try:
            signal = json.loads(f.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 — bad file → ignore bucket
            logger.debug("bad signal file %s: %s", f.name, exc)
            _move(f, ignored)
            continue
        tid = ingest_signal(kanban_conn, signal, actionable_fn=actionable_fn)
        if tid:
            created.append(tid)
            _move(f, processed)
        else:
            _move(f, ignored)
    if created:
        logger.info("signal intake created %d task(s): %s", len(created), created)
    return created


def _move(f: Path, dest_dir: Path) -> None:
    try:
        dest = dest_dir / f"{int(time.time()*1000)}_{f.name}"
        f.rename(dest)
    except Exception as exc:  # noqa: BLE001
        logger.debug("could not move %s: %s", f.name, exc)
