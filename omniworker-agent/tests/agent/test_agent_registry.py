"""Tests for the agent registry loader (agent_types.yaml + model_overrides.yaml)."""

import shutil
from pathlib import Path

import pytest

import agent.agent_registry as reg_mod
from agent.agent_registry import (
    get_agent_for_task,
    invalidate_cache,
    list_visible_agents,
    load_agent_registry,
)

PKG_ROOT = Path(__file__).resolve().parents[2]  # omniworker-agent/


@pytest.fixture
def registry_dir(tmp_path, monkeypatch):
    """Isolated copy of the registry files so write-tests don't touch the real ones."""
    shutil.copy(PKG_ROOT / "agent_types.yaml", tmp_path / "agent_types.yaml")
    shutil.copy(PKG_ROOT / "model_overrides.yaml", tmp_path / "model_overrides.yaml")
    prompts = tmp_path / "prompts"
    prompts.mkdir()
    shutil.copy(PKG_ROOT / "prompts" / "worker_base.md", prompts / "worker_base.md")
    shutil.copy(PKG_ROOT / "prompts" / "orchestrator.md", prompts / "orchestrator.md")
    monkeypatch.setenv("OMNIWORKER_AGENT_TYPES_DIR", str(tmp_path))
    invalidate_cache()
    yield tmp_path
    invalidate_cache()


def test_loads_all_agents(registry_dir):
    r = load_agent_registry()
    names = r.names()
    assert "orchestrator" in names
    assert "general_agent" in names
    assert len(names) == 10


def test_specialist_has_fixed_model(registry_dir):
    dev = get_agent_for_task("developer")
    assert dev.provider == "zai"
    assert dev.model == "glm-5"
    assert dev.fallback_model == "glm-4-9b"
    assert dev.toolset == ["terminal", "file", "code_execution"]
    assert dev.resolved_tier is None  # specialists are not tier-resolved


def test_unknown_task_falls_back_to_general_agent(registry_dir):
    cfg = get_agent_for_task("nonexistent_task_kind")
    assert cfg.name == "general_agent"


@pytest.mark.parametrize(
    "complexity,expected_provider,expected_model",
    [
        ("simple", "zai", "glm-4.5-flash"),
        ("medium", "zai", "glm-5"),
        ("complex", "kimi-coding", "kimi-k2"),
    ],
)
def test_general_agent_complexity_tiers(registry_dir, complexity, expected_provider, expected_model):
    cfg = get_agent_for_task("general_agent", complexity=complexity)
    assert cfg.provider == expected_provider
    assert cfg.model == expected_model
    assert cfg.resolved_tier == complexity


def test_general_agent_default_tier(registry_dir):
    cfg = get_agent_for_task("general_agent")  # no complexity
    assert cfg.resolved_tier == "medium"
    assert cfg.model == "glm-5"


def test_orchestrator_flags(registry_dir):
    o = get_agent_for_task("orchestrator")
    assert o.context_protection is True
    assert o.is_orchestrator is True
    assert o.visible_to_user is False


def test_reviewer_parallel_instances(registry_dir):
    r = get_agent_for_task("reviewer")
    assert r.parallel_instances == 2


def test_to_delegation_cfg_shape(registry_dir):
    cfg = get_agent_for_task("developer").to_delegation_cfg()
    assert cfg["provider"] == "zai"
    assert cfg["model"] == "glm-5"
    assert set(cfg) == {"provider", "model", "base_url", "api_key", "api_mode"}


def test_visible_agents_never_leak_model(registry_dir):
    visible = list_visible_agents()
    # orchestrator + general_agent are hidden → 8 visible
    assert len(visible) == 8
    for v in visible:
        assert "model" not in v
        assert "provider" not in v
        assert "base_url" not in v
        assert v["name"] and v["role"]


def test_family_override_shadows_registry_model(registry_dir):
    import yaml

    ovr = registry_dir / "model_overrides.yaml"
    ovr.write_text(
        yaml.safe_dump({"version": 1, "overrides": {"glm": {"active": "glm-5.1"}}}),
        encoding="utf-8",
    )
    invalidate_cache()
    dev = get_agent_for_task("developer")
    assert dev.model == "glm-5.1"
    assert dev.overridden is True
    # kimi-family agents are untouched by a glm override
    orch = get_agent_for_task("orchestrator")
    assert orch.model == "kimi-k2"
    assert orch.overridden is False
