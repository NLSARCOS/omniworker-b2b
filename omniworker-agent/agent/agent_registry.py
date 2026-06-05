"""Agent Registry — the "database" of the OmniWorker agent army.

Loads ``agent_types.yaml`` (the constitution) and ``model_overrides.yaml`` (the
dynamic auto-update layer), and resolves a concrete :class:`AgentConfig` for any
agent type the orchestrator wants to delegate to.

Design contract
---------------
* **Model is fixed at spawn.** Specialist agents carry a hardcoded
  ``provider``/``model`` from the registry. ``general_agent`` is the only
  exception: the orchestrator classifies task complexity ONCE and the matching
  tier's model is locked for the whole run. There is never mid-task switching.
* **Overrides are family-scoped.** ``model_overrides.yaml`` maps a
  ``model_family`` (e.g. ``glm``) to an active model. When present, it shadows
  the registry's base model for every agent in that family. This is how the
  daily SaaS catalog check rolls a deprecated model forward without editing the
  constitution.
* **Opacity.** ``provider``/``model``/``base_url`` are infrastructure. Only the
  ``display`` block is ever surfaced to the desktop/front (see
  :func:`gateway.model_opacity.strip_model_info`).

Public API
----------
    load_agent_registry(path=None, *, force=False) -> AgentRegistry
    get_agent_for_task(task_type, *, complexity=None) -> AgentConfig
    AgentConfig.to_delegation_cfg() -> dict   # feeds _resolve_delegation_credentials

The :meth:`AgentConfig.to_delegation_cfg` output is exactly the ``cfg`` dict
shape that ``tools.delegate_tool._resolve_delegation_credentials`` consumes, so
the registry plugs straight into the existing delegation machinery — no changes
to the credential-resolution path are required.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Valid complexity tiers for general_agent's spawn-time model selection.
VALID_COMPLEXITY = ("simple", "medium", "complex")

_DEFAULT_REGISTRY_NAME = "agent_types.yaml"
_DEFAULT_OVERRIDES_NAME = "model_overrides.yaml"

# Process-wide cache. The registry is small and read often (every delegation),
# so we parse once and reuse. ``force=True`` or a changed mtime re-reads.
_cache_lock = threading.Lock()
_cached_registry: "Optional[AgentRegistry]" = None
_cached_mtimes: Dict[str, float] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Data model
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class AgentConfig:
    """Fully-resolved configuration for one agent type.

    ``provider``/``model`` are already override-resolved and, for
    ``general_agent``, already tier-resolved — so this object is ready to spawn.
    """

    name: str
    role: str
    provider: Optional[str]
    model: Optional[str]
    fallback_model: Optional[str]
    model_family: Optional[str]
    toolset: List[str]
    system_prompt: Optional[str] = None
    # Skills pre-loaded into the worker at spawn (registry ``skills:`` field).
    skills: List[str] = field(default_factory=list)
    # Behaviour flags
    context_protection: bool = False
    is_orchestrator: bool = False
    parallel_instances: int = 1
    sandbox: bool = False
    nudge_after_uses: int = 0
    max_iterations: int = 25
    output_format: str = "structured_summary"
    # User-facing metadata (the ONLY part allowed past the gateway boundary)
    display: Dict[str, Any] = field(default_factory=dict)
    # Bookkeeping: which complexity tier produced this config (general_agent)
    resolved_tier: Optional[str] = None
    # Provenance: did the model come from an override?
    overridden: bool = False

    @property
    def display_name(self) -> str:
        return str(self.display.get("name") or self.role or self.name)

    @property
    def visible_to_user(self) -> bool:
        # Default visible unless explicitly hidden (orchestrator/general_agent).
        return bool(self.display.get("visible_to_user", True))

    def to_delegation_cfg(self) -> Dict[str, Any]:
        """Return the ``cfg`` dict consumed by ``_resolve_delegation_credentials``.

        Keys mirror the ``delegation`` config block: provider/model resolve to
        base_url+api_key+api_mode through the runtime provider system.
        """
        return {
            "provider": self.provider,
            "model": self.model,
            # base_url / api_key / api_mode left unset → resolved from provider
            "base_url": None,
            "api_key": None,
            "api_mode": None,
        }


@dataclass
class AgentRegistry:
    """Parsed registry: a name→AgentConfig map plus raw metadata."""

    agents: Dict[str, "_RawAgent"]
    overrides: Dict[str, str]  # model_family -> active model
    defaults: Dict[str, Any]
    registry_path: Path

    def names(self) -> List[str]:
        return list(self.agents.keys())

    def has(self, name: str) -> bool:
        return name in self.agents

    def get(self, name: str, *, complexity: Optional[str] = None) -> AgentConfig:
        """Resolve a concrete :class:`AgentConfig` for ``name``.

        ``complexity`` only applies to agents whose ``model_selection`` is
        ``orchestrator_by_complexity`` (i.e. general_agent). Ignored otherwise.
        """
        raw = self.agents.get(name)
        if raw is None:
            raise KeyError(
                f"Unknown agent type '{name}'. Known: {sorted(self.agents)}"
            )
        return raw.resolve(self.overrides, self.defaults, complexity=complexity)


@dataclass
class _RawAgent:
    """Unresolved agent entry straight from YAML (pre-override, pre-tier)."""

    name: str
    data: Dict[str, Any]

    def resolve(
        self,
        overrides: Dict[str, str],
        defaults: Dict[str, Any],
        *,
        complexity: Optional[str] = None,
    ) -> AgentConfig:
        d = self.data
        provider = d.get("provider")
        model = d.get("model")
        model_family = d.get("model_family")
        resolved_tier: Optional[str] = None

        # ── Complexity-tier resolution (general_agent only) ──────────────────
        if d.get("model_selection") == "orchestrator_by_complexity":
            tiers = d.get("complexity_tiers") or {}
            tier = (complexity or d.get("default_tier") or "medium").strip().lower()
            if tier not in tiers:
                logger.warning(
                    "Agent '%s': complexity '%s' has no tier; falling back to '%s'",
                    self.name, tier, d.get("default_tier") or "medium",
                )
                tier = (d.get("default_tier") or "medium").strip().lower()
            tier_cfg = tiers.get(tier) or {}
            provider = tier_cfg.get("provider", provider)
            model = tier_cfg.get("model", model)
            resolved_tier = tier
            # Derive family from the tier's provider so overrides still apply.
            model_family = _family_for_provider(provider, fallback=model_family)

        # ── Family override resolution (auto-update layer) ───────────────────
        overridden = False
        if model_family and model_family in overrides:
            new_model = overrides[model_family]
            if new_model and new_model != model:
                logger.info(
                    "Agent '%s': model override %s -> %s (family=%s)",
                    self.name, model, new_model, model_family,
                )
                model = new_model
                overridden = True

        toolset = list(d.get("toolset") or [])
        display = dict(d.get("display") or {})

        return AgentConfig(
            name=self.name,
            role=str(d.get("role") or self.name),
            provider=provider,
            model=model,
            fallback_model=d.get("fallback_model"),
            model_family=model_family,
            toolset=toolset,
            system_prompt=d.get("system_prompt"),
            skills=list(d.get("skills") or []),
            context_protection=bool(d.get("context_protection", False)),
            is_orchestrator=bool(d.get("is_orchestrator", False)),
            parallel_instances=int(d.get("parallel_instances", 1) or 1),
            sandbox=bool(d.get("sandbox", False)),
            nudge_after_uses=int(d.get("nudge_after_uses", 0) or 0),
            max_iterations=int(d.get("max_iterations", defaults.get("max_iterations", 25)) or 25),
            output_format=str(d.get("output_format", defaults.get("output_format", "structured_summary"))),
            display=display,
            resolved_tier=resolved_tier,
            overridden=overridden,
        )


# Provider → model_family hint, used when general_agent's tier swaps provider.
_PROVIDER_FAMILY = {
    "zai": "glm",
    "opencode-go": "glm",   # aggregator most-commonly serves GLM here
    "kimi-coding": "kimi",
    "kimi-coding-cn": "kimi",
}


def _family_for_provider(provider: Optional[str], *, fallback: Optional[str]) -> Optional[str]:
    if not provider:
        return fallback
    return _PROVIDER_FAMILY.get(provider, fallback)


# ─────────────────────────────────────────────────────────────────────────────
# Loading
# ─────────────────────────────────────────────────────────────────────────────


def _default_registry_dir() -> Path:
    """Directory that holds agent_types.yaml — the omniworker-agent package root.

    This module lives at ``<root>/agent/agent_registry.py``; the registry sits
    at ``<root>/agent_types.yaml``. Allow an env override for packaged installs.
    """
    override = os.getenv("OMNIWORKER_AGENT_TYPES_DIR", "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent


def _read_yaml(path: Path) -> Dict[str, Any]:
    import yaml  # local import: keep module import-light

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict):
            raise ValueError(f"{path} did not parse to a mapping")
        return data
    except FileNotFoundError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface a clear config error
        raise ValueError(f"Failed to parse {path}: {exc}") from exc


def _load_overrides(path: Path) -> Dict[str, str]:
    """Read model_overrides.yaml → {family: active_model}. Missing file = {}."""
    if not path.exists():
        return {}
    try:
        data = _read_yaml(path)
    except Exception as exc:  # noqa: BLE001 — overrides must never hard-fail spawn
        logger.warning("Ignoring unreadable %s: %s", path, exc)
        return {}
    out: Dict[str, str] = {}
    for family, entry in (data.get("overrides") or {}).items():
        if isinstance(entry, dict):
            active = entry.get("active")
        else:
            active = entry  # allow shorthand `glm: glm-5.1`
        if active:
            out[str(family)] = str(active)
    return out


def load_agent_registry(
    path: Optional[str | Path] = None,
    *,
    overrides_path: Optional[str | Path] = None,
    force: bool = False,
) -> AgentRegistry:
    """Load (and cache) the agent registry.

    Re-reads when the file mtime changes or ``force=True``. Safe to call on
    every delegation — the cache makes the steady-state cost ~0.
    """
    global _cached_registry

    reg_path = Path(path) if path else _default_registry_dir() / _DEFAULT_REGISTRY_NAME
    ovr_path = (
        Path(overrides_path)
        if overrides_path
        else _default_registry_dir() / _DEFAULT_OVERRIDES_NAME
    )

    with _cache_lock:
        if not force and _cached_registry is not None:
            if _mtimes_unchanged(reg_path, ovr_path):
                return _cached_registry

        data = _read_yaml(reg_path)
        raw_agents = data.get("agents") or {}
        if not raw_agents:
            raise ValueError(f"{reg_path} has no 'agents' section")

        agents = {name: _RawAgent(name, body or {}) for name, body in raw_agents.items()}
        overrides = _load_overrides(ovr_path)
        defaults = data.get("defaults") or {}

        registry = AgentRegistry(
            agents=agents,
            overrides=overrides,
            defaults=defaults,
            registry_path=reg_path,
        )
        _cached_registry = registry
        _remember_mtimes(reg_path, ovr_path)
        logger.info(
            "Loaded agent registry: %d agents from %s (%d overrides)",
            len(agents), reg_path, len(overrides),
        )
        return registry


def _mtimes_unchanged(*paths: Path) -> bool:
    for p in paths:
        try:
            mt = p.stat().st_mtime
        except OSError:
            mt = -1.0
        if _cached_mtimes.get(str(p)) != mt:
            return False
    return True


def _remember_mtimes(*paths: Path) -> None:
    for p in paths:
        try:
            _cached_mtimes[str(p)] = p.stat().st_mtime
        except OSError:
            _cached_mtimes[str(p)] = -1.0


def invalidate_cache() -> None:
    """Drop the cached registry (e.g. after the orchestrator writes overrides)."""
    global _cached_registry
    with _cache_lock:
        _cached_registry = None
        _cached_mtimes.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Convenience top-level API
# ─────────────────────────────────────────────────────────────────────────────


def get_agent_for_task(
    task_type: str,
    *,
    complexity: Optional[str] = None,
    registry: Optional[AgentRegistry] = None,
) -> AgentConfig:
    """Return the resolved :class:`AgentConfig` for ``task_type``.

    Falls back to ``general_agent`` when ``task_type`` is unknown — exactly the
    orchestrator's "no specialist for this" path. ``complexity`` is honoured
    when general_agent is selected (directly or via fallback).
    """
    reg = registry or load_agent_registry()
    if reg.has(task_type):
        return reg.get(task_type, complexity=complexity)
    if reg.has("general_agent"):
        logger.info(
            "No specialist for task_type=%r → general_agent (complexity=%s)",
            task_type, complexity,
        )
        return reg.get("general_agent", complexity=complexity)
    raise KeyError(
        f"Unknown agent type '{task_type}' and no general_agent fallback defined"
    )


def load_system_prompt(rel_path: Optional[str]) -> str:
    """Read an agent's system prompt file (relative to the registry dir).

    Returns "" when the path is empty or the file is missing — callers degrade
    to the default worker scaffolding rather than failing the spawn.
    """
    if not rel_path:
        return ""
    p = Path(rel_path)
    if not p.is_absolute():
        p = _default_registry_dir() / rel_path
    try:
        return p.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("Agent system prompt %s unreadable: %s", p, exc)
        return ""


def list_visible_agents(registry: Optional[AgentRegistry] = None) -> List[Dict[str, Any]]:
    """Return display metadata for user-facing agents only (for the SaaS UI).

    Never includes provider/model — only the display block. This is the
    allow-list source for what the front may render.
    """
    reg = registry or load_agent_registry()
    out: List[Dict[str, Any]] = []
    for name in reg.names():
        cfg = reg.get(name)
        if not cfg.visible_to_user:
            continue
        out.append({
            "id": name,
            "name": cfg.display_name,
            "icon": cfg.display.get("icon"),
            "role": cfg.role,
        })
    return out
