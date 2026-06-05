"""Model catalog poller — the upstream half of the auto-update flow.

``model_manager`` knows how to *apply* a catalog change; this module knows how
to *detect* one. It fetches each provider's live ``/models`` catalog, compares
it against the families currently configured in the registry, and emits
:class:`~agent.model_manager.CatalogChange` objects for the manager to apply.

Wiring: the orchestrator daemon runs :func:`run_catalog_check` on a daily cron.
``minor`` changes auto-apply (override written, registry cache invalidated);
``major`` changes are staged and the operator is notified (default: a triage
kanban task + log) to approve via ``model_manager.apply_pending``.

Severity rule (the conservative default)
-----------------------------------------
A newer model in the same *variant signature* as a family's base model:
  * same major version (glm-5 → glm-5.1)  → ``minor``  → auto-apply
  * higher major version (glm-5 → glm-6)  → ``major``  → operator approval

Only the **base** variant of each family is tracked (no ``-flash``/``-thinking``/
``-turbo`` suffix), and only models that match an already-configured variant
signature are considered — so a brand-new model *class* never auto-applies.

Network/credentials are injected via ``fetch_fn`` so the diff logic is unit
testable without hitting any provider.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Callable, Dict, List, Optional, Set

from agent.model_manager import (
    SEVERITY_MAJOR,
    SEVERITY_MINOR,
    CatalogChange,
    apply_catalog_change,
)

logger = logging.getLogger(__name__)

# Suffix tokens that mark a *non-base* variant within a family. A model whose
# name contains any of these is a sibling class (flash/thinking/turbo/…), not
# the base model we track for auto-update.
_VARIANT_TOKENS = (
    "thinking", "turbo", "preview", "flash", "air", "plus", "mini",
    "chat", "instruct", "vision", "lite", "nano", "9b", "8b", "32b",
)


# ─────────────────────────────────────────────────────────────────────────────
# Version / variant parsing
# ─────────────────────────────────────────────────────────────────────────────


def _version_key(model: str) -> tuple[int, ...]:
    """Numeric version tuple for ordering. ``glm-5.1`` → (5, 1); ``kimi-k2`` → (2,)."""
    nums = re.findall(r"\d+", model or "")
    return tuple(int(n) for n in nums) if nums else (0,)


def _variant_signature(model: str) -> str:
    """Family/variant identity with version numbers removed.

    ``glm-5`` → ``glm`` · ``glm-5.1`` → ``glm`` · ``glm-4.5-flash`` → ``glm-flash``
    ``kimi-k2`` → ``kimi-k`` · ``kimi-k2-thinking`` → ``kimi-k-thinking``

    Only models sharing a signature are ever compared, so ``glm-5`` never gets
    "upgraded" to ``glm-4.5-flash``.
    """
    s = (model or "").lower()
    s = re.sub(r"[0-9.]+", "", s)        # drop version numbers and dots
    s = re.sub(r"[-_]+", "-", s).strip("-")
    return s


def _is_base_variant(model: str) -> bool:
    """True when the model carries no sibling-variant suffix (it's the base)."""
    s = (model or "").lower()
    return not any(tok in s for tok in _VARIANT_TOKENS)


def classify_severity(old_model: str, new_model: str) -> str:
    """``minor`` when the major version is unchanged, else ``major`` (conservative)."""
    o = _version_key(old_model)
    n = _version_key(new_model)
    if o and n and o[0] and n[0] == o[0]:
        return SEVERITY_MINOR
    return SEVERITY_MAJOR


# ─────────────────────────────────────────────────────────────────────────────
# Registry introspection
# ─────────────────────────────────────────────────────────────────────────────


def _family_reference_models(registry) -> Dict[str, str]:
    """family → the highest-version *base* model currently configured for it."""
    fam_models: Dict[str, List[str]] = {}
    for name in registry.names():
        cfg = registry.get(name)
        if cfg.model_family and cfg.model:
            fam_models.setdefault(cfg.model_family, []).append(cfg.model)

    out: Dict[str, str] = {}
    for fam, models in fam_models.items():
        base = [m for m in models if _is_base_variant(m)]
        if base:
            out[fam] = max(base, key=_version_key)
    return out


def _family_providers(registry) -> Dict[str, Set[str]]:
    """family → set of provider names whose agents belong to that family."""
    out: Dict[str, Set[str]] = {}
    for name in registry.names():
        cfg = registry.get(name)
        if cfg.model_family and cfg.provider:
            out.setdefault(cfg.model_family, set()).add(cfg.provider)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Catalog fetch (network seam)
# ─────────────────────────────────────────────────────────────────────────────


def fetch_provider_models(provider_name: str) -> Optional[List[str]]:
    """Live ``/models`` catalog for a provider, or None when unavailable.

    Resolves the provider profile (which knows the endpoint) and the runtime
    api_key, then delegates to the profile's ``fetch_models``. Never raises.
    """
    try:
        from providers import get_provider_profile

        prof = get_provider_profile(provider_name)
        if prof is None:
            return None
        api_key = None
        try:
            from omniworker_cli.runtime_provider import resolve_runtime_provider

            api_key = (resolve_runtime_provider(requested=provider_name) or {}).get("api_key")
        except Exception as exc:  # noqa: BLE001
            logger.debug("api_key resolve failed for %s: %s", provider_name, exc)
        return prof.fetch_models(api_key=api_key)
    except Exception as exc:  # noqa: BLE001 — catalog fetch is best-effort
        logger.debug("fetch_provider_models(%s) failed: %s", provider_name, exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Diff + run
# ─────────────────────────────────────────────────────────────────────────────


def poll_catalogs(
    *,
    registry=None,
    fetch_fn: Optional[Callable[[str], Optional[List[str]]]] = None,
) -> List[CatalogChange]:
    """Return one :class:`CatalogChange` per family with a newer base model.

    ``fetch_fn(provider_name) -> list[str] | None`` is injectable for tests;
    defaults to the live :func:`fetch_provider_models`.
    """
    from agent.agent_registry import load_agent_registry

    reg = registry or load_agent_registry()
    fetch = fetch_fn or fetch_provider_models

    refs = _family_reference_models(reg)
    fam_providers = _family_providers(reg)

    changes: List[CatalogChange] = []
    for family, ref_model in refs.items():
        ref_sig = _variant_signature(ref_model)
        ref_ver = _version_key(ref_model)

        live: Set[str] = set()
        for provider in fam_providers.get(family, ()):
            for m in fetch(provider) or []:
                if isinstance(m, str):
                    live.add(m)

        candidates = [
            m for m in live
            if _variant_signature(m) == ref_sig and _version_key(m) > ref_ver
        ]
        if not candidates:
            continue

        newest = max(candidates, key=_version_key)
        changes.append(
            CatalogChange(
                family=family,
                old_model=ref_model,
                new_model=newest,
                severity=classify_severity(ref_model, newest),
                source="daemon_catalog_check",
            )
        )
    return changes


def run_catalog_check(
    *,
    notify_operator: Optional[Callable[[str], None]] = None,
    registry=None,
    fetch_fn: Optional[Callable[[str], Optional[List[str]]]] = None,
) -> List[Dict[str, Any]]:
    """Poll catalogs and apply each detected change. Returns the status dicts.

    Minor changes auto-apply; major changes stage + notify the operator. Never
    raises — a failure on one family does not block the others.
    """
    results: List[Dict[str, Any]] = []
    for change in poll_catalogs(registry=registry, fetch_fn=fetch_fn):
        try:
            results.append(apply_catalog_change(change, notify_operator=notify_operator))
        except Exception as exc:  # noqa: BLE001
            logger.warning("apply_catalog_change failed for %s: %s", change.family, exc)
            results.append({"status": "error", "family": change.family, "error": str(exc)})
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Operator notification (default: triage kanban task + log)
# ─────────────────────────────────────────────────────────────────────────────


def build_kanban_notifier(kanban_conn) -> Callable[[str], None]:
    """Operator notifier that files a *triage* kanban task (and logs).

    ``triage=True`` keeps the task out of the daemon's ready/dispatch queue —
    it's a human signal, not work to delegate. ``idempotency_key`` prevents the
    daily check from filing duplicate tasks for the same pending change.
    """
    def _notify(message: str) -> None:
        logger.warning("[operator-notify] %s", message)
        try:
            from omniworker_cli import kanban_db

            key = "model-catalog-" + hashlib.md5(message.encode("utf-8")).hexdigest()[:16]
            kanban_db.create_task(
                kanban_conn,
                title="🔔 Modelo nuevo disponible — requiere aprobación",
                body=message,
                created_by="orchestrator-daemon",
                triage=True,
                idempotency_key=key,
            )
        except Exception as exc:  # noqa: BLE001 — notification must never crash the loop
            logger.debug("kanban notify failed: %s", exc)

    return _notify
