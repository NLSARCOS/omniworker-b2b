"""Tests for the model manager (catalog-change → override / operator approval)."""

import shutil
from pathlib import Path

import pytest

import agent.model_manager as mm
from agent.agent_registry import get_agent_for_task, invalidate_cache
from agent.model_manager import (
    CatalogChange,
    apply_catalog_change,
    apply_pending,
    list_pending,
)

PKG_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def registry_dir(tmp_path, monkeypatch):
    shutil.copy(PKG_ROOT / "agent_types.yaml", tmp_path / "agent_types.yaml")
    shutil.copy(PKG_ROOT / "model_overrides.yaml", tmp_path / "model_overrides.yaml")
    prompts = tmp_path / "prompts"
    prompts.mkdir()
    shutil.copy(PKG_ROOT / "prompts" / "worker_base.md", prompts / "worker_base.md")
    monkeypatch.setenv("OMNIWORKER_AGENT_TYPES_DIR", str(tmp_path))
    invalidate_cache()
    mm._pending.clear()
    yield tmp_path
    invalidate_cache()
    mm._pending.clear()


def test_minor_change_applies_immediately(registry_dir):
    assert get_agent_for_task("developer").model == "glm-5"
    res = apply_catalog_change(
        CatalogChange(family="glm", old_model="glm-5", new_model="glm-5.1", severity="minor")
    )
    assert res["status"] == "applied"
    assert get_agent_for_task("developer").model == "glm-5.1"


def test_major_change_waits_for_approval(registry_dir):
    notes = []
    res = apply_catalog_change(
        CatalogChange(family="kimi", old_model="kimi-k2", new_model="kimi-k3", severity="major"),
        notify_operator=notes.append,
    )
    assert res["status"] == "pending_approval"
    assert "kimi" in list_pending()
    assert len(notes) == 1  # operator notified
    # not applied yet
    assert get_agent_for_task("orchestrator").model == "kimi-k2"
    # approve → applied
    apply_pending("kimi")
    assert get_agent_for_task("orchestrator").model == "kimi-k3"
    assert "kimi" not in list_pending()


def test_major_lists_affected_agents(registry_dir):
    res = apply_catalog_change(
        CatalogChange(family="glm", old_model="glm-5", new_model="glm-6", severity="major")
    )
    # developer, reviewer, code_runner, browser_agent, marketer are glm-family
    assert "Agente de Desarrollo" in res["affected_agents"]


def test_invalid_severity_rejected(registry_dir):
    with pytest.raises(ValueError):
        apply_catalog_change(
            CatalogChange(family="glm", old_model="glm-5", new_model="glm-6", severity="bogus")
        )


def test_apply_pending_noop_when_nothing_staged(registry_dir):
    assert apply_pending("nonexistent")["status"] == "no_pending"
