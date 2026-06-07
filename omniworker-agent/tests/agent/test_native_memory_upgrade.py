"""Tests for the NativeMemory upgrade (spec features F1-F7).

Covers the topic-key upsert + soft-delete schema (F3), explicit memory tools
(F2), the proactive protocol block (F1), the session-summary and delegation
hooks (F4/F6), and scoped search (F7).

These run against an in-memory SQLite connection in autocommit mode
(isolation_level=None) to mirror how omniworker_state.SessionDB opens the real
state.db.
"""

import json
import sqlite3

import pytest

from agent.native_memory import BM25Layer, MemoryChunk, NativeMemoryProvider


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.isolation_level = None  # autocommit, like the production state.db
    yield c
    c.close()


@pytest.fixture
def provider(conn):
    p = NativeMemoryProvider(conn)
    p.initialize("test-session")
    return p


# ---------------------------------------------------------------------------
# F3 — schema, migration, upsert, soft-delete
# ---------------------------------------------------------------------------


def test_f3_new_install_has_all_columns(conn):
    BM25Layer(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(memory_chunks)")}
    assert {"topic_key", "revision_count", "deleted_at", "scope"} <= cols


def test_f3_migration_on_legacy_db_preserves_data():
    legacy = sqlite3.connect(":memory:")
    legacy.isolation_level = None
    legacy.executescript(
        """
        CREATE TABLE memory_chunks (
            id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, turn_id INTEGER NOT NULL,
            chunk_type TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT, created_at REAL NOT NULL
        );
        CREATE VIRTUAL TABLE memory_chunks_fts USING fts5(content, tokenize='trigram');
        """
    )
    legacy.execute(
        "INSERT INTO memory_chunks(session_id, turn_id, chunk_type, content, created_at) "
        "VALUES ('s', 0, 'manual', 'legacy row', 1.0)"
    )
    BM25Layer(legacy)  # runs migration
    cols = {r[1] for r in legacy.execute("PRAGMA table_info(memory_chunks)")}
    assert {"topic_key", "revision_count", "deleted_at", "scope"} <= cols
    assert legacy.execute("SELECT content FROM memory_chunks").fetchone()[0] == "legacy row"
    legacy.close()


def test_f3_upsert_by_topic_key_dedupes_and_bumps_revision(conn):
    bm = BM25Layer(conn)
    c1 = MemoryChunk(0, "s", -1, "decision", "use postgres", {"scope": "project"}, 1.0)
    bm.index(c1, topic_key="arch/db")
    c2 = MemoryChunk(0, "s", -1, "decision", "use sqlite", {"scope": "project"}, 2.0)
    bm.index(c2, topic_key="arch/db")
    rows = conn.execute(
        "SELECT content, revision_count FROM memory_chunks WHERE topic_key='arch/db'"
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "use sqlite"
    assert rows[0][1] == 2


def test_f3_soft_delete_hides_from_search_and_recall(conn):
    bm = BM25Layer(conn)
    bm.index(
        MemoryChunk(0, "s", -1, "decision", "use sqlite for storage", {}, 1.0),
        topic_key="arch/db",
    )
    assert bm.recall_by_topic("arch/db") == "use sqlite for storage"
    assert bm.soft_delete("arch/db") is True
    assert bm.recall_by_topic("arch/db") is None
    assert all(c.metadata.get("topic_key") != "arch/db" for c in bm.search("sqlite"))


# ---------------------------------------------------------------------------
# F2 — explicit memory tools
# ---------------------------------------------------------------------------


def test_f2_exposes_three_tools(provider):
    names = [s["name"] for s in provider.get_tool_schemas()]
    assert names == ["memory_save", "memory_search", "memory_recall"]
    for schema in provider.get_tool_schemas():
        assert schema["parameters"]["type"] == "object"


def test_f2_memory_save_and_recall_roundtrip(provider):
    saved = json.loads(
        provider.handle_tool_call(
            "memory_save", {"content": "use WAL mode", "topic_key": "arch/db"}
        )
    )
    assert saved["saved"] is True
    recalled = json.loads(
        provider.handle_tool_call("memory_recall", {"topic_key": "arch/db"})
    )
    assert recalled["found"] is True
    assert recalled["content"] == "use WAL mode"


def test_f2_memory_search_returns_results(provider):
    provider.handle_tool_call("memory_save", {"content": "redis caching layer added"})
    res = json.loads(provider.handle_tool_call("memory_search", {"query": "redis caching"}))
    assert res["count"] >= 1
    assert any("redis" in r["content"] for r in res["results"])


def test_f2_rejects_empty_and_unknown(provider):
    assert "error" in json.loads(provider.handle_tool_call("memory_save", {"content": "  "}))
    assert "error" in json.loads(provider.handle_tool_call("memory_search", {"query": ""}))
    assert "error" in json.loads(provider.handle_tool_call("nope", {}))


# ---------------------------------------------------------------------------
# F1 — proactive protocol injected into the system prompt
# ---------------------------------------------------------------------------


def test_f1_protocol_present_in_system_prompt(provider):
    block = provider.system_prompt_block()
    assert "Memory Protocol" in block
    assert "memory_save" in block
    assert "topic_key" in block


# ---------------------------------------------------------------------------
# F4 / F6 — session summary and delegation hooks
# ---------------------------------------------------------------------------


def test_f4_session_end_saves_summary(provider, conn):
    provider._native.on_decision("Adopt event sourcing", session_id="test-session")
    provider._native.on_file_edit("agent/native_memory.py", session_id="test-session")
    provider._native.set_task_summary("Implemented memory hooks")
    provider.on_session_end([{"role": "user", "content": "hi"}, {"role": "assistant", "content": "ok"}])
    row = conn.execute(
        "SELECT content FROM memory_chunks WHERE chunk_type='session_summary'"
    ).fetchone()
    assert row is not None
    data = json.loads(row[0])
    assert data["msg_count"] == 2
    assert data["last_task"]


def test_f4_skips_empty_session(provider, conn):
    provider.on_session_end([{"role": "user", "content": "x"}])
    n = conn.execute(
        "SELECT COUNT(*) FROM memory_chunks WHERE chunk_type='session_summary'"
    ).fetchone()[0]
    assert n == 0


def test_f6_delegation_saves_result(provider, conn):
    provider.on_delegation(
        "Refactor the parser",
        "Done, 3 files changed",
        child_session_id="child123abc",
        agent_type="general_agent",
    )
    row = conn.execute(
        "SELECT content FROM memory_chunks WHERE chunk_type='delegation_result'"
    ).fetchone()
    assert row is not None
    assert "general_agent" in row[0]
    assert "Refactor the parser" in row[0]


# ---------------------------------------------------------------------------
# F7 — scoped search
# ---------------------------------------------------------------------------


def test_f7_scope_filters_results(provider):
    provider.handle_tool_call(
        "memory_save", {"content": "decision sqlite storage", "topic_key": "arch/db", "scope": "project"}
    )
    provider.handle_tool_call(
        "memory_save", {"content": "decision sqlite personal pref", "topic_key": "pref/db", "scope": "personal"}
    )
    proj = json.loads(provider.handle_tool_call("memory_search", {"query": "sqlite storage", "scope": "project"}))
    assert proj["count"] >= 1
    assert all(r["scope"] == "project" for r in proj["results"])

    pers = json.loads(provider.handle_tool_call("memory_search", {"query": "sqlite personal", "scope": "personal"}))
    assert pers["count"] >= 1
    assert all(r["scope"] == "personal" for r in pers["results"])


def test_f7_no_scope_returns_all_scopes(provider):
    provider.handle_tool_call("memory_save", {"content": "sqlite alpha", "topic_key": "a", "scope": "project"})
    provider.handle_tool_call("memory_save", {"content": "sqlite beta", "topic_key": "b", "scope": "personal"})
    res = json.loads(provider.handle_tool_call("memory_search", {"query": "sqlite"}))
    scopes = {r["scope"] for r in res["results"]}
    assert scopes == {"project", "personal"}
