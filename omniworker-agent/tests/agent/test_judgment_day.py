"""Judgment-day: agents with parallel_instances>1 spawn N blind instances."""

import tools.delegate_tool as dt
from orchestrator_daemon import build_delegate_fn, _parallel_instances_for


def test_registry_declares_reviewer_parallel():
    assert _parallel_instances_for("reviewer", None) == 2
    assert _parallel_instances_for("developer", None) == 1


def test_reviewer_expands_to_n_blind_tasks(monkeypatch):
    captured = {}

    def fake_delegate(*, goal=None, context=None, agent_type=None, complexity=None,
                      tasks=None, role=None, parent_agent=None):
        captured["goal"] = goal
        captured["tasks"] = tasks
        return "result"

    monkeypatch.setattr(dt, "delegate_task", fake_delegate)

    delegate = build_delegate_fn(orchestrator_agent=object())
    delegate(agent_type="reviewer", goal="Audit the PR", context="diff here")

    # Reviewer → batch of 2 identical isolated tasks (blind to each other).
    assert captured["goal"] is None
    assert isinstance(captured["tasks"], list) and len(captured["tasks"]) == 2
    assert all(t["agent_type"] == "reviewer" for t in captured["tasks"])
    assert all(t["goal"] == "Audit the PR" for t in captured["tasks"])


def test_single_instance_agent_uses_plain_goal(monkeypatch):
    captured = {}

    def fake_delegate(*, goal=None, context=None, agent_type=None, complexity=None,
                      tasks=None, role=None, parent_agent=None):
        captured["goal"] = goal
        captured["tasks"] = tasks
        return "result"

    monkeypatch.setattr(dt, "delegate_task", fake_delegate)

    delegate = build_delegate_fn(orchestrator_agent=object())
    delegate(agent_type="developer", goal="Fix the bug")

    assert captured["goal"] == "Fix the bug"
    assert captured["tasks"] is None
