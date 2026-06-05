"""Model manager — the orchestrator's interface to the model catalog.

Only the orchestrator talks to the router. Worker agents never know their model
and never call here. This module handles the catalog-change flow:

    SaaS daily_model_check → router → orchestrator → model_manager

When the router reports a catalog change for a model family, the orchestrator
calls :func:`apply_catalog_change`. The severity decides what happens:

* ``minor`` (glm-5 → glm-5.1): write the override to ``model_overrides.yaml``
  immediately and invalidate the registry cache. Agents in that family pick up
  the new model on their next spawn — existing runs are untouched (model is
  fixed at spawn). The fallback_model covers the brief switch window.
* ``major`` (glm-6, new generation / deprecation without same-family successor):
  do NOT auto-apply. Record a pending proposal and notify the **operator** (you
  and your partner — not the end client). The operator approves, then calls
  :func:`apply_pending` to commit.

The "human" here is always the SaaS operator, surfaced via the configured
notifier. The end client never sees model changes — their "Agente de X" keeps
working on the fallback during any transition.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

SEVERITY_MINOR = "minor"
SEVERITY_MAJOR = "major"
_VALID_SEVERITY = (SEVERITY_MINOR, SEVERITY_MAJOR)


def _overrides_path() -> Path:
    override = os.getenv("OMNIWORKER_AGENT_TYPES_DIR", "").strip()
    base = Path(override) if override else Path(__file__).resolve().parent.parent
    return base / "model_overrides.yaml"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class CatalogChange:
    """A model-catalog change reported by the router."""

    family: str
    old_model: Optional[str]
    new_model: str
    severity: str
    source: str = "saas_daily_check"

    def validate(self) -> None:
        if not self.family:
            raise ValueError("CatalogChange.family is required")
        if not self.new_model:
            raise ValueError("CatalogChange.new_model is required")
        if self.severity not in _VALID_SEVERITY:
            raise ValueError(
                f"severity must be one of {_VALID_SEVERITY}, got {self.severity!r}"
            )


def _load_yaml(path: Path) -> Dict[str, Any]:
    import yaml

    if not path.exists():
        return {"version": 1, "overrides": {}}
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {"version": 1, "overrides": {}}


def _dump_yaml(path: Path, data: Dict[str, Any]) -> None:
    """Write the overrides file atomically, preserving key order."""
    import yaml

    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(
            "# omniworker-agent/model_overrides.yaml\n"
            "# Auto-managed by agent/model_manager.py — written by the orchestrator.\n"
            "# Do not hand-edit while the daemon is running.\n\n"
        )
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True, default_flow_style=False)
    os.replace(tmp, path)  # atomic on POSIX


def _write_override(change: CatalogChange) -> None:
    """Persist a family override and invalidate the registry cache."""
    path = _overrides_path()
    data = _load_yaml(path)
    overrides = data.setdefault("overrides", {})
    prev = None
    existing = overrides.get(change.family)
    if isinstance(existing, dict):
        prev = existing.get("active")
    overrides[change.family] = {
        "active": change.new_model,
        "previous": prev or change.old_model,
        "updated_at": _now_iso(),
        "source": change.source,
        "severity": change.severity,
    }
    _dump_yaml(path, data)

    # Drop the cached registry so the next spawn reads the new model.
    try:
        from agent.agent_registry import invalidate_cache

        invalidate_cache()
    except Exception as exc:  # noqa: BLE001
        logger.debug("Could not invalidate registry cache: %s", exc)

    logger.info(
        "Applied model override: family=%s %s -> %s (severity=%s)",
        change.family, prev or change.old_model, change.new_model, change.severity,
    )


# In-memory pending proposals (major changes awaiting operator approval).
# Keyed by family so a newer report supersedes an older pending one.
_pending: Dict[str, CatalogChange] = {}


def apply_catalog_change(
    change: CatalogChange,
    *,
    notify_operator: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """Handle one catalog change from the router.

    Returns a small status dict describing what happened. ``notify_operator`` is
    called with a human-readable message for major changes (defaults to logging
    when not supplied).
    """
    change.validate()

    if change.severity == SEVERITY_MINOR:
        _write_override(change)
        return {
            "status": "applied",
            "family": change.family,
            "active": change.new_model,
            "severity": SEVERITY_MINOR,
        }

    # major → stage for approval, notify operator, activate fallback meanwhile
    _pending[change.family] = change
    affected = _agents_in_family(change.family)
    msg = (
        f"🔔 Modelo nuevo disponible: {change.new_model} (familia {change.family}). "
        f"Agentes afectados: {', '.join(affected) or '—'}. "
        f"Mientras tanto usan su fallback. ¿Actualizar ahora o en la próxima "
        f"ventana de mantenimiento? (aprobar con apply_pending('{change.family}'))"
    )
    if notify_operator:
        try:
            notify_operator(msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("notify_operator failed: %s", exc)
    else:
        logger.warning("[operator-notify] %s", msg)

    return {
        "status": "pending_approval",
        "family": change.family,
        "proposed": change.new_model,
        "affected_agents": affected,
        "severity": SEVERITY_MAJOR,
    }


def apply_pending(family: str) -> Dict[str, Any]:
    """Commit a previously-staged major change after operator approval."""
    change = _pending.pop(family, None)
    if change is None:
        return {"status": "no_pending", "family": family}
    change.source = "operator_approved"
    _write_override(change)
    return {
        "status": "applied",
        "family": family,
        "active": change.new_model,
        "severity": SEVERITY_MAJOR,
    }


def list_pending() -> Dict[str, Dict[str, Any]]:
    """Return all major changes awaiting operator approval."""
    return {
        fam: {
            "proposed": ch.new_model,
            "old": ch.old_model,
            "source": ch.source,
        }
        for fam, ch in _pending.items()
    }


def _agents_in_family(family: str) -> list[str]:
    """Names of agents whose model_family matches (for operator notifications)."""
    try:
        from agent.agent_registry import load_agent_registry

        reg = load_agent_registry()
        out = []
        for name in reg.names():
            cfg = reg.get(name)
            if cfg.model_family == family:
                out.append(cfg.display_name)
        return out
    except Exception as exc:  # noqa: BLE001
        logger.debug("_agents_in_family failed: %s", exc)
        return []
