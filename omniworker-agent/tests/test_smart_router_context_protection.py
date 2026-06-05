"""Context-protection guard for the smart router's chitchat simplification.

The orchestrator (``context_protection: true`` in agent_types.yaml) must never
have its payload simplified — that would strip its tools and replace its
delegation system prompt with the friendly chitchat one.
"""

from smart_router import (
    CONTEXT_PROTECTION_HEADER,
    CONTEXT_PROTECTION_SENTINEL,
    is_context_protected,
    simplify_chitchat_payload,
)


def _payload(system_content="You are a helpful assistant."):
    return {
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": "hola"},
        ],
        "tools": [{"type": "function", "function": {"name": "x"}}],
        "tool_choice": "auto",
    }


def test_not_protected_by_default():
    assert is_context_protected(_payload(), headers={}) is False


def test_protected_via_header():
    assert is_context_protected(_payload(), headers={CONTEXT_PROTECTION_HEADER: "1"}) is True


def test_header_title_case_and_truthy_variants():
    assert is_context_protected(_payload(), headers={"X-Omniworker-Context-Protection": "true"}) is True
    assert is_context_protected(_payload(), headers={CONTEXT_PROTECTION_HEADER: "0"}) is False
    assert is_context_protected(_payload(), headers={CONTEXT_PROTECTION_HEADER: "false"}) is False


def test_protected_via_sentinel_in_system_prompt():
    p = _payload(system_content=f"{CONTEXT_PROTECTION_SENTINEL}\n# Orquestador")
    assert is_context_protected(p, headers={}) is True


def test_detection_never_raises_on_bad_input():
    assert is_context_protected({"messages": None}, headers=None) is False
    assert is_context_protected({}, headers=None) is False


def test_orchestrator_prompt_carries_sentinel():
    from pathlib import Path

    prompt = Path(__file__).resolve().parent.parent / "prompts" / "orchestrator.md"
    assert CONTEXT_PROTECTION_SENTINEL in prompt.read_text(encoding="utf-8")


def test_simplify_still_strips_tools_for_unprotected():
    # Sanity: the optimisation itself is unchanged for normal chitchat.
    out = simplify_chitchat_payload(_payload())
    assert "tools" not in out
    assert out["messages"][0]["role"] == "system"
