"""Delegation brief (in) + structured summary (out)."""

import json

from agent.delegation_brief import build_brief, extract_summary


def test_brief_has_objective_and_no_history():
    brief = build_brief(goal="Fix login bug", context="users report 500s")
    assert "## Objetivo" in brief
    assert "Fix login bug" in brief
    assert "## Criterio de éxito" in brief
    assert "## Formato de salida esperado" in brief


def test_brief_omits_empty_context():
    brief = build_brief(goal="Do X")
    assert "Contexto necesario" not in brief


def test_extract_summary_from_json_entries():
    raw = json.dumps([
        {"summary": "Arreglé el bug", "tokens": {"input": 10, "output": 5}},
        {"summary": "Agregué un test"},
    ])
    out = extract_summary(raw)
    assert "Arreglé el bug" in out
    assert "Agregué un test" in out
    assert "tokens" not in out  # raw structure not leaked


def test_extract_summary_plaintext_passthrough():
    assert extract_summary("just a string") == "just a string"


def test_extract_summary_truncates():
    raw = json.dumps([{"summary": "x" * 5000}])
    assert len(extract_summary(raw, max_len=100)) <= 100
