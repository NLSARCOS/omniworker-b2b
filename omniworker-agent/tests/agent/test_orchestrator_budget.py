"""Budget guard + kill-switch — the autonomous-spend safety rail."""

import json

import pytest

from agent.orchestrator_budget import BudgetConfig, BudgetGuard, estimate_cost_usd


def _guard(tmp_path, **caps):
    return BudgetGuard(BudgetConfig(**caps), state_path=tmp_path / "budget.json")


def test_allows_under_caps(tmp_path):
    g = _guard(tmp_path, max_delegations_per_day=2)
    ok, _ = g.allow()
    assert ok


def test_blocks_on_delegation_cap(tmp_path):
    g = _guard(tmp_path, max_delegations_per_day=2)
    g.record(model="glm-5", input_tokens=10, output_tokens=10)
    g.record(model="glm-5", input_tokens=10, output_tokens=10)
    ok, reason = g.allow()
    assert ok is False
    assert "delegaciones" in reason


def test_blocks_on_token_cap(tmp_path):
    g = _guard(tmp_path, max_tokens_per_day=100)
    g.record(model="glm-5", input_tokens=80, output_tokens=80)  # 160 > 100
    ok, reason = g.allow()
    assert ok is False
    assert "tokens" in reason


def test_blocks_on_usd_cap(tmp_path):
    g = _guard(tmp_path, daily_usd=0.001)
    g.record(model="kimi-k2-turbo-preview", input_tokens=500_000, output_tokens=500_000)
    ok, reason = g.allow()
    assert ok is False
    assert "gasto" in reason


def test_killswitch_via_env(tmp_path, monkeypatch):
    g = _guard(tmp_path, max_delegations_per_day=99)
    monkeypatch.setenv("OMNIWORKER_ORCHESTRATOR_STOP", "1")
    ok, reason = g.allow()
    assert ok is False
    assert "kill-switch" in reason


def test_state_persists_same_day(tmp_path):
    g1 = _guard(tmp_path, max_delegations_per_day=5)
    g1.record(model="glm-5", input_tokens=1, output_tokens=1)
    g2 = _guard(tmp_path, max_delegations_per_day=5)  # reload
    assert g2.snapshot()["delegations"] == 1


def test_daily_rollover_resets(tmp_path):
    g = _guard(tmp_path, max_delegations_per_day=1)
    g.record(model="glm-5", input_tokens=1, output_tokens=1)
    # Simulate a new day by rewriting the persisted date.
    state = json.loads((tmp_path / "budget.json").read_text())
    state["date"] = "2000-01-01"
    (tmp_path / "budget.json").write_text(json.dumps(state))
    g2 = _guard(tmp_path, max_delegations_per_day=1)
    ok, _ = g2.allow()
    assert ok  # fresh day → counters reset


def test_estimate_cost_uses_model_price():
    cheap = estimate_cost_usd(model="glm-4.5-flash", input_tokens=1_000_000, output_tokens=0)
    pricey = estimate_cost_usd(model="kimi-k2-turbo-preview", input_tokens=1_000_000, output_tokens=0)
    assert pricey > cheap


def test_from_config_parses_budget_block():
    cfg = {"orchestrator": {"budget": {"max_delegations_per_day": 50, "daily_usd": 10}}}
    bc = BudgetConfig.from_config(cfg)
    assert bc.max_delegations_per_day == 50
    assert bc.daily_usd == 10.0
