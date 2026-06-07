"""Tests for tools/tool_creator_tool.py — agent-managed tool creation."""

import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch

from tools.tool_creator_tool import tool_create, _validate_tool_name
from tools.registry import registry


VALID_SOURCE = '''
import json
from tools.registry import registry, tool_result

def demo_handler(args, **kwargs):
    name = args.get("name", "world")
    return tool_result(success=True, data={"greeting": f"Hello, {name}!"})

registry.register(
    name="demo_greet",
    toolset="custom",
    schema={
        "name": "demo_greet",
        "description": "Greets someone.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Who to greet"}
            },
            "required": ["name"]
        }
    },
    handler=demo_handler,
    emoji="👋",
)
'''


class TestValidateToolName:
    def test_empty_name(self):
        assert _validate_tool_name("") is not None

    def test_invalid_identifier(self):
        assert _validate_tool_name("123abc") is not None

    def test_underscore_prefix(self):
        assert _validate_tool_name("_private") is not None

    def test_too_long(self):
        assert _validate_tool_name("a" * 65) is not None

    def test_valid_name(self):
        assert _validate_tool_name("my_tool") is None


class TestToolCreate:
    def _patch_dirs(self, monkeypatch, custom_dir: Path):
        """Patch both tool_creator and tool_sandbox to use the same temp dir."""
        monkeypatch.setattr(
            "tools.tool_creator_tool.get_custom_tools_dir",
            lambda: custom_dir,
        )
        monkeypatch.setattr(
            "agent.tool_sandbox.get_custom_tools_dir",
            lambda: custom_dir,
        )

    def test_create_success(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            result = json.loads(tool_create("create", name="demo_greet", source=VALID_SOURCE))
            assert result["success"] is True
            assert "created" in result["message"].lower()
            assert (custom_dir / "demo_greet.py").exists()

    def test_create_duplicate_fails(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            tool_create("create", name="demo_greet", source=VALID_SOURCE)
            result = json.loads(tool_create("create", name="demo_greet", source=VALID_SOURCE))
            assert result["success"] is False
            assert "already exists" in result["error"].lower()

    def test_create_sandbox_blocked(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            bad_source = VALID_SOURCE.replace("import json", "import subprocess")
            result = json.loads(tool_create("create", name="bad_tool", source=bad_source))
            assert result["success"] is False
            assert "sandbox" in result["error"].lower()

    def test_list_empty(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            result = json.loads(tool_create("list"))
            assert result["success"] is True
            assert result["tools"] == []

    def test_list_with_tools(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            tool_create("create", name="demo_greet", source=VALID_SOURCE)
            result = json.loads(tool_create("list"))
            assert result["success"] is True
            assert len(result["tools"]) == 1
            assert result["tools"][0]["name"] == "demo_greet"

    def test_delete_success(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            tool_create("create", name="demo_greet", source=VALID_SOURCE)
            result = json.loads(tool_create("delete", name="demo_greet"))
            assert result["success"] is True
            assert "deleted" in result["message"].lower()
            assert not (custom_dir / "demo_greet.py").exists()

    def test_delete_not_found(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            result = json.loads(tool_create("delete", name="missing"))
            assert result["success"] is False

    def test_edit_success(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            tool_create("create", name="demo_greet", source=VALID_SOURCE)
            edited = VALID_SOURCE.replace("Hello", "Howdy")
            result = json.loads(tool_create("edit", name="demo_greet", source=edited))
            assert result["success"] is True
            assert "updated" in result["message"].lower()
            content = (custom_dir / "demo_greet.py").read_text(encoding="utf-8")
            assert "Howdy" in content

    def test_edit_sandbox_blocked(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            tool_create("create", name="demo_greet", source=VALID_SOURCE)
            bad_source = VALID_SOURCE.replace("import json", "import subprocess")
            result = json.loads(tool_create("edit", name="demo_greet", source=bad_source))
            assert result["success"] is False
            assert "sandbox" in result["error"].lower()

    def test_unknown_action(self):
        result = json.loads(tool_create("fly", name="x"))
        assert result["success"] is False
        assert "unknown action" in result["error"].lower()

    # ------------------------------------------------------------------
    # Self-test coverage
    # ------------------------------------------------------------------

    def test_selftest_blocks_crashing_handler(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            crash_source = VALID_SOURCE.replace(
                'return tool_result(success=True, data={"greeting": f"Hello, {name}!"})',
                'raise ValueError("boom")',
            )
            result = json.loads(tool_create("create", name="crash_tool", source=crash_source))
            assert result["success"] is False
            assert "self-test" in result["error"].lower()
            assert "crashed" in result["error"].lower()

    def test_selftest_blocks_non_json_return(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            bad_source = VALID_SOURCE.replace(
                'return tool_result(success=True, data={"greeting": f"Hello, {name}!"})',
                'return {"this_is_a_dict": True}',  # dict instead of JSON string
            )
            result = json.loads(tool_create("create", name="bad_ret", source=bad_source))
            assert result["success"] is False
            assert "self-test" in result["error"].lower()
            assert "json" in result["error"].lower()

    def test_selftest_passes_valid_tool(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp)
            self._patch_dirs(monkeypatch, custom_dir)
            result = json.loads(tool_create("create", name="good_tool", source=VALID_SOURCE))
            assert result["success"] is True
            assert "self-test" not in result.get("error", "").lower()

    # ------------------------------------------------------------------
    # Auto-documentation coverage
    # ------------------------------------------------------------------

    def _patch_skills_dir(self, monkeypatch, skills_dir: Path):
        """Patch skill_manager to use a temp dir so tests don't touch ~/.omniworker."""
        monkeypatch.setattr(
            "tools.skill_manager_tool.SKILLS_DIR",
            skills_dir,
        )

    def test_autodoc_creates_index_skill(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp) / "tools"
            skills_dir = Path(tmp) / "skills"
            custom_dir.mkdir()
            skills_dir.mkdir()
            self._patch_dirs(monkeypatch, custom_dir)
            self._patch_skills_dir(monkeypatch, skills_dir)

            result = json.loads(tool_create("create", name="demo_greet", source=VALID_SOURCE))
            assert result["success"] is True

            index_path = skills_dir / "custom-tools-index" / "SKILL.md"
            assert index_path.exists(), "Index skill should be auto-created"
            content = index_path.read_text(encoding="utf-8")
            assert "demo_greet" in content
            assert "Custom Tools Index" in content

    def test_autodoc_updates_on_delete(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            custom_dir = Path(tmp) / "tools"
            skills_dir = Path(tmp) / "skills"
            custom_dir.mkdir()
            skills_dir.mkdir()
            self._patch_dirs(monkeypatch, custom_dir)
            self._patch_skills_dir(monkeypatch, skills_dir)

            # Create two tools
            tool_create("create", name="tool_a", source=VALID_SOURCE)
            tool_create("create", name="tool_b", source=VALID_SOURCE.replace("demo_greet", "tool_b"))

            index_path = skills_dir / "custom-tools-index" / "SKILL.md"
            content = index_path.read_text(encoding="utf-8")
            assert "tool_a" in content
            assert "tool_b" in content

            # Delete one
            tool_create("delete", name="tool_a")

            # Index should still exist but only contain tool_b
            content = index_path.read_text(encoding="utf-8")
            assert "tool_b" in content
            assert "tool_a" not in content
