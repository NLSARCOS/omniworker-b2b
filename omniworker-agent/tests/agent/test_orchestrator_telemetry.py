"""Run telemetry — the orchestrator's audit trail."""

from agent.orchestrator_telemetry import read_runs, record_run, summarize_runs


def test_record_and_read(tmp_path):
    p = tmp_path / "runs.jsonl"
    record_run(task_id="t1", agent_type="developer", model="glm-5",
               input_tokens=100, output_tokens=50, cost_usd=0.01,
               status="completed", duration_s=2.5, path=p)
    record_run(task_id="t2", agent_type="reviewer", model="glm-4.5-flash",
               input_tokens=20, output_tokens=10, status="failed", path=p)

    runs = read_runs(path=p)
    assert len(runs) == 2
    assert runs[0]["agent_type"] == "developer"
    assert runs[-1]["status"] == "failed"


def test_read_limit_newest_last(tmp_path):
    p = tmp_path / "runs.jsonl"
    for i in range(10):
        record_run(task_id=f"t{i}", agent_type="developer", path=p)
    runs = read_runs(limit=3, path=p)
    assert len(runs) == 3
    assert runs[-1]["task_id"] == "t9"


def test_summarize(tmp_path):
    p = tmp_path / "runs.jsonl"
    record_run(task_id="t1", agent_type="developer", input_tokens=100, output_tokens=50, cost_usd=0.02, path=p)
    record_run(task_id="t2", agent_type="developer", input_tokens=10, output_tokens=5, cost_usd=0.01, path=p)
    record_run(task_id="t3", agent_type="reviewer", input_tokens=1, output_tokens=1, cost_usd=0.001, path=p)
    s = summarize_runs(path=p)
    assert s["runs"] == 3
    assert s["by_agent"]["developer"] == 2
    assert abs(s["total_cost_usd"] - 0.031) < 1e-9
    assert s["total_tokens"] == 100 + 50 + 10 + 5 + 1 + 1


def test_read_missing_file_is_empty(tmp_path):
    assert read_runs(path=tmp_path / "nope.jsonl") == []
