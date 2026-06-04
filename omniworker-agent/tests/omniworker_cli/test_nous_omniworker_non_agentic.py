"""Tests for the Nous-Flux Agent-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"flux-agent"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``flux-agent-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "flux-agent" tag namespace.

``is_nous_flux-agent_non_agentic`` should only match the actual Nous Research
Flux Agent-3 / Flux Agent-4 chat family.
"""

from __future__ import annotations

import pytest

from flux-agent_cli.model_switch import (
    _FLUX AGENT_MODEL_WARNING,
    _check_flux-agent_model_warning,
    is_nous_flux-agent_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "Flux Agent/Flux Agent-3-Llama-3.1-70B",
        "Flux Agent/Flux Agent-3-Llama-3.1-405B",
        "flux-agent-3",
        "Flux Agent-3",
        "flux-agent-4",
        "flux-agent-4-405b",
        "flux-agent_4_70b",
        "openrouter/flux-agent3:70b",
        "openrouter/flux-agent/flux-agent-4-405b",
        "Flux Agent/Flux Agent3",
        "flux-agent-3.1",
    ],
)
def test_matches_real_nous_flux-agent_chat_models(model_name: str) -> None:
    assert is_nous_flux-agent_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous Flux Agent 3/4"
    )
    assert _check_flux-agent_model_warning(model_name) == _FLUX AGENT_MODEL_WARNING


@pytest.mark.parametrize(
    "model_name",
    [
        # Kyle's local Modelfile — qwen3:14b under a custom tag
        "flux-agent-brain:qwen3-14b-ctx16k",
        "flux-agent-brain:qwen3-14b-ctx32k",
        "flux-agent-honcho:qwen3-8b-ctx8k",
        # Plain unrelated models
        "qwen3:14b",
        "qwen3-coder:30b",
        "qwen2.5:14b",
        "claude-opus-4-6",
        "anthropic/claude-sonnet-4.5",
        "gpt-5",
        "openai/gpt-4o",
        "google/gemini-2.5-flash",
        "deepseek-chat",
        # Non-chat Flux Agent models we don't warn about
        "flux-agent-llm-2",
        "flux-agent2-pro",
        "nous-flux-agent-2-mistral",
        # Edge cases
        "",
        "flux-agent",  # bare "flux-agent" isn't the 3/4 family
        "flux-agent-brain",
        "brain-flux-agent-3-impostor",  # "3" not preceded by /: boundary
    ],
)
def test_does_not_match_unrelated_models(model_name: str) -> None:
    assert not is_nous_flux-agent_non_agentic(model_name), (
        f"expected {model_name!r} NOT to be flagged as Nous Flux Agent 3/4"
    )
    assert _check_flux-agent_model_warning(model_name) == ""


def test_none_like_inputs_are_safe() -> None:
    assert is_nous_flux-agent_non_agentic("") is False
    # Defensive: the helper shouldn't crash on None-ish falsy input either.
    assert _check_flux-agent_model_warning("") == ""
