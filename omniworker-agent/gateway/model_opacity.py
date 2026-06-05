"""Model opacity — the single redaction boundary toward desktop/front/SaaS.

The agent army runs on specific provider/model pairs (Kimi K2, GLM-5, …). That
is **infrastructure**. The product surface shows *roles* — "Agente de Marketing
está trabajando" — never the model behind it. This module is the one place that
strips infrastructure fields out of any payload headed to a user-facing surface.

Why one module
--------------
If every agent/event builder had to remember to omit ``model``/``provider``, a
leak is one forgotten field away. Instead, callers at the gateway boundary run
their outbound payload through :func:`strip_model_info` once. Inward flow keeps
full fidelity; outward flow is redacted here.

What it removes
---------------
``model``, ``provider``, ``base_url``, ``api_key``, ``api_mode``,
``fallback_model``, ``model_family`` — recursively, in dicts and lists.

What it can add
---------------
When given an agent registry mapping, it can replace an internal agent id with
its ``display.name`` so the surface shows "Agente de Marketing" instead of
``marketer`` (or worse, ``glm-5``).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Optional

logger = logging.getLogger(__name__)

# Infrastructure keys that must never cross the boundary to a user surface.
SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "model",
        "provider",
        "base_url",
        "api_key",
        "api_mode",
        "fallback_model",
        "model_family",
        # common alternate spellings seen across event builders
        "model_name",
        "provider_name",
        "effective_model",
        "override_provider",
        "override_base_url",
        "override_api_key",
    }
)

# Keys that hold an agent id we may want to humanise into a display name.
_AGENT_ID_KEYS: frozenset[str] = frozenset(
    {"agent", "agent_type", "agent_id", "assignee", "role_id"}
)


def strip_model_info(
    payload: Any,
    *,
    extra_keys: Optional[Iterable[str]] = None,
    display_map: Optional[Dict[str, str]] = None,
    _depth: int = 0,
) -> Any:
    """Return a redacted copy of ``payload`` safe to send to a user surface.

    * Removes every key in :data:`SENSITIVE_KEYS` (plus ``extra_keys``) at any
      nesting depth, in dicts and lists.
    * When ``display_map`` is provided, replaces agent-id values (for keys in
      :data:`_AGENT_ID_KEYS`) with their human display name.

    The input is never mutated — a new structure is returned. Non-container
    inputs pass through unchanged.
    """
    if _depth > 64:  # pathological nesting guard
        return payload

    sensitive = SENSITIVE_KEYS
    if extra_keys:
        sensitive = sensitive | frozenset(extra_keys)

    if isinstance(payload, dict):
        out: Dict[str, Any] = {}
        for key, value in payload.items():
            if key in sensitive:
                continue
            if display_map and key in _AGENT_ID_KEYS and isinstance(value, str):
                out[key] = display_map.get(value, value)
            else:
                out[key] = strip_model_info(
                    value,
                    extra_keys=extra_keys,
                    display_map=display_map,
                    _depth=_depth + 1,
                )
        return out

    if isinstance(payload, (list, tuple)):
        seq = [
            strip_model_info(
                item, extra_keys=extra_keys, display_map=display_map, _depth=_depth + 1
            )
            for item in payload
        ]
        return type(payload)(seq) if isinstance(payload, tuple) else seq

    return payload


def build_display_map(registry=None) -> Dict[str, str]:
    """Build an ``agent_id -> display name`` map from the agent registry.

    Lazy-imports the registry so this module stays usable in contexts where the
    registry isn't loaded. Returns an empty map on any failure (degrade to raw
    ids rather than crashing the delivery path).
    """
    try:
        from agent.agent_registry import load_agent_registry

        reg = registry or load_agent_registry()
        return {
            name: reg.get(name).display_name  # display.name or role
            for name in reg.names()
        }
    except Exception as exc:  # noqa: BLE001 — delivery must never crash on this
        logger.debug("build_display_map failed, using raw ids: %s", exc)
        return {}


def redact_for_user(payload: Any, *, humanise_agents: bool = True) -> Any:
    """Convenience: strip infra fields and humanise agent ids in one call.

    This is the function gateway delivery / status builders should call right
    before emitting an event to the desktop, front, or a messaging platform.
    """
    display_map = build_display_map() if humanise_agents else None
    return strip_model_info(payload, display_map=display_map)
