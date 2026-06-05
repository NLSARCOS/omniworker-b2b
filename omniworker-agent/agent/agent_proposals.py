"""Agent proposals — the 4th autolearning layer (the WHO).

OmniWorker already learns three things automatically:
  * Memory     — who the user is / current state          (memory review)
  * Skills     — HOW to do a class of task                (background review)
  * Cron jobs  — WHEN to run recurring tasks              (pattern engine)

This module adds the fourth: WHO should handle a class of task. When the
``general_agent`` fallback handles the same kind of task ``nudge_after_uses``
times, that is the signal that a *specialist* is missing. The orchestrator then
drafts a new agent type and asks the **operator** to approve it.

Hard rule: the orchestrator NEVER creates an agent unilaterally. It writes a
draft to ``agent_types_proposals.yaml`` and notifies the operator. A human moves
the draft into ``agent_types.yaml`` (or calls :func:`approve_proposal`). This
keeps the registry — the army's constitution — under human control while the
system still surfaces what it has learned.

Usage tracking is persisted in SQLite (the same agent DB) so counts survive
restarts. When no DB is supplied it degrades to an in-memory counter.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

_PROPOSALS_NAME = "agent_types_proposals.yaml"


def _proposals_path() -> Path:
    override = os.getenv("OMNIWORKER_AGENT_TYPES_DIR", "").strip()
    base = Path(override) if override else Path(__file__).resolve().parent.parent
    return base / _PROPOSALS_NAME


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class UsageTracker:
    """Counts general_agent invocations per task_type, persisted if possible."""

    conn: Optional[sqlite3.Connection] = None
    _mem: Dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.conn is not None:
            try:
                self.conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS general_agent_usage (
                        task_type TEXT PRIMARY KEY,
                        count INTEGER NOT NULL DEFAULT 0,
                        first_seen_at TEXT,
                        last_seen_at TEXT,
                        proposed INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
                self.conn.commit()
            except Exception as exc:  # noqa: BLE001
                logger.debug("UsageTracker: DB init failed, using memory: %s", exc)
                self.conn = None

    def record(self, task_type: str) -> int:
        """Increment and return the new count for ``task_type``."""
        task_type = (task_type or "unknown").strip().lower()
        if self.conn is not None:
            try:
                now = _now_iso()
                self.conn.execute(
                    """
                    INSERT INTO general_agent_usage (task_type, count, first_seen_at, last_seen_at)
                    VALUES (?, 1, ?, ?)
                    ON CONFLICT(task_type) DO UPDATE SET
                        count = count + 1,
                        last_seen_at = excluded.last_seen_at
                    """,
                    (task_type, now, now),
                )
                self.conn.commit()
                row = self.conn.execute(
                    "SELECT count FROM general_agent_usage WHERE task_type = ?",
                    (task_type,),
                ).fetchone()
                return int(row[0]) if row else 1
            except Exception as exc:  # noqa: BLE001
                logger.debug("UsageTracker.record DB failed: %s", exc)
        self._mem[task_type] = self._mem.get(task_type, 0) + 1
        return self._mem[task_type]

    def already_proposed(self, task_type: str) -> bool:
        task_type = (task_type or "unknown").strip().lower()
        if self.conn is not None:
            try:
                row = self.conn.execute(
                    "SELECT proposed FROM general_agent_usage WHERE task_type = ?",
                    (task_type,),
                ).fetchone()
                return bool(row and row[0])
            except Exception as exc:  # noqa: BLE001
                logger.debug("UsageTracker.already_proposed DB failed: %s", exc)
        return self._mem.get(f"__proposed__{task_type}", 0) == 1

    def mark_proposed(self, task_type: str) -> None:
        task_type = (task_type or "unknown").strip().lower()
        if self.conn is not None:
            try:
                self.conn.execute(
                    "UPDATE general_agent_usage SET proposed = 1 WHERE task_type = ?",
                    (task_type,),
                )
                self.conn.commit()
                return
            except Exception as exc:  # noqa: BLE001
                logger.debug("UsageTracker.mark_proposed DB failed: %s", exc)
        self._mem[f"__proposed__{task_type}"] = 1


def _suggest_provider_model(task_type: str) -> Dict[str, str]:
    """Heuristic starter provider/model for a proposed agent.

    Conservative defaults the operator can tune. Research/analysis-flavoured
    work leans on Kimi's long context + thinking; the rest defaults to GLM-5.
    """
    t = task_type.lower()
    if any(k in t for k in ("research", "investiga", "analy", "anali", "data", "report")):
        return {"provider": "kimi-coding", "model": "kimi-k2-thinking", "model_family": "kimi", "fallback_model": "kimi-k2"}
    if any(k in t for k in ("browser", "scrap", "web", "navig")):
        return {"provider": "opencode-go", "model": "glm-4.5-flash", "model_family": "glm", "fallback_model": "glm-4-9b"}
    return {"provider": "zai", "model": "glm-5", "model_family": "glm", "fallback_model": "glm-4-9b"}


def _suggest_toolset(task_type: str) -> List[str]:
    t = task_type.lower()
    if any(k in t for k in ("research", "web", "investiga")):
        return ["web", "browser", "vision"]
    if any(k in t for k in ("data", "analy", "anali", "report")):
        return ["code_exec", "file", "web"]
    if any(k in t for k in ("dev", "code", "bug", "feature")):
        return ["terminal", "file", "code_exec"]
    return ["file", "web", "terminal"]


def propose_agent(
    task_type: str,
    *,
    examples: Optional[List[str]] = None,
    usage_count: int = 0,
    notify_operator: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """Draft a new specialist agent and stage it for operator approval.

    Writes a YAML entry under ``agent_types_proposals.yaml`` (NOT the live
    registry) and notifies the operator. Never edits ``agent_types.yaml``.
    """
    task_type = (task_type or "unknown").strip().lower()
    slug = _slugify(task_type) + "_agent"
    spec = _suggest_provider_model(task_type)
    toolset = _suggest_toolset(task_type)

    proposal = {
        "proposed_at": _now_iso(),
        "trigger": {
            "reason": "general_agent_recurrence",
            "task_type": task_type,
            "usage_count": usage_count,
            "examples": (examples or [])[-3:],
        },
        "draft": {
            "name": slug,
            "role": f"Especialista en {task_type}",
            "provider": spec["provider"],
            "model": spec["model"],
            "fallback_model": spec["fallback_model"],
            "model_family": spec["model_family"],
            "toolset": toolset,
            "system_prompt": "prompts/worker_base.md",
            "display": {"name": f"Agente {task_type.title()}", "icon": "✨"},
        },
        "status": "pending_operator_approval",
    }

    _append_proposal(slug, proposal)

    msg = (
        f"🧩 Patrón recurrente detectado: '{task_type}' manejado por general_agent "
        f"{usage_count} veces. Propongo crear el agente '{slug}' "
        f"({spec['provider']}/{spec['model']}, toolset {toolset}). "
        f"Draft en {_PROPOSALS_NAME}. Aprobá para moverlo a agent_types.yaml."
    )
    if notify_operator:
        try:
            notify_operator(msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("notify_operator failed: %s", exc)
    else:
        logger.warning("[operator-notify] %s", msg)

    return proposal


def maybe_propose(
    task_type: str,
    tracker: UsageTracker,
    *,
    nudge_after_uses: int = 5,
    examples: Optional[List[str]] = None,
    notify_operator: Optional[Callable[[str], None]] = None,
) -> Optional[Dict[str, Any]]:
    """Record a general_agent use and propose a specialist when the threshold trips.

    Returns the proposal dict when one was created this call, else None. Only
    proposes once per task_type (idempotent via the tracker's ``proposed`` flag).
    """
    count = tracker.record(task_type)
    if count < nudge_after_uses:
        return None
    if tracker.already_proposed(task_type):
        return None
    proposal = propose_agent(
        task_type,
        examples=examples,
        usage_count=count,
        notify_operator=notify_operator,
    )
    tracker.mark_proposed(task_type)
    return proposal


def approve_proposal(slug: str) -> Dict[str, Any]:
    """Move an approved draft from proposals into the live registry.

    Appends the draft's ``agents:`` entry into ``agent_types.yaml`` and marks the
    proposal approved. This is the ONLY path that mutates the constitution, and
    it runs only on explicit operator action.
    """
    import yaml

    proposals = _load_proposals()
    entry = proposals.get("proposals", {}).get(slug)
    if not entry:
        return {"status": "not_found", "slug": slug}

    draft = entry.get("draft") or {}
    name = draft.pop("name", slug)

    reg_path = _registry_path()
    with open(reg_path, "r", encoding="utf-8") as fh:
        reg_data = yaml.safe_load(fh) or {}
    reg_data.setdefault("agents", {})
    if name in reg_data["agents"]:
        return {"status": "already_exists", "name": name}
    reg_data["agents"][name] = draft

    tmp = reg_path.with_suffix(reg_path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        yaml.safe_dump(reg_data, fh, sort_keys=False, allow_unicode=True)
    os.replace(tmp, reg_path)

    entry["status"] = "approved"
    entry["approved_at"] = _now_iso()
    _save_proposals(proposals)

    try:
        from agent.agent_registry import invalidate_cache

        invalidate_cache()
    except Exception:  # noqa: BLE001
        pass

    logger.info("Approved agent proposal '%s' → added to agent_types.yaml", name)
    return {"status": "approved", "name": name}


# ── proposal-file plumbing ──────────────────────────────────────────────────


def _registry_path() -> Path:
    override = os.getenv("OMNIWORKER_AGENT_TYPES_DIR", "").strip()
    base = Path(override) if override else Path(__file__).resolve().parent.parent
    return base / "agent_types.yaml"


def _load_proposals() -> Dict[str, Any]:
    import yaml

    path = _proposals_path()
    if not path.exists():
        return {"version": 1, "proposals": {}}
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {"version": 1, "proposals": {}}


def _save_proposals(data: Dict[str, Any]) -> None:
    import yaml

    path = _proposals_path()
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(
            "# agent_types_proposals.yaml — drafts awaiting operator approval.\n"
            "# Written by agent/agent_proposals.py. Approve via approve_proposal(slug).\n\n"
        )
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True, default_flow_style=False)
    os.replace(tmp, path)


def _append_proposal(slug: str, proposal: Dict[str, Any]) -> None:
    data = _load_proposals()
    data.setdefault("proposals", {})[slug] = proposal
    _save_proposals(data)


def _slugify(text: str) -> str:
    import re

    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s or "task"
