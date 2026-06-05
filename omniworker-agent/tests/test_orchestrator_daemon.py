"""Tests for the orchestrator daemon (classify + tick loop, with fakes)."""

from orchestrator_daemon import (
    DaemonConfig,
    OrchestratorDaemon,
    classify_task,
)


class FakeTask:
    def __init__(self, id, title, body="", assignee=None, fails=0, hb=None, started=None):
        self.id = id
        self.title = title
        self.body = body
        self.assignee = assignee
        self.consecutive_failures = fails
        self.last_heartbeat_at = hb
        self.started_at = started


# ── classify_task ────────────────────────────────────────────────────────────


def test_classify_developer():
    assert classify_task(FakeTask("1", "Fix bug in login endpoint"))[0] == "developer"


def test_classify_researcher():
    assert classify_task(FakeTask("1", "Investiga competidores del mercado"))[0] == "researcher"


def test_classify_unknown_is_general_agent():
    agent_type, complexity = classify_task(FakeTask("1", "do something weird"))
    assert agent_type == "general_agent"
    assert complexity in ("simple", "medium", "complex")


def test_classify_simple_complexity():
    agent_type, complexity = classify_task(FakeTask("1", "Responde este email", "reply short"))
    assert agent_type == "general_agent"
    assert complexity == "simple"


def test_classify_complex_by_length():
    agent_type, complexity = classify_task(FakeTask("1", "tarea xyz", "x" * 700))
    assert agent_type == "general_agent"
    assert complexity == "complex"


# ── daemon tick ──────────────────────────────────────────────────────────────


def _make_daemon(ready=None, stalled=None, **cfg):
    calls = []
    notes = []

    def fake_delegate(*, agent_type, goal, context=None, complexity=None):
        calls.append((agent_type, goal, complexity))
        return f"done: {goal}"

    d = OrchestratorDaemon(
        kanban_conn=None,
        delegate_fn=fake_delegate,
        notify_fn=notes.append,
        config=DaemonConfig(**cfg),
    )
    d._get_ready_unassigned = lambda: ready or []
    d._get_stalled = lambda: stalled or []
    d._record_result = lambda task, summary, success: None
    return d, calls, notes


def test_tick_dispatches_ready_tasks():
    ready = [FakeTask("t1", "Fix login bug"), FakeTask("t2", "Investiga mercado")]
    d, calls, _ = _make_daemon(ready=ready)
    res = d.tick()
    assert set(res["dispatched"]) == {"t1", "t2"}
    assert ("developer", "Fix login bug", None) in calls
    assert ("researcher", "Investiga mercado", None) in calls


def test_tick_escalates_on_loop_detection():
    ready = [FakeTask("t3", "broken task", fails=3)]
    d, calls, notes = _make_daemon(ready=ready, max_failures=3)
    res = d.tick()
    assert res["escalated"] == ["t3"]
    assert not calls  # never delegated — escalated instead
    assert len(notes) == 1


def test_tick_respects_max_tasks_per_tick():
    ready = [FakeTask(f"t{i}", "Fix bug") for i in range(10)]
    d, calls, _ = _make_daemon(ready=ready, max_tasks_per_tick=3)
    res = d.tick()
    assert len(res["dispatched"]) == 3


def test_tick_runs_interval_cron():
    # last-run starts at 0, so any positive interval is immediately due.
    d, calls, _ = _make_daemon()
    d.cron_tasks = [{"task": "daily_standup", "agent_type": "planner", "interval_seconds": 1}]
    d.tick()
    assert any(c[1] == "daily_standup" for c in calls)
    # second immediate tick should NOT re-fire (interval not elapsed)
    calls.clear()
    d.tick()
    assert not any(c[1] == "daily_standup" for c in calls)


class _FakeBudget:
    def __init__(self, killed=False, allow=True, reason="cap"):
        self._killed = killed
        self._allow = allow
        self._reason = reason
        self.recorded = []

    def killed(self):
        return self._killed

    def allow(self):
        return (self._allow, "ok" if self._allow else self._reason)

    def record(self, **kw):
        self.recorded.append(kw)


def test_killswitch_halts_dispatch():
    ready = [FakeTask("t1", "Fix bug")]
    d, calls, notes = _make_daemon(ready=ready)
    d.budget = _FakeBudget(killed=True)
    res = d.tick()
    assert res.get("halted") == "killswitch"
    assert not calls  # nothing delegated
    assert any("kill-switch" in n for n in notes)


def test_budget_cap_pauses_dispatch():
    ready = [FakeTask("t1", "Fix bug"), FakeTask("t2", "Fix other")]
    d, calls, notes = _make_daemon(ready=ready)
    d.budget = _FakeBudget(allow=False, reason="tope de delegaciones/día alcanzado (0)")
    res = d.tick()
    assert not calls
    assert any("pausa" in n for n in notes)


def test_budget_records_usage_after_delegation():
    ready = [FakeTask("t1", "Fix bug")]
    d, calls, _ = _make_daemon(ready=ready)
    budget = _FakeBudget(allow=True)
    d.budget = budget
    # delegate_fn returns plain text → usage parses to zeros, but a record fires.
    d.tick()
    assert len(budget.recorded) == 1


def test_skill_proposed_after_recurring_pattern(monkeypatch):
    import orchestrator_daemon as od

    monkeypatch.setattr(od, "_skill_exists_for", lambda bucket: False)
    d, _, notes = _make_daemon()
    task = FakeTask("t1", "Traducir documento legal")
    # Same pattern three times → one skill proposal at the threshold.
    d._delegate_task(task)
    d._delegate_task(task)
    assert not any("skill" in n.lower() for n in notes)  # not yet
    d._delegate_task(task)
    assert sum("skill" in n.lower() for n in notes) == 1
    # Further repeats do not re-propose.
    d._delegate_task(task)
    assert sum("skill" in n.lower() for n in notes) == 1


def test_catalog_cron_routes_to_check_fn_not_delegation():
    # A cron tagged kind="catalog" runs the auto-update poller, never delegates.
    d, calls, _ = _make_daemon()
    ran = []
    d.catalog_check_fn = lambda: ran.append(True)
    d.cron_tasks = [{"task": "model_catalog_check", "kind": "catalog", "interval_seconds": 1}]
    d.tick()
    assert ran == [True]
    assert not calls  # the delegate path was not taken
