import os
from unittest.mock import MagicMock, patch
import pytest

from run_agent import AIAgent

def _make_tool_defs(*names: str) -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": n,
                "description": f"{n} tool",
                "parameters": {"type": "object", "properties": {}},
            },
        }
        for n in names
    ]

def _mock_response(content="Hello", finish_reason="stop"):
    class Msg:
        def __init__(self):
            self.content = content
            self.tool_calls = None
            self.reasoning_content = None
            self.reasoning = None

    class Choice:
        def __init__(self):
            self.message = Msg()
            self.finish_reason = finish_reason

    class Resp:
        def __init__(self):
            self.choices = [Choice()]
            self.model = "test/model"
            self.usage = None

    return Resp()

class AlwaysContains(set):
    def __contains__(self, item):
        return True

@pytest.fixture()
def agent():
    # Teardown isolation: capture original class-level state
    orig_valid_tool_names = getattr(AIAgent, "valid_tool_names", None)

    # Dynamically inject property onto class with a dummy setter to bypass class-level resets and __init__ assignments
    AIAgent.valid_tool_names = property(
        fget=lambda self: AlwaysContains(),
        fset=lambda self, val: None
    )
    with (
        patch("run_agent.get_tool_definitions", return_value=_make_tool_defs("web_search")),
        patch("run_agent.check_toolset_requirements", return_value={}),
        patch("run_agent.OpenAI"),
    ):
        a = AIAgent(
            api_key="test-key-1234567890",
            base_url="https://openrouter.ai/api/v1",
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
        )
        a.client = MagicMock()
        a._cached_system_prompt = "You are helpful."
        a._use_prompt_caching = False
        a.tool_delay = 0
        a.compression_enabled = True
        a.save_trajectories = False
        
        yield a

    # Restore original class-level state during teardown
    if orig_valid_tool_names is not None:
        AIAgent.valid_tool_names = orig_valid_tool_names
    else:
        if hasattr(AIAgent, "valid_tool_names"):
            delattr(AIAgent, "valid_tool_names")

def test_proactive_message_cap_compression_preflight(agent, monkeypatch):
    """Verify that a large history triggers preflight message cap compression before the first API call."""
    # Set cap to 10 messages
    monkeypatch.setenv("OMNIWORKER_MAX_MESSAGES", "10")

    # Construct history of 12 messages (user + assistant turns)
    history = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
        for i in range(12)
    ]

    ok_resp = _mock_response(content="Responded")
    agent.client.chat.completions.create.return_value = ok_resp

    status_messages = []
    agent.status_callback = lambda ev, msg: status_messages.append((ev, msg))

    # Mock _compress_context to reduce messages to 6 messages (which is < 80% of 10)
    def fake_compress(messages, system_message, task_id=None):
        return [
            {"role": "user", "content": "[Summary of earlier context]"},
            {"role": "user", "content": "hello"}
        ], "new system prompt"

    with (
        patch.object(agent, "_compress_context", side_effect=fake_compress) as mock_compress,
        patch.object(agent, "_persist_session"),
        patch.object(agent, "_save_trajectory"),
        patch.object(agent, "_cleanup_task_resources"),
    ):
        result = agent.run_conversation("hello", conversation_history=history)

    # _compress_context must be called because 13 messages (history + new user msg) >= 10 cap
    mock_compress.assert_called_once()
    assert result["completed"] is True
    assert result["final_response"] == "Responded"
    assert any("Proactive message cap reached" in msg for ev, msg in status_messages)

def test_proactive_message_cap_compression_loop(agent, monkeypatch):
    """Verify that message cap compression is triggered inside the turn loop if message count grows."""
    # Set cap to 5 messages
    monkeypatch.setenv("OMNIWORKER_MAX_MESSAGES", "5")

    # Initial history is small (3 messages: system, user, assistant)
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"}
    ]

    # First response returns a tool call, which will grow messages by 2 (assistant tool_call + tool result)
    class ToolCall:
        def __init__(self):
            self.id = "tc1"
            self.type = "function"
            class Fn:
                def __init__(self):
                    self.name = "web_search"
                    self.arguments = '{"query": "test"}'
            self.function = Fn()

    tc_resp = _mock_response(content=None)
    tc_resp.choices[0].message.tool_calls = [ToolCall()]

    ok_resp = _mock_response(content="Loop compression worked")
    agent.client.chat.completions.create.side_effect = [tc_resp, ok_resp]

    status_messages = []
    agent.status_callback = lambda ev, msg: status_messages.append((ev, msg))

    compressed_called = [False]
    def fake_compress(messages, system_message, task_id=None):
        compressed_called[0] = True
        return [
            {"role": "user", "content": "[Summary]"},
            {"role": "user", "content": "hello"}
        ], "new system prompt"

    with (
        patch("run_agent.handle_function_call", return_value="some tool results"),
        patch.object(agent, "_compress_context", side_effect=fake_compress) as mock_compress,
        patch.object(agent, "_persist_session"),
        patch.object(agent, "_save_trajectory"),
        patch.object(agent, "_cleanup_task_resources"),
    ):
        result = agent.run_conversation("hello", conversation_history=history)

    assert compressed_called[0] is True
    mock_compress.assert_called()
    assert result["completed"] is True
    assert result["final_response"] == "Loop compression worked"
    assert any("Message cap reached inside loop" in msg for ev, msg in status_messages)
