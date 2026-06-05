"""Tests for the agent-proposal autolearning layer."""

import shutil
from pathlib import Path

import pytest

from agent.agent_proposals import (
    UsageTracker,
    approve_proposal,
    maybe_propose,
)
from agent.agent_registry import get_agent_for_task, invalidate_cache

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
    yield tmp_path
    invalidate_cache()


def test_proposes_after_threshold_and_is_idempotent(registry_dir):
    tracker = UsageTracker(conn=None)
    notes = []
    proposals = []
    for _ in range(7):
        p = maybe_propose(
            "scrape competitors", tracker, nudge_after_uses=5, notify_operator=notes.append
        )
        if p:
            proposals.append(p)
    assert len(proposals) == 1
    assert proposals[0]["draft"]["name"] == "scrape_competitors_agent"
    assert len(notes) == 1


def test_no_proposal_below_threshold(registry_dir):
    tracker = UsageTracker(conn=None)
    for _ in range(4):
        p = maybe_propose("rare task", tracker, nudge_after_uses=5)
    assert p is None


def test_proposal_heuristics_research(registry_dir):
    tracker = UsageTracker(conn=None)
    p = None
    for _ in range(5):
        p = maybe_propose("research market trends", tracker, nudge_after_uses=5)
    assert p["draft"]["provider"] == "kimi-coding"
    assert p["draft"]["model"] == "kimi-k2-thinking"


def test_approve_moves_draft_into_registry(registry_dir):
    tracker = UsageTracker(conn=None)
    for _ in range(5):
        maybe_propose("invoice processing", tracker, nudge_after_uses=5)
    res = approve_proposal("invoice_processing_agent")
    assert res["status"] == "approved"
    invalidate_cache()
    cfg = get_agent_for_task("invoice_processing_agent")
    assert cfg.name == "invoice_processing_agent"
    assert cfg.provider  # has a resolved provider


def test_usage_tracker_persists_in_sqlite(tmp_path):
    import sqlite3

    conn = sqlite3.connect(":memory:")
    tracker = UsageTracker(conn=conn)
    assert tracker.record("foo") == 1
    assert tracker.record("foo") == 2
    assert tracker.record("bar") == 1
    assert not tracker.already_proposed("foo")
    tracker.mark_proposed("foo")
    assert tracker.already_proposed("foo")
