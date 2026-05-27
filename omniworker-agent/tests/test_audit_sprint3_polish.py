import time
import threading
from unittest.mock import MagicMock
from agent.context_compressor import ContextCompressor
from tools.delegate_tool import (
    _register_subagent,
    _unregister_subagent,
    _sweep_active_subagents,
    _active_subagents,
    _get_child_timeout,
)

def test_anti_thrashing_reset():
    # 1. Instantiate ContextCompressor
    compressor = ContextCompressor(
        model="openai/gpt-4o-mini",
        threshold_percent=0.50,
        protect_first_n=2,
        protect_last_n=2,
        summary_target_ratio=0.20,
    )

    # 2. Assert initialized at 0
    assert compressor._ineffective_compression_count == 0

    # 3. Simulate increments
    compressor._ineffective_compression_count = 3
    assert compressor._ineffective_compression_count == 3

    # 4. Reset manually
    compressor.reset_anti_thrashing()
    assert compressor._ineffective_compression_count == 0

    # 5. Verify update_model resets it
    compressor._ineffective_compression_count = 2
    compressor.update_model("openai/gpt-4o-mini", 32000)
    assert compressor._ineffective_compression_count == 0

def test_subagents_sweeper():
    # 1. Create a dead mock thread holder
    mock_thread = MagicMock()
    mock_thread.is_alive.return_value = False
    
    dead_holder = {"t": mock_thread}

    # 2. Register mock subagent with dead thread
    dead_sid = "subagent-test-dead"
    dead_record = {
        "subagent_id": dead_sid,
        "parent_id": None,
        "depth": 0,
        "goal": "Test goal",
        "model": "openai/gpt-4o-mini",
        "started_at": time.time(),
        "status": "running",
        "tool_count": 0,
        "thread_holder": dead_holder,
    }

    _register_subagent(dead_record)
    assert dead_sid in _active_subagents

    # 3. Create a stale record (duration exceeded 2x child timeout)
    timeout = _get_child_timeout()
    stale_sid = "subagent-test-stale"
    stale_record = {
        "subagent_id": stale_sid,
        "parent_id": None,
        "depth": 0,
        "goal": "Stale goal",
        "model": "openai/gpt-4o-mini",
        "started_at": time.time() - (timeout * 3.0),  # Well beyond 2x timeout
        "status": "running",
        "tool_count": 0,
    }

    _register_subagent(stale_record)
    assert stale_sid in _active_subagents

    # 4. Trigger the sweeper logic directly
    _sweep_active_subagents()

    # 5. Assert dead thread and stale records are completely pruned
    assert dead_sid not in _active_subagents
    assert stale_sid not in _active_subagents
