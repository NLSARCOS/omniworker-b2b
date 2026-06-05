"""Objective decomposition — the spine of the orchestrator's initiative.

Turns a high-level objective ("lanzá la campaña X") into concrete subtasks
written to the kanban, **without a human carding them**. This is what makes the
orchestrator a director (decides what to do) rather than a dispatcher (runs what
already exists).

Flow
----
1. An *objective* task lands on the board (title/body starts with ``OBJETIVO:``
   / ``OBJECTIVE:``, or it's flagged ``kind=objective``).
2. The daemon hands it here. :func:`decompose_objective` asks the planner agent
   (injectable ``planner_fn``) for subtasks and :func:`parse_subtasks` extracts
   them robustly (JSON array preferred; numbered/bulleted text as fallback).
3. :func:`seed_objective` writes each subtask to the kanban as a child of the
   objective and marks the objective as decomposed.

``planner_fn`` is injected so the decomposition logic is unit-testable without a
live model.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

_OBJECTIVE_PREFIXES = ("objetivo:", "objective:", "goal:", "meta:")

_PLANNER_PROMPT = (
    "Descomponé este OBJETIVO en entre 2 y 6 subtareas concretas y accionables. "
    "Devolvé SOLO un array JSON de objetos con las claves 'title' (corta, "
    "imperativa) y 'body' (1-2 frases de contexto). Sin texto adicional.\n\n"
    "OBJETIVO: {goal}"
)


def is_objective(title: str = "", body: str = "", kind: str = "") -> bool:
    """True when a task should be decomposed instead of delegated directly."""
    if (kind or "").strip().lower() == "objective":
        return True
    head = f"{title or ''} {body or ''}".strip().lower()
    return any(head.startswith(p) for p in _OBJECTIVE_PREFIXES)


def _strip_objective_prefix(text: str) -> str:
    low = (text or "").lstrip()
    for p in _OBJECTIVE_PREFIXES:
        if low.lower().startswith(p):
            return low[len(p):].strip()
    return (text or "").strip()


def parse_subtasks(text: str) -> List[Dict[str, str]]:
    """Extract ``[{title, body}]`` from a planner response.

    Tries a JSON array first (possibly fenced in ```), then falls back to
    numbered (``1. ...``) or bulleted (``- ...``) lines. Always returns a list
    (possibly empty); never raises.
    """
    if not text or not isinstance(text, str):
        return []

    # 1) JSON array (optionally inside a ``` fence).
    candidate = text.strip()
    fence = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", candidate, re.S)
    if fence:
        candidate = fence.group(1)
    else:
        bracket = re.search(r"(\[.*\])", candidate, re.S)
        if bracket:
            candidate = bracket.group(1)
    try:
        data = json.loads(candidate)
        if isinstance(data, list):
            out = []
            for item in data:
                if isinstance(item, dict) and item.get("title"):
                    out.append({"title": str(item["title"]).strip(),
                                "body": str(item.get("body", "") or "").strip()})
                elif isinstance(item, str) and item.strip():
                    out.append({"title": item.strip(), "body": ""})
            if out:
                return out
    except Exception:  # noqa: BLE001 — fall through to text parsing
        pass

    # 2) Numbered / bulleted lines.
    out: List[Dict[str, str]] = []
    for line in text.splitlines():
        m = re.match(r"\s*(?:\d+[.)]|[-*•])\s+(.*\S)", line)
        if m:
            out.append({"title": m.group(1).strip(), "body": ""})
    return out


def decompose_objective(
    goal: str,
    *,
    planner_fn: Callable[[str], str],
    max_subtasks: int = 6,
) -> List[Dict[str, str]]:
    """Ask the planner to break ``goal`` into subtasks. Returns ``[{title, body}]``."""
    clean_goal = _strip_objective_prefix(goal)
    try:
        response = planner_fn(_PLANNER_PROMPT.format(goal=clean_goal))
    except Exception as exc:  # noqa: BLE001
        logger.warning("planner_fn failed for objective %r: %s", clean_goal, exc)
        return []
    subtasks = parse_subtasks(response)
    return subtasks[:max_subtasks]


def seed_objective(
    kanban_conn,
    *,
    objective_id: Optional[str],
    goal: str,
    planner_fn: Callable[[str], str],
    created_by: str = "orchestrator-daemon",
) -> List[str]:
    """Decompose ``goal`` and write each subtask as a kanban child. Returns ids.

    Subtasks are linked under ``objective_id`` (when given) so the objective
    tracks its breakdown. Returns an empty list when decomposition yields
    nothing (the objective is left untouched for the operator to inspect).
    """
    subtasks = decompose_objective(goal, planner_fn=planner_fn)
    if not subtasks:
        logger.info("Objective %r produced no subtasks", goal)
        return []

    from omniworker_cli import kanban_db

    created: List[str] = []
    parents = [objective_id] if objective_id else []
    for st in subtasks:
        try:
            tid = kanban_db.create_task(
                kanban_conn,
                title=st["title"],
                body=st.get("body") or None,
                created_by=created_by,
                parents=parents,
            )
            created.append(tid)
        except Exception as exc:  # noqa: BLE001
            logger.warning("could not create subtask %r: %s", st.get("title"), exc)
    logger.info("Objective seeded %d subtasks: %s", len(created), created)
    return created
