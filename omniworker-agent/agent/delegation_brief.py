"""Delegation briefs in, structured summaries out.

Two small, pure helpers that keep the orchestrator↔worker contract clean:

* :func:`build_brief` — a worker gets *objective + minimal context + success
  criterion + expected output*, never the orchestrator's conversation history.
* :func:`extract_summary` — the orchestrator integrates a *structured summary*,
  not the worker's raw transcript. Parses ``delegate_task``'s JSON result.
"""

from __future__ import annotations

import json
from typing import Any, Optional


def build_brief(
    *,
    goal: str,
    context: Optional[str] = None,
    success_criterion: Optional[str] = None,
    output_format: str = "Resumen estructurado: qué hiciste, resultado, y próximos pasos si los hay.",
) -> str:
    """Compose a tight delegation brief. No orchestrator history leaks in."""
    lines = [f"## Objetivo\n{(goal or '').strip()}"]
    if context and context.strip():
        lines.append(f"## Contexto necesario\n{context.strip()}")
    lines.append(
        "## Criterio de éxito\n"
        + (success_criterion.strip() if success_criterion else
           "Completar el objetivo y reportar el resultado de forma verificable.")
    )
    lines.append(f"## Formato de salida esperado\n{output_format.strip()}")
    return "\n\n".join(lines)


def extract_summary(result: Any, *, max_len: int = 2000) -> str:
    """Pull a clean summary string from a ``delegate_task`` result.

    ``delegate_task`` returns a JSON string of task entries each carrying a
    ``summary``. We concatenate those. Non-JSON results pass through (trimmed).
    Never raises.
    """
    if not isinstance(result, str):
        result = str(result or "")
    text = result.strip()
    try:
        data = json.loads(text)
    except Exception:  # noqa: BLE001 — plain-text summary
        return _truncate(text, max_len)

    entries = data if isinstance(data, list) else [data]
    summaries = []
    for e in entries:
        if isinstance(e, dict) and e.get("summary"):
            summaries.append(str(e["summary"]).strip())
    if summaries:
        return _truncate("\n\n".join(summaries), max_len)
    return _truncate(text, max_len)


def _truncate(s: str, n: int) -> str:
    s = s or ""
    return s if len(s) <= n else s[: n - 1] + "…"
