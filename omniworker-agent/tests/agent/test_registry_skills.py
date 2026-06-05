"""Per-agent pre-loaded skills (objetivo 2: 'skills pre-cargados')."""

import textwrap

from agent.agent_registry import load_agent_registry


def test_skills_field_parsed(tmp_path):
    yaml_text = textwrap.dedent(
        """
        version: 1
        agents:
          developer:
            role: "Dev"
            provider: zai
            model: glm-5
            model_family: glm
            toolset: [file]
            skills: [git-workflow, testing]
          plain:
            role: "Plain"
            provider: zai
            model: glm-5
            model_family: glm
            toolset: [file]
        """
    )
    p = tmp_path / "agent_types.yaml"
    p.write_text(yaml_text, encoding="utf-8")

    reg = load_agent_registry(path=p, force=True)
    assert reg.get("developer").skills == ["git-workflow", "testing"]
    # Default is an empty list, never None — safe to iterate.
    assert reg.get("plain").skills == []


def test_real_registry_skills_default_empty():
    # The shipped registry declares no skills yet; field must still be present.
    reg = load_agent_registry(force=True)
    for name in reg.names():
        assert isinstance(reg.get(name).skills, list)
