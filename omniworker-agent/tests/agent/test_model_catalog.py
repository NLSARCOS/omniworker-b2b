"""Model catalog poller — diff logic + severity classification.

Network is injected via ``fetch_fn`` so these run offline. The registry is a
tiny fake exposing the same ``names()``/``get()`` surface as AgentRegistry.
"""

from types import SimpleNamespace

import pytest

from agent import model_catalog as mc
from agent.model_manager import SEVERITY_MAJOR, SEVERITY_MINOR


# ── version / variant parsing ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "model,expected",
    [("glm-5", (5,)), ("glm-5.1", (5, 1)), ("kimi-k2", (2,)), ("glm-4.5-flash", (4, 5))],
)
def test_version_key(model, expected):
    assert mc._version_key(model) == expected


@pytest.mark.parametrize(
    "model,sig",
    [
        ("glm-5", "glm"),
        ("glm-5.1", "glm"),
        ("glm-6", "glm"),
        ("glm-4.5-flash", "glm-flash"),
        ("kimi-k2", "kimi-k"),
        ("kimi-k2-thinking", "kimi-k-thinking"),
    ],
)
def test_variant_signature(model, sig):
    assert mc._variant_signature(model) == sig


def test_is_base_variant():
    assert mc._is_base_variant("glm-5") is True
    assert mc._is_base_variant("kimi-k2") is True
    assert mc._is_base_variant("glm-4.5-flash") is False
    assert mc._is_base_variant("kimi-k2-thinking") is False


def test_classify_severity():
    assert mc.classify_severity("glm-5", "glm-5.1") == SEVERITY_MINOR   # same major
    assert mc.classify_severity("glm-5", "glm-6") == SEVERITY_MAJOR     # major bump
    assert mc.classify_severity("kimi-k2", "kimi-k3") == SEVERITY_MAJOR


# ── diff against a fake registry ─────────────────────────────────────────────


class _FakeRegistry:
    """Minimal AgentRegistry stand-in: name → resolved AgentConfig-ish object."""

    def __init__(self, agents):
        self._agents = agents

    def names(self):
        return list(self._agents.keys())

    def get(self, name, *, complexity=None):
        return self._agents[name]


def _cfg(model, family, provider):
    return SimpleNamespace(model=model, model_family=family, provider=provider)


def _registry():
    # glm base = glm-5 (developer), reviewer carries the flash variant.
    # kimi base = kimi-k2 (researcher).
    return _FakeRegistry({
        "developer": _cfg("glm-5", "glm", "zai"),
        "reviewer": _cfg("glm-4.5-flash", "glm", "zai"),
        "researcher": _cfg("kimi-k2", "kimi", "kimi-coding"),
    })


def test_no_change_when_catalog_matches():
    fetch = lambda p: {"zai": ["glm-5", "glm-4.5-flash"], "kimi-coding": ["kimi-k2"]}.get(p, [])
    assert mc.poll_catalogs(registry=_registry(), fetch_fn=fetch) == []


def test_detects_minor_bump():
    fetch = lambda p: {"zai": ["glm-5", "glm-5.1"], "kimi-coding": ["kimi-k2"]}.get(p, [])
    changes = mc.poll_catalogs(registry=_registry(), fetch_fn=fetch)
    assert len(changes) == 1
    c = changes[0]
    assert (c.family, c.old_model, c.new_model, c.severity) == ("glm", "glm-5", "glm-5.1", SEVERITY_MINOR)


def test_detects_major_bump():
    fetch = lambda p: {"zai": ["glm-5", "glm-6"], "kimi-coding": ["kimi-k3"]}.get(p, [])
    changes = {c.family: c for c in mc.poll_catalogs(registry=_registry(), fetch_fn=fetch)}
    assert changes["glm"].new_model == "glm-6"
    assert changes["glm"].severity == SEVERITY_MAJOR
    assert changes["kimi"].new_model == "kimi-k3"
    assert changes["kimi"].severity == SEVERITY_MAJOR


def test_new_variant_class_does_not_trigger():
    # A brand-new model class (glm-5-vision) shares no signature with glm base.
    fetch = lambda p: {"zai": ["glm-5", "glm-5-vision"], "kimi-coding": ["kimi-k2"]}.get(p, [])
    assert mc.poll_catalogs(registry=_registry(), fetch_fn=fetch) == []


def test_fetch_failure_is_safe():
    fetch = lambda p: None  # provider unreachable
    assert mc.poll_catalogs(registry=_registry(), fetch_fn=fetch) == []
