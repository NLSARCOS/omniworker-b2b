"""Tests for agent/tool_sandbox.py — AST-based security validation."""

import pytest
import tempfile
from pathlib import Path

from agent.tool_sandbox import (
    validate_tool_source,
    get_custom_tools_dir,
    list_custom_tools,
    load_custom_tools,
    remove_custom_tool,
)


class TestValidateToolSource:
    def test_empty_source_fails(self):
        ok, violations = validate_tool_source("")
        assert not ok
        assert "empty" in violations[0].lower()

    def test_valid_tool_passes(self):
        source = '''
import json
from tools.registry import registry, tool_result

def my_handler(args, **kwargs):
    return tool_result(success=True, data={"x": 1})

registry.register(
    name="my_tool",
    toolset="custom",
    schema={"name": "my_tool", "description": "test", "parameters": {"type": "object", "properties": {}}},
    handler=my_handler,
)
'''
        ok, violations = validate_tool_source(source)
        assert ok, f"Unexpected violations: {violations}"
        assert not violations

    def test_banned_import_subprocess(self):
        source = '''
import subprocess
from tools.registry import registry
def h(args, **kw): pass
registry.register(name="t", toolset="custom", schema={}, handler=h)
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("subprocess" in v for v in violations)

    def test_banned_import_from_urllib(self):
        source = '''
from urllib.request import urlopen
from tools.registry import registry
def h(args, **kw): pass
registry.register(name="t", toolset="custom", schema={}, handler=h)
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("urllib" in v for v in violations)

    def test_banned_builtin_eval(self):
        source = '''
from tools.registry import registry
def h(args, **kw):
    return eval("1+1")
registry.register(name="t", toolset="custom", schema={}, handler=h)
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("eval" in v for v in violations)

    def test_banned_dunder_subclasses(self):
        source = '''
from tools.registry import registry
def h(args, **kw):
    return object.__subclasses__()
registry.register(name="t", toolset="custom", schema={}, handler=h)
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("__subclasses__" in v for v in violations)

    def test_delete_statement_blocked(self):
        source = '''
from tools.registry import registry
x = 1
del x
def h(args, **kw): pass
registry.register(name="t", toolset="custom", schema={}, handler=h)
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("delet" in v.lower() for v in violations)

    def test_missing_handler_fails(self):
        source = '''
from tools.registry import registry
registry.register(name="t", toolset="custom", schema={}, handler=lambda x: x)
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("handler" in v.lower() for v in violations)

    def test_missing_register_fails(self):
        source = '''
def h(args, **kw):
    return "ok"
'''
        ok, violations = validate_tool_source(source)
        assert not ok
        assert any("register" in v.lower() for v in violations)

    def test_safe_imports_allowed(self):
        source = '''
import json
import re
import math
from datetime import datetime
from pathlib import Path
from tools.registry import registry, tool_result

def h(args, **kw):
    return tool_result(success=True, data={"now": str(datetime.now())})

registry.register(name="t", toolset="custom", schema={}, handler=h)
'''
        ok, violations = validate_tool_source(source)
        assert ok, f"Unexpected violations: {violations}"


class TestCustomToolsDir:
    def test_get_custom_tools_dir_returns_path(self):
        d = get_custom_tools_dir()
        assert isinstance(d, Path)
        assert "custom_tools" in str(d)

    def test_list_custom_tools_empty(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            monkeypatch.setattr(
                "agent.tool_sandbox.get_custom_tools_dir",
                lambda: Path(tmp),
            )
            assert list_custom_tools() == []

    def test_list_custom_tools_finds_py_files(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "foo.py").write_text("# foo", encoding="utf-8")
            (d / "bar.py").write_text("# bar", encoding="utf-8")
            monkeypatch.setattr(
                "agent.tool_sandbox.get_custom_tools_dir",
                lambda: d,
            )
            assert list_custom_tools() == ["bar", "foo"]

    def test_remove_custom_tool(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "baz.py").write_text("# baz", encoding="utf-8")
            monkeypatch.setattr(
                "agent.tool_sandbox.get_custom_tools_dir",
                lambda: d,
            )
            assert remove_custom_tool("baz") is True
            assert not (d / "baz.py").exists()
            assert remove_custom_tool("baz") is False
