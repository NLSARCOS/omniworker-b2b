"""Guard: every toolset named in agent_types.yaml must be a real toolset.

Regression test for the "phantom toolset" bug — the registry once named
``delegate``/``code_exec`` which do not exist (real names: ``delegation``/
``code_execution``), so those agents silently lost the ability to delegate and
run code. This keeps the registry honest against toolsets.py.
"""

import pytest

from toolsets import TOOLSETS
from agent.agent_registry import load_agent_registry


def test_every_registry_toolset_exists():
    valid = set(TOOLSETS.keys())
    reg = load_agent_registry(force=True)
    offenders = {}
    for name in reg.names():
        cfg = reg.get(name)
        bad = [t for t in cfg.toolset if t not in valid]
        if bad:
            offenders[name] = bad
    assert not offenders, (
        f"agent_types.yaml names toolsets that don't exist in toolsets.py: {offenders}. "
        f"Valid toolsets: {sorted(valid)}"
    )


def test_orchestrator_can_delegate():
    # The orchestrator's whole job is delegation — it must carry that toolset.
    reg = load_agent_registry(force=True)
    assert "delegation" in reg.get("orchestrator").toolset


@pytest.mark.parametrize("agent_name", ["developer", "code_runner", "data_analyst"])
def test_code_agents_can_execute(agent_name):
    reg = load_agent_registry(force=True)
    assert "code_execution" in reg.get(agent_name).toolset
