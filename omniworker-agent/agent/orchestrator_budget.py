"""Budget guard + kill-switch — the safety rail for autonomous delegation.

An orchestrator that delegates to paid models in a loop, unattended, needs a
hard ceiling and an emergency stop. This module provides both:

* **Caps** (any combination; ``None`` = no cap):
    - ``max_delegations_per_day`` — exact count, always enforceable.
    - ``max_tokens_per_day``      — exact (tokens come back in the delegate result).
    - ``daily_usd``               — estimated from tokens × a per-model price map
      (override prices via ``orchestrator.budget.prices`` in config).
* **Kill-switch** — instant stop independent of caps:
    - env ``OMNIWORKER_ORCHESTRATOR_STOP`` truthy, OR
    - a file ``<OMNIWORKER_HOME>/orchestrator.STOP`` exists.

State is persisted to ``<OMNIWORKER_HOME>/orchestrator_budget.json`` and resets
automatically when the UTC date rolls over, so a restart does not reset the
day's spend.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Approximate USD per 1M tokens (input, output). Conservative defaults for the
# army's models; override via config ``orchestrator.budget.prices``. Unknown
# models fall back to ``_DEFAULT_PRICE``.
_DEFAULT_PRICE = (1.0, 3.0)
_PRICE_PER_MTOK: Dict[str, Tuple[float, float]] = {
    "kimi-k2": (0.60, 2.50),
    "kimi-k2-thinking": (0.60, 2.50),
    "kimi-k2-turbo-preview": (1.20, 5.00),
    "glm-5": (0.60, 2.20),
    "glm-4.5-flash": (0.10, 0.40),
    "glm-4-9b": (0.05, 0.20),
}


def _omniworker_home() -> Path:
    try:
        from omniworker_cli.config import get_omniworker_home

        return get_omniworker_home()
    except Exception:  # noqa: BLE001
        return Path(os.path.expanduser("~/.omniworker"))


def estimate_cost_usd(
    *, model: Optional[str], input_tokens: int, output_tokens: int,
    prices: Optional[Dict[str, Tuple[float, float]]] = None,
) -> float:
    table = {**_PRICE_PER_MTOK, **(prices or {})}
    pin, pout = table.get((model or "").strip(), _DEFAULT_PRICE)
    return (input_tokens / 1_000_000.0) * pin + (output_tokens / 1_000_000.0) * pout


@dataclass
class BudgetConfig:
    max_delegations_per_day: Optional[int] = None
    max_tokens_per_day: Optional[int] = None
    daily_usd: Optional[float] = None
    prices: Dict[str, Tuple[float, float]] = field(default_factory=dict)

    @classmethod
    def from_config(cls, cfg: Optional[Dict[str, Any]] = None) -> "BudgetConfig":
        """Build from the ``orchestrator.budget`` block of config.yaml."""
        b = ((cfg or {}).get("orchestrator") or {}).get("budget") or {}
        prices_raw = b.get("prices") or {}
        prices = {}
        for k, v in prices_raw.items():
            try:
                prices[str(k)] = (float(v[0]), float(v[1]))
            except Exception:  # noqa: BLE001
                continue
        return cls(
            max_delegations_per_day=_opt_int(b.get("max_delegations_per_day")),
            max_tokens_per_day=_opt_int(b.get("max_tokens_per_day")),
            daily_usd=_opt_float(b.get("daily_usd")),
            prices=prices,
        )


def _opt_int(v):
    try:
        return int(v) if v is not None else None
    except Exception:  # noqa: BLE001
        return None


def _opt_float(v):
    try:
        return float(v) if v is not None else None
    except Exception:  # noqa: BLE001
        return None


class BudgetGuard:
    """Daily-rolling spend tracker with caps and an emergency kill-switch."""

    def __init__(self, config: Optional[BudgetConfig] = None, *, state_path: Optional[Path] = None):
        self.config = config or BudgetConfig()
        self._path = state_path or (_omniworker_home() / "orchestrator_budget.json")
        self._lock = threading.Lock()
        self._state = self._load()

    # ── state ────────────────────────────────────────────────────────────────

    @staticmethod
    def _today() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _load(self) -> Dict[str, Any]:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            if data.get("date") == self._today():
                return data
        except Exception:  # noqa: BLE001 — missing/corrupt → fresh day
            pass
        return {"date": self._today(), "delegations": 0, "tokens": 0, "cost_usd": 0.0}

    def _persist(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._state), encoding="utf-8")
            os.replace(tmp, self._path)
        except Exception as exc:  # noqa: BLE001 — never crash the loop on persistence
            logger.debug("budget persist failed: %s", exc)

    def _roll_if_new_day(self) -> None:
        if self._state.get("date") != self._today():
            self._state = {"date": self._today(), "delegations": 0, "tokens": 0, "cost_usd": 0.0}

    # ── kill-switch ────────────────────────────────────────────────────────────

    def killed(self) -> bool:
        if str(os.environ.get("OMNIWORKER_ORCHESTRATOR_STOP", "")).strip().lower() in ("1", "true", "yes", "on"):
            return True
        try:
            return (_omniworker_home() / "orchestrator.STOP").exists()
        except Exception:  # noqa: BLE001
            return False

    # ── enforcement ────────────────────────────────────────────────────────────

    def allow(self) -> Tuple[bool, str]:
        """Return ``(ok, reason)``. ``ok`` False blocks the next delegation."""
        if self.killed():
            return False, "kill-switch activo (OMNIWORKER_ORCHESTRATOR_STOP / orchestrator.STOP)"
        with self._lock:
            self._roll_if_new_day()
            c = self.config
            s = self._state
            if c.max_delegations_per_day is not None and s["delegations"] >= c.max_delegations_per_day:
                return False, f"tope de delegaciones/día alcanzado ({c.max_delegations_per_day})"
            if c.max_tokens_per_day is not None and s["tokens"] >= c.max_tokens_per_day:
                return False, f"tope de tokens/día alcanzado ({c.max_tokens_per_day})"
            if c.daily_usd is not None and s["cost_usd"] >= c.daily_usd:
                return False, f"tope de gasto/día alcanzado (${c.daily_usd:.2f})"
            return True, "ok"

    def record(self, *, model: Optional[str] = None, input_tokens: int = 0,
               output_tokens: int = 0, cost_usd: Optional[float] = None) -> None:
        """Record one completed delegation's usage and persist."""
        tokens = int(input_tokens or 0) + int(output_tokens or 0)
        if cost_usd is None:
            cost_usd = estimate_cost_usd(
                model=model, input_tokens=int(input_tokens or 0),
                output_tokens=int(output_tokens or 0), prices=self.config.prices,
            )
        with self._lock:
            self._roll_if_new_day()
            self._state["delegations"] += 1
            self._state["tokens"] += tokens
            self._state["cost_usd"] = round(self._state["cost_usd"] + float(cost_usd or 0.0), 6)
            self._persist()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            self._roll_if_new_day()
            return dict(self._state)

    # ── operator controls ──────────────────────────────────────────────────────

    def trip(self) -> None:
        """Activate the file kill-switch (operator emergency stop)."""
        try:
            (_omniworker_home() / "orchestrator.STOP").write_text("stopped", encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            logger.warning("could not write kill-switch: %s", exc)

    def reset_killswitch(self) -> None:
        try:
            p = _omniworker_home() / "orchestrator.STOP"
            if p.exists():
                p.unlink()
        except Exception as exc:  # noqa: BLE001
            logger.debug("could not clear kill-switch: %s", exc)
