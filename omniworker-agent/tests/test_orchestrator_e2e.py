"""Integration smoke for the orchestrator — a *real* kanban DB + the *real*
daemon loop, stubbing only the model call. Proves classify → dispatch → record
→ complete against the actual kanban schema, not fakes.

The LIVE model smoke (a real delegation to a real provider) lives in
``scripts/verify_orchestrator_live.py`` instead — it must NOT run under the
hermetic pytest conftest, which strips provider keys and isolates
OMNIWORKER_HOME on purpose so tests never hit real APIs.
"""

from orchestrator_daemon import OrchestratorDaemon, DaemonConfig


def test_daemon_dispatches_against_real_kanban(tmp_path):
    from omniworker_cli import kanban_db

    conn = kanban_db.connect(db_path=tmp_path / "board.db")
    task_id = kanban_db.create_task(
        conn, title="Fix login bug", body="users cannot sign in", created_by="test"
    )

    seen = []

    def stub_delegate(*, agent_type, goal, context=None, complexity=None):
        seen.append((agent_type, goal))
        return f"done: {goal}"

    daemon = OrchestratorDaemon(
        kanban_conn=conn,
        delegate_fn=stub_delegate,
        config=DaemonConfig(),
    )

    result = daemon.tick()

    # The real classifier routes "Fix … bug" to the developer agent.
    assert seen and seen[0][0] == "developer"
    assert task_id in result["dispatched"]

    # The real kanban marked the task done with the summary.
    done = kanban_db.list_tasks(conn, status="done")
    assert any(getattr(t, "id", None) == task_id for t in done)
