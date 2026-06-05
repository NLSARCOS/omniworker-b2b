"""Autonomous objective decomposition (Objetivo 1 — iniciativa propia)."""

from agent.objective_decomposer import (
    decompose_objective,
    is_objective,
    parse_subtasks,
    seed_objective,
)


def test_is_objective_detection():
    assert is_objective(title="OBJETIVO: lanzar campaña X")
    assert is_objective(title="Objective: ship v2")
    assert is_objective(kind="objective")
    assert not is_objective(title="Fix the login bug")


def test_parse_subtasks_json():
    text = '[{"title": "Diseñar landing", "body": "hero + form"}, {"title": "Escribir copy"}]'
    subs = parse_subtasks(text)
    assert [s["title"] for s in subs] == ["Diseñar landing", "Escribir copy"]
    assert subs[0]["body"] == "hero + form"


def test_parse_subtasks_json_fenced():
    text = "Aquí están:\n```json\n[{\"title\": \"A\"}, {\"title\": \"B\"}]\n```\n"
    assert [s["title"] for s in parse_subtasks(text)] == ["A", "B"]


def test_parse_subtasks_numbered_fallback():
    text = "1. Investigar competencia\n2. Definir oferta\n3. Armar funnel"
    assert [s["title"] for s in parse_subtasks(text)] == [
        "Investigar competencia", "Definir oferta", "Armar funnel"
    ]


def test_parse_subtasks_empty_on_garbage():
    assert parse_subtasks("no hay tareas acá") == []


def test_decompose_caps_to_max():
    planner = lambda prompt: "\n".join(f"{i}. tarea {i}" for i in range(1, 20))
    subs = decompose_objective("OBJETIVO: hacer todo", planner_fn=planner, max_subtasks=6)
    assert len(subs) == 6


def test_decompose_strips_prefix_before_planner():
    seen = {}

    def planner(prompt):
        seen["prompt"] = prompt
        return "[]"

    decompose_objective("OBJETIVO: lanzar X", planner_fn=planner)
    assert "lanzar X" in seen["prompt"]
    # The prefix is stripped from the goal — no doubled "OBJETIVO: OBJETIVO:".
    assert "OBJETIVO: OBJETIVO:" not in seen["prompt"]
    assert seen["prompt"].count("lanzar X") == 1


def test_seed_objective_writes_kanban_children(tmp_path):
    from omniworker_cli import kanban_db

    conn = kanban_db.connect(db_path=tmp_path / "board.db")
    obj_id = kanban_db.create_task(conn, title="OBJETIVO: lanzar campaña", created_by="t")

    planner = lambda prompt: '[{"title": "Diseñar landing"}, {"title": "Escribir copy"}]'
    created = seed_objective(conn, objective_id=obj_id, goal="lanzar campaña", planner_fn=planner)

    assert len(created) == 2
    titles = {getattr(t, "title", None) for t in kanban_db.list_tasks(conn)}
    assert "Diseñar landing" in titles and "Escribir copy" in titles
