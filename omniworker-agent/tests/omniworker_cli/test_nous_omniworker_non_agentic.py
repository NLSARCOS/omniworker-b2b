"""Tests for the Nous-OmniWorker-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"omniworker"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``omniworker-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "omniworker" tag namespace.

``is_nous_omniworker_non_agentic`` should only match the actual Nous Research
OmniWorker-3 / OmniWorker-4 chat family.
"""

from __future__ import annotations

import pytest

from omniworker_cli.model_switch import (
    _OMNIWORKER_MODEL_WARNING,
    _check_omniworker_model_warning,
    is_nous_omniworker_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "OmniWorker/OmniWorker-3-Llama-3.1-70B",
        "OmniWorker/OmniWorker-3-Llama-3.1-405B",
        "omniworker-3",
        "OmniWorker-3",
        "omniworker-4",
        "omniworker-4-405b",
        "omniworker_4_70b",
        "openrouter/omniworker3:70b",
        "openrouter/omniworker/omniworker-4-405b",
        "OmniWorker/OmniWorker3",
        "omniworker-3.1",
    ],
)
def test_matches_real_nous_omniworker_chat_models(model_name: str) -> None:
    assert is_nous_omniworker_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous OmniWorker 3/4"
    )
    assert _check_omniworker_model_warning(model_name) == _OMNIWORKER_MODEL_WARNING


@pytest.mark.parametrize(
    "model_name",
    [
        # Kyle's local Modelfile — qwen3:14b under a custom tag
        "omniworker-brain:qwen3-14b-ctx16k",
        "omniworker-brain:qwen3-14b-ctx32k",
        "omniworker-honcho:qwen3-8b-ctx8k",
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
        # Non-chat OmniWorker models we don't warn about
        "omniworker-llm-2",
        "omniworker2-pro",
        "nous-omniworker-2-mistral",
        # Edge cases
        "",
        "omniworker",  # bare "omniworker" isn't the 3/4 family
        "omniworker-brain",
        "brain-omniworker-3-impostor",  # "3" not preceded by /: boundary
    ],
)
def test_does_not_match_unrelated_models(model_name: str) -> None:
    assert not is_nous_omniworker_non_agentic(model_name), (
        f"expected {model_name!r} NOT to be flagged as Nous OmniWorker 3/4"
    )
    assert _check_omniworker_model_warning(model_name) == ""


def test_none_like_inputs_are_safe() -> None:
    assert is_nous_omniworker_non_agentic("") is False
    # Defensive: the helper shouldn't crash on None-ish falsy input either.
    assert _check_omniworker_model_warning("") == ""
