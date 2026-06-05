import json
import tempfile
from pathlib import Path
from plugins.memory.offline_fts import OfflineFTSMemoryProvider


def test_offline_fts_lifecycle():
    with tempfile.TemporaryDirectory() as tmpdir:
        provider = OfflineFTSMemoryProvider()
        assert provider.name == "offline_fts"
        assert provider.is_available() is True

        # Initialize provider
        session_id = "test-session-fts"
        provider.initialize(session_id, omniworker_home=tmpdir)

        db = provider._session_db
        assert db is not None

        # Insert test session and messages
        db.create_session(session_id, source="cli")
        db.append_message(session_id, role="user", content="How do I deploy a docker container?")
        db.append_message(session_id, role="assistant", content="You can use docker run or docker-compose.")
        db.append_message(session_id, role="user", content="What about kubernetes?")

        # Verify search retrieves relevant messages
        results = provider._search("docker", limit=5)
        assert len(results) > 0
        contents = [r["content"] for r in results]
        assert any("docker" in c.lower() for c in contents)

        # Verify prefetch outputs relevant context blocks
        pref = provider.prefetch("docker")
        assert "Relevant context from offline local conversation history:" in pref
        assert "docker" in pref.lower()

        # Test tool call handler
        tool_res_str = provider.handle_tool_call(
            "offline_memory_search",
            {"query": "kubernetes", "limit": 2}
        )
        tool_res = json.loads(tool_res_str)
        assert "results" in tool_res
        assert len(tool_res["results"]) > 0
        assert "kubernetes" in tool_res["results"][0]["content"].lower()

        # Shutdown provider
        provider.shutdown()
        assert provider._session_db is None
