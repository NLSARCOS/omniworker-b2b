"""Run telemetry — what the orchestrator delegated, to whom, at what cost.

A director operating unattended needs an audit trail. Every delegation appends
one JSON line to ``<OMNIWORKER_HOME>/orchestrator_runs.jsonl`` with: timestamp,
task, agent/model, tokens, estimated cost, status, duration. :func:`read_runs`
returns the most recent records for an operator dashboard / CLI.

Append-only, best-effort: telemetry never blocks or crashes a delegation.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _default_path() -> Path:
    try:
        from omniworker_cli.config import get_omniworker_home

        return get_omniworker_home() / "orchestrator_runs.jsonl"
    except Exception:  # noqa: BLE001
        return Path(os.path.expanduser("~/.omniworker/orchestrator_runs.jsonl"))


def record_run(
    *,
    task_id: Optional[str],
    agent_type: str,
    model: Optional[str] = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_usd: float = 0.0,
    status: str = "completed",
    duration_s: float = 0.0,
    path: Optional[Path] = None,
) -> None:
    """Append one delegation record. Never raises."""
    event = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "agent_type": agent_type,
        "model": model,
        "input_tokens": int(input_tokens or 0),
        "output_tokens": int(output_tokens or 0),
        "cost_usd": round(float(cost_usd or 0.0), 6),
        "status": status,
        "duration_s": round(float(duration_s or 0.0), 3),
    }
    p = path or _default_path()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
    except Exception as exc:  # noqa: BLE001 — telemetry must never break the loop
        logger.debug("telemetry write failed: %s", exc)


def read_runs(limit: int = 50, *, path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Return the most recent ``limit`` run records (newest last). Never raises."""
    p = path or _default_path()
    try:
        lines = p.read_text(encoding="utf-8").splitlines()
    except Exception:  # noqa: BLE001 — missing file → no runs yet
        return []
    out: List[Dict[str, Any]] = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except Exception:  # noqa: BLE001
            continue
    return out


def summarize_runs(*, path: Optional[Path] = None) -> Dict[str, Any]:
    """Aggregate totals across all recorded runs (for a quick operator view)."""
    runs = read_runs(limit=10_000, path=path)
    total_cost = sum(r.get("cost_usd", 0.0) for r in runs)
    total_tokens = sum(r.get("input_tokens", 0) + r.get("output_tokens", 0) for r in runs)
    by_agent: Dict[str, int] = {}
    for r in runs:
        by_agent[r.get("agent_type", "?")] = by_agent.get(r.get("agent_type", "?"), 0) + 1
    return {
        "runs": len(runs),
        "total_cost_usd": round(total_cost, 6),
        "total_tokens": total_tokens,
        "by_agent": by_agent,
    }
