"""Orchestrator mode: the top-level interactive agent adopts the orchestrator
system prompt (gateway chat + desktop chat share this builder).

Gated so delegated workers (no delegate_task tool) and agents already running
the orchestrator prompt (daemon orchestrator) are unaffected.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import agent.system_prompt as sp


def _fake_agent(*, orchestrator_mode, tools, ephemeral=""):
    return SimpleNamespace(
        load_soul_identity=False,
        skip_context_files=True,
        valid_tool_names=set(tools),
        _orchestrator_mode=orchestrator_mode,
        ephemeral_system_prompt=ephemeral,
        _tool_use_enforcement="false",
        model="kimi-k2",
        provider="kimi-coding",
        platform="",
        pass_session_id=False,
        session_id=None,
        _memory_store=None,
        _memory_enabled=False,
        _user_profile_enabled=False,
        _memory_manager=None,
    )


@pytest.fixture(autouse=True)
def _stub_helpers(monkeypatch):
    """Neutralise the heavy run_agent helpers the builder calls."""
    stub = MagicMock()
    stub.load_soul_md.return_value = ""
    stub.build_nous_subscription_prompt.return_value = ""
    stub.get_toolset_for_tool.return_value = None
    stub.build_skills_system_prompt.return_value = ""
    stub.build_environment_hints.return_value = ""
    stub.build_context_files_prompt.return_value = ""
    monkeypatch.setattr(sp, "_ra", lambda: stub)


ORCH_MARKER = "Director de Operaciones"


def test_orchestrator_prompt_injected_for_root_agent():
    agent = _fake_agent(orchestrator_mode=True, tools={"delegate_task", "kanban_show"})
    parts = sp.build_system_prompt_parts(agent)
    assert ORCH_MARKER in parts["stable"]


def test_not_injected_when_mode_off():
    agent = _fake_agent(orchestrator_mode=False, tools={"delegate_task"})
    parts = sp.build_system_prompt_parts(agent)
    assert ORCH_MARKER not in parts["stable"]


def test_not_injected_for_worker_without_delegate():
    # Delegated workers never carry delegate_task (DELEGATE_BLOCKED_TOOLS).
    agent = _fake_agent(orchestrator_mode=True, tools={"file", "terminal"})
    parts = sp.build_system_prompt_parts(agent)
    assert ORCH_MARKER not in parts["stable"]


def test_idempotent_when_already_orchestrator():
    # Daemon orchestrator sets the prompt as an ephemeral; sentinel guards it.
    agent = _fake_agent(
        orchestrator_mode=True,
        tools={"delegate_task"},
        ephemeral="<!--omniworker:context-protected-->\n# Orquestador",
    )
    parts = sp.build_system_prompt_parts(agent)
    # The registry prompt is not appended again into stable.
    assert parts["stable"].count(ORCH_MARKER) == 0
