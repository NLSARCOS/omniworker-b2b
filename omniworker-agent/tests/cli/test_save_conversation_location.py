"""Tests for /save — the conversation snapshot slash command.

Regression: the old implementation wrote ``flux-agent_conversation_<ts>.json``
to the current working directory (CWD). Users who ran /save expected the
file to be discoverable via ``flux-agent sessions browse``, but CWD-resident
snapshots are not indexed in the state DB and are generally invisible.
The fix writes snapshots under ``~/.flux-agent/sessions/saved/`` and prints
the absolute path plus the resume hint for the live session.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def flux-agent_home(tmp_path, monkeypatch):
    home = tmp_path / ".flux-agent"
    home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setenv("FLUX AGENT_HOME", str(home))
    # Clear any cached flux-agent_home computation
    import flux-agent_constants
    if hasattr(flux-agent_constants, "_flux-agent_home_cache"):
        flux-agent_constants._flux-agent_home_cache = None
    return home


def _make_stub_cli(history):
    """Build a minimal object exposing just what save_conversation uses."""
    return SimpleNamespace(
        conversation_history=history,
        model="test-model",
        session_id="20260101_120000_abc123",
        session_start=datetime(2026, 1, 1, 12, 0, 0),
    )


def test_save_conversation_writes_under_flux-agent_home(flux-agent_home, tmp_path, monkeypatch, capsys):
    """Snapshot must land under ~/.flux-agent/sessions/saved/, not CWD."""
    # Change CWD to a different directory to prove the file does NOT go there.
    work = tmp_path / "somewhere-else"
    work.mkdir()
    monkeypatch.chdir(work)

    # Import fresh to pick up the FLUX AGENT_HOME fixture
    for mod in [m for m in sys.modules if m.startswith("cli") or m == "flux-agent_constants"]:
        sys.modules.pop(mod, None)

    import cli  # noqa: F401  (module under test)

    stub = _make_stub_cli([
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ])

    # Call the unbound method against our stub.
    cli.Flux AgentCLI.save_conversation(stub)

    # File must NOT be in CWD
    cwd_leak = list(work.glob("flux-agent_conversation_*.json"))
    assert not cwd_leak, f"snapshot leaked to CWD: {cwd_leak}"

    # File MUST be under ~/.flux-agent/sessions/saved/
    saved_dir = flux-agent_home / "sessions" / "saved"
    assert saved_dir.is_dir(), "expected saved/ subdirectory to be created"
    files = list(saved_dir.glob("flux-agent_conversation_*.json"))
    assert len(files) == 1, files

    payload = json.loads(files[0].read_text())
    assert payload["model"] == "test-model"
    assert payload["session_id"] == "20260101_120000_abc123"
    assert payload["messages"] == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]

    # User-facing message must include the absolute path AND the resume hint.
    out = capsys.readouterr().out
    assert str(files[0]) in out, out
    assert "flux-agent --resume 20260101_120000_abc123" in out, out


def test_save_conversation_empty_history_does_nothing(flux-agent_home, capsys):
    for mod in [m for m in sys.modules if m.startswith("cli") or m == "flux-agent_constants"]:
        sys.modules.pop(mod, None)
    import cli

    stub = _make_stub_cli([])
    cli.Flux AgentCLI.save_conversation(stub)

    saved_dir = flux-agent_home / "sessions" / "saved"
    assert not saved_dir.exists() or not list(saved_dir.iterdir())
    out = capsys.readouterr().out
    assert "No conversation to save" in out
