"""Tests for the model opacity boundary (strip_model_info)."""

from gateway.model_opacity import SENSITIVE_KEYS, strip_model_info


def test_strips_top_level_infra_keys():
    payload = {"agent": "marketer", "status": "working", "model": "glm-5", "provider": "zai"}
    out = strip_model_info(payload)
    assert out == {"agent": "marketer", "status": "working"}


def test_strips_nested_and_lists():
    payload = {
        "event": "progress",
        "meta": {"base_url": "https://x", "api_key": "sk-secret", "keep": 1},
        "children": [{"model": "kimi-k2", "ok": True}, {"provider": "zai", "n": 2}],
    }
    out = strip_model_info(payload)
    assert out["meta"] == {"keep": 1}
    assert out["children"] == [{"ok": True}, {"n": 2}]


def test_humanises_agent_id():
    out = strip_model_info(
        {"agent": "marketer", "x": 1}, display_map={"marketer": "Agente de Marketing"}
    )
    assert out["agent"] == "Agente de Marketing"


def test_does_not_mutate_input():
    payload = {"model": "glm-5", "keep": 1}
    _ = strip_model_info(payload)
    assert payload == {"model": "glm-5", "keep": 1}  # original untouched


def test_all_sensitive_keys_removed():
    payload = {k: "x" for k in SENSITIVE_KEYS}
    payload["keep"] = 1
    out = strip_model_info(payload)
    assert out == {"keep": 1}


def test_extra_keys():
    out = strip_model_info({"secret_token": "x", "keep": 1}, extra_keys=["secret_token"])
    assert out == {"keep": 1}


def test_non_container_passthrough():
    assert strip_model_info("hello") == "hello"
    assert strip_model_info(42) == 42
    assert strip_model_info(None) is None
