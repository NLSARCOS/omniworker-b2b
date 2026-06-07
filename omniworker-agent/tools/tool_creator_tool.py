#!/usr/bin/env python3
"""Tool Creator — Agent-Managed Tool Creation & Management

Allows the agent to create, update, and delete **custom tools**: small Python
functions that become first-class tools in the registry, callable by the agent
just like built-in tools.

Custom tools differ from skills:
  • Skills = declarative procedural memory (markdown instructions)
  • Custom tools = imperative executable code (Python handlers)

When the agent notices it repeats the same multi-step workflow across sessions,
creating a custom tool can compress those steps into a single tool call.

Security:
  • All source code is validated by agent/tool_sandbox.py before write.
  • Banned imports: subprocess, socket, urllib, requests, ctypes, etc.
  • Banned builtins: eval, exec, compile, open, input.
  • Banned dunder access: __subclasses__, __globals__, __code__, etc.
  • Tools run in the same process as the agent (no extra sandboxing), so the
    AST validator is the primary security boundary.

Actions:
  create   -- Write a new .py file to ~/.omniworker/custom_tools/ and import it
  edit     -- Overwrite an existing custom tool
  delete   -- Remove a custom tool file
  list     -- Show all custom tools with their descriptions
"""

from __future__ import annotations

import json
import logging
import textwrap
from pathlib import Path
from typing import Dict, Any, Optional

from agent.tool_sandbox import (
    validate_tool_source,
    get_custom_tools_dir,
    list_custom_tools,
    remove_custom_tool,
    load_custom_tools,
)
from tools.registry import registry, tool_result, tool_error

logger = logging.getLogger(__name__)


MAX_SOURCE_CHARS = 50_000   # ~18k tokens at 2.75 chars/token
MAX_NAME_LENGTH = 64


def _validate_tool_name(name: str) -> Optional[str]:
    """Validate a custom tool name. Returns error or None."""
    if not name:
        return "Tool name is required."
    if len(name) > MAX_NAME_LENGTH:
        return f"Tool name exceeds {MAX_NAME_LENGTH} characters."
    if not name.isidentifier():
        return (
            f"Invalid tool name '{name}'. Must be a valid Python identifier: "
            "letters, digits, underscores; cannot start with a digit."
        )
    if name.startswith("_"):
        return "Tool name cannot start with an underscore."
    return None


def _tool_file_path(name: str) -> Path:
    """Return the filesystem path for a custom tool module."""
    return get_custom_tools_dir() / f"{name}.py"


def _read_existing_source(name: str) -> Optional[str]:
    """Return the source of an existing custom tool, or None."""
    p = _tool_file_path(name)
    if p.exists():
        return p.read_text(encoding="utf-8")
    return None


def _tool_description_from_source(source: str) -> str:
    """Extract the description field from the schema dict in source, if present."""
    try:
        import ast
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                for k, v in zip(node.keys, node.values):
                    if isinstance(k, ast.Constant) and k.value == "description":
                        if isinstance(v, ast.Constant):
                            return str(v.value)
        # Fallback: first docstring
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if ast.get_docstring(node):
                    return ast.get_docstring(node) or ""
    except Exception:
        pass
    return ""


def _tool_schema_from_source(source: str) -> dict:
    """Extract the schema dict from registry.register() in source."""
    try:
        import ast
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not isinstance(func, ast.Attribute) or func.attr != "register":
                continue
            for kw in node.keywords:
                if kw.arg == "schema" and isinstance(kw.value, ast.Dict):
                    try:
                        return ast.literal_eval(kw.value)
                    except Exception:
                        pass
    except Exception:
        pass
    return {}


# =============================================================================
# Auto-documentation: keep a skill index of all custom tools
# =============================================================================

_INDEX_SKILL_NAME = "custom-tools-index"


def _update_tool_index_skill() -> None:
    """Regenerate the 'custom-tools-index' skill to reflect current custom tools.

    Best-effort: failures are logged but never block tool creation/deletion.
    """
    try:
        from tools.skill_manager_tool import (
            _create_skill,
            _edit_skill,
            _find_skill,
        )
    except Exception as exc:
        logger.debug("Cannot import skill manager for tool index update: %s", exc)
        return

    tools_info: List[Tuple[str, str, dict]] = []
    for name in list_custom_tools():
        src = _read_existing_source(name)
        if not src:
            continue
        desc = _tool_description_from_source(src)
        schema = _tool_schema_from_source(src)
        tools_info.append((name, desc, schema))

    if not tools_info:
        # No tools → delete index skill if it exists
        existing = _find_skill(_INDEX_SKILL_NAME)
        if existing:
            try:
                from tools.skill_manager_tool import _delete_skill
                _delete_skill(_INDEX_SKILL_NAME, absorbed_into="")
            except Exception:
                pass
        return

    # Build markdown body
    lines: List[str] = [
        "# Custom Tools Index",
        "",
        "This skill is auto-generated by the tool creator. It catalogs all ",
        "agent-created custom tools so the agent knows what is available.",
        "",
        "## Available Custom Tools",
        "",
    ]

    for name, desc, schema in sorted(tools_info):
        lines.append(f"### `{name}`")
        lines.append("")
        lines.append(f"**Description:** {desc or 'No description provided.'}")
        lines.append("")

        params = schema.get("parameters", {})
        props = params.get("properties", {})
        required = set(params.get("required", []))
        if props:
            lines.append("**Parameters:**")
            lines.append("")
            lines.append("| Name | Type | Required | Description |")
            lines.append("|------|------|----------|-------------|")
            for prop_name, prop_info in props.items():
                ptype = prop_info.get("type", "any")
                is_req = "Yes" if prop_name in required else "No"
                pdesc = prop_info.get("description", "")
                lines.append(f"| `{prop_name}` | {ptype} | {is_req} | {pdesc} |")
            lines.append("")

        lines.append("**Example usage:**")
        lines.append("")
        example_args = {}
        for prop_name, prop_info in props.items():
            ptype = prop_info.get("type", "string")
            if ptype == "string":
                example_args[prop_name] = f"example_{prop_name}"
            elif ptype == "integer":
                example_args[prop_name] = 42
            elif ptype == "number":
                example_args[prop_name] = 3.14
            elif ptype == "boolean":
                example_args[prop_name] = True
            else:
                example_args[prop_name] = None
        example_json = json.dumps(example_args, ensure_ascii=False, indent=2)
        lines.append(f"```json")
        lines.append(example_json)
        lines.append("```")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(
        "*Last updated automatically by the tool creator. "
        "Do not edit manually — changes will be overwritten.*"
    )

    skill_body = "\n".join(lines)

    frontmatter = (
        "---\n"
        f"name: {_INDEX_SKILL_NAME}\n"
        "description: \"Auto-generated index of agent-created custom tools.\"\n"
        "version: 1.0.0\n"
        "platforms: [linux, macos, windows]\n"
        "metadata:\n"
        "  omniworker:\n"
        "    tags: [custom-tools, auto-generated, index]\n"
        "    related_skills: []\n"
        "---\n\n"
    )

    full_content = frontmatter + skill_body

    existing = _find_skill(_INDEX_SKILL_NAME)
    if existing:
        _edit_skill(_INDEX_SKILL_NAME, full_content)
    else:
        _create_skill(_INDEX_SKILL_NAME, full_content)


# =============================================================================
# Auto-test helpers
# =============================================================================

def _extract_register_info(source: str) -> tuple[str, dict] | None:
    """Parse source AST and extract (handler_name, schema_dict) from registry.register().

    Returns None if extraction fails.
    """
    try:
        import ast
        tree = ast.parse(source)
    except SyntaxError:
        return None

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute) or func.attr != "register":
            continue
        if not isinstance(func.value, ast.Name) or func.value.id != "registry":
            continue

        handler_name = None
        schema_dict = None
        for kw in node.keywords:
            if kw.arg == "handler" and isinstance(kw.value, ast.Name):
                handler_name = kw.value.id
            if kw.arg == "schema" and isinstance(kw.value, ast.Dict):
                # Best-effort eval of the schema dict literal
                try:
                    schema_dict = ast.literal_eval(kw.value)
                except Exception:
                    pass
        if handler_name and schema_dict:
            return handler_name, schema_dict
    return None


def _build_dummy_args(schema: dict) -> dict:
    """Build dummy argument dict from a JSON-schema-like parameters dict."""
    args: dict = {}
    params = schema.get("parameters", {})
    properties = params.get("properties", {})
    required = set(params.get("required", []))

    for prop_name, prop_info in properties.items():
        if prop_name not in required:
            continue  # skip optional args in self-test
        ptype = prop_info.get("type", "string")
        if ptype == "string":
            args[prop_name] = f"test_{prop_name}"
        elif ptype == "integer":
            args[prop_name] = 42
        elif ptype == "number":
            args[prop_name] = 3.14
        elif ptype == "boolean":
            args[prop_name] = True
        elif ptype == "array":
            args[prop_name] = []
        elif ptype == "object":
            args[prop_name] = {}
        else:
            args[prop_name] = None
    return args


def _run_tool_selftest(name: str, source: str) -> tuple[bool, str]:
    """Execute a lightweight self-test on custom tool source.

    Returns (ok, error_message).  *ok* is True when the handler executes
    without crashing and returns a JSON-string result.
    """
    extracted = _extract_register_info(source)
    if extracted is None:
        return False, "Could not extract registry.register(schema=...) from source."

    handler_name, schema = extracted

    # Build an isolated namespace so the tool's registry.register doesn't
    # pollute the real registry during testing.
    ns: dict = {}
    # Inject safe helpers the tool likely needs
    ns["__name__"] = f"__custom_tool_{name}__"
    ns["json"] = __import__("json")

    # Provide a dummy registry that just captures the call
    class _DummyRegistry:
        def register(self, **kwargs):
            ns["__registered__"] = kwargs

    ns["registry"] = _DummyRegistry()

    # Provide tool_result / tool_error so the handler can call them
    def _tool_result(data=None, **kwargs):
        if data is not None:
            return json.dumps(data, ensure_ascii=False)
        return json.dumps(kwargs, ensure_ascii=False)

    def _tool_error(message, **extra):
        result = {"error": str(message)}
        if extra:
            result.update(extra)
        return json.dumps(result, ensure_ascii=False)

    ns["tool_result"] = _tool_result
    ns["tool_error"] = _tool_error

    try:
        exec(compile(source, f"<custom_tool_{name}>", "exec"), ns)
    except Exception as exc:
        return False, f"Compilation/execution failed: {type(exc).__name__}: {exc}"

    handler = ns.get(handler_name)
    if handler is None:
        return False, f"Handler function '{handler_name}' not found after execution."
    if not callable(handler):
        return False, f"'{handler_name}' is not callable."

    dummy_args = _build_dummy_args(schema)
    try:
        result = handler(dummy_args)
    except Exception as exc:
        return False, f"Handler crashed on dummy args {dummy_args}: {type(exc).__name__}: {exc}"

    if not isinstance(result, str):
        return False, (
            f"Handler returned {type(result).__name__}, expected a JSON string. "
            "Use tool_result(...) or tool_error(...) as the return value."
        )

    try:
        json.loads(result)
    except json.JSONDecodeError as exc:
        return False, f"Handler returned non-JSON string: {exc}"

    return True, ""


# =============================================================================
# Core actions
# =============================================================================

def _create_tool(
    name: str,
    source: str,
) -> Dict[str, Any]:
    """Create a new custom tool after sandbox validation and self-test."""
    err = _validate_tool_name(name)
    if err:
        return {"success": False, "error": err}

    if not source or not source.strip():
        return {"success": False, "error": "source is required for 'create'."}

    if len(source) > MAX_SOURCE_CHARS:
        return {
            "success": False,
            "error": (
                f"Source code is {len(source):,} characters "
                f"(limit: {MAX_SOURCE_CHARS:,}). Consider splitting logic "
                f"into smaller tools."
            ),
        }

    # Collision check
    if _tool_file_path(name).exists():
        return {
            "success": False,
            "error": f"Custom tool '{name}' already exists. Use action='edit' to overwrite.",
        }

    # Sandbox validation
    ok, violations = validate_tool_source(source, expected_name=name)
    if not ok:
        return {
            "success": False,
            "error": "Sandbox validation failed:\n" + "\n".join(f"  • {v}" for v in violations),
        }

    # Self-test before writing to disk
    test_ok, test_err = _run_tool_selftest(name, source)
    if not test_ok:
        return {
            "success": False,
            "error": f"Self-test failed: {test_err}",
        }

    # Write atomically
    get_custom_tools_dir().mkdir(parents=True, exist_ok=True)
    target = _tool_file_path(name)
    target.write_text(source, encoding="utf-8")

    # Attempt to import so it self-registers
    try:
        load_custom_tools()
    except Exception as exc:
        # Roll back on import failure
        target.unlink(missing_ok=True)
        return {
            "success": False,
            "error": f"Tool passed validation but failed to import: {exc}",
        }

    # Update the skill index (best-effort)
    try:
        _update_tool_index_skill()
    except Exception as exc:
        logger.debug("Failed to update tool index skill after create: %s", exc)

    return {
        "success": True,
        "message": f"Custom tool '{name}' created and registered.",
        "path": str(target),
    }


def _edit_tool(name: str, source: str) -> Dict[str, Any]:
    """Overwrite an existing custom tool."""
    err = _validate_tool_name(name)
    if err:
        return {"success": False, "error": err}

    if not source or not source.strip():
        return {"success": False, "error": "source is required for 'edit'."}

    if len(source) > MAX_SOURCE_CHARS:
        return {
            "success": False,
            "error": (
                f"Source code is {len(source):,} characters "
                f"(limit: {MAX_SOURCE_CHARS:,})."
            ),
        }

    if not _tool_file_path(name).exists():
        return {
            "success": False,
            "error": f"Custom tool '{name}' not found. Use action='create' or 'list'.",
        }

    ok, violations = validate_tool_source(source, expected_name=name)
    if not ok:
        return {
            "success": False,
            "error": "Sandbox validation failed:\n" + "\n".join(f"  • {v}" for v in violations),
        }

    # Self-test before writing to disk
    test_ok, test_err = _run_tool_selftest(name, source)
    if not test_ok:
        return {
            "success": False,
            "error": f"Self-test failed: {test_err}",
        }

    # Backup original for rollback
    original = _read_existing_source(name)
    target = _tool_file_path(name)
    target.write_text(source, encoding="utf-8")

    # Re-import to verify it still registers cleanly
    try:
        # Deregister old if present (best-effort)
        from tools.registry import registry
        registry.deregister(name)
    except Exception:
        pass

    try:
        load_custom_tools()
    except Exception as exc:
        if original is not None:
            target.write_text(original, encoding="utf-8")
        return {
            "success": False,
            "error": f"Tool passed validation but failed to re-import: {exc}",
        }

    # Update the skill index (best-effort)
    try:
        _update_tool_index_skill()
    except Exception as exc:
        logger.debug("Failed to update tool index skill after edit: %s", exc)

    return {
        "success": True,
        "message": f"Custom tool '{name}' updated.",
        "path": str(target),
    }


def _delete_tool(name: str) -> Dict[str, Any]:
    """Remove a custom tool."""
    err = _validate_tool_name(name)
    if err:
        return {"success": False, "error": err}

    if not _tool_file_path(name).exists():
        return {
            "success": False,
            "error": f"Custom tool '{name}' not found.",
        }

    # Deregister from live registry
    try:
        registry.deregister(name)
    except Exception:
        pass

    removed = remove_custom_tool(name)
    if removed:
        # Update the skill index (best-effort)
        try:
            _update_tool_index_skill()
        except Exception as exc:
            logger.debug("Failed to update tool index skill after delete: %s", exc)
        return {
            "success": True,
            "message": f"Custom tool '{name}' deleted.",
        }
    return {"success": False, "error": f"Could not delete '{name}'."}


def _list_tools() -> Dict[str, Any]:
    """List all custom tools with descriptions."""
    names = list_custom_tools()
    if not names:
        return {
            "success": True,
            "message": "No custom tools found.",
            "tools": [],
        }

    tools = []
    for n in names:
        src = _read_existing_source(n)
        desc = _tool_description_from_source(src) if src else ""
        tools.append({"name": n, "description": desc})

    return {
        "success": True,
        "message": f"Found {len(tools)} custom tool(s).",
        "tools": tools,
    }


# =============================================================================
# Main entry point
# =============================================================================

def tool_create(
    action: str,
    name: str = "",
    source: str = None,
) -> str:
    """Create, edit, delete, or list agent-authored custom tools.

    Returns a JSON string with results.
    """
    action = (action or "").strip().lower()

    if action == "create":
        if not name:
            return tool_error("name is required for 'create'.", success=False)
        result = _create_tool(name, source or "")
    elif action == "edit":
        if not name:
            return tool_error("name is required for 'edit'.", success=False)
        result = _edit_tool(name, source or "")
    elif action == "delete":
        if not name:
            return tool_error("name is required for 'delete'.", success=False)
        result = _delete_tool(name)
    elif action == "list":
        result = _list_tools()
    else:
        return tool_error(
            f"Unknown action '{action}'. Use: create, edit, delete, list",
            success=False,
        )

    return json.dumps(result, ensure_ascii=False)


# =============================================================================
# OpenAI Function-Calling Schema
# =============================================================================

_TOOL_CREATE_SCHEMA = {
    "name": "tool_create",
    "description": (
        "Create, edit, delete, or list custom Python tools — executable "
        "functions that become first-class tools in the agent's toolkit.\n\n"
        "Custom tools are IMPERATIVE code (Python handlers) that compress "
        "repetitive multi-step workflows into a single tool call. They differ "
        "from skills, which are DECLARATIVE instructions (markdown).\n\n"
        "When to create a custom tool:\n"
        "  • You find yourself running the same 3+ tool calls in the same "
        "order across multiple sessions (e.g. 'search X, then fetch, then parse').\n"
        "  • A workflow is deterministic enough to encode as code, not just "
        "as instructions in a skill.\n"
        "  • You need to do light data transformation (JSON parsing, regex, "
        "math) that would waste tokens if done step-by-step via reasoning.\n\n"
        "Security guardrails:\n"
        "  • Banned imports: subprocess, socket, urllib, requests, ctypes, "
        "sqlite3, etc.\n"
        "  • Banned builtins: eval, exec, compile, open, input.\n"
        "  • Filesystem: use pathlib.Path only (no os.remove, shutil, etc.).\n"
        "  • If you need network/file ops, invoke existing tools (web_search, "
        "terminal, read_file) from inside your handler instead of using raw libraries.\n\n"
        "Auto-test:\n"
        "  • Every tool is automatically executed with dummy arguments before "
        "being saved. If the handler crashes or returns non-JSON, creation is blocked.\n"
        "  • Make sure required parameters have sensible defaults or the tool "
        "handles missing keys gracefully, because the self-test passes empty-ish dummies.\n\n"
        "Source code template:\n"
        "```python\n"
        "import json\n"
        "from tools.registry import registry, tool_result, tool_error\n\n"
        "def my_tool_handler(args: dict, **kwargs) -> str:\n"
        "    query = args.get('query', '')\n"
        "    # ... your logic ...\n"
        "    return tool_result(success=True, data={'result': query.upper()})\n\n"
        "registry.register(\n"
        "    name='my_tool',\n"
        "    toolset='custom',\n"
        "    schema={\n"
        "        'name': 'my_tool',\n"
        "        'description': 'One-line description.',\n"
        "        'parameters': {\n"
        "            'type': 'object',\n"
        "            'properties': {\n"
        "                'query': {'type': 'string', 'description': '...'}\n"
        "            },\n"
        "            'required': ['query']\n"
        "        }\n"
        "    },\n"
        "    handler=my_tool_handler,\n"
        "    emoji='🔧',\n"
        ")\n"
        "```"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create", "edit", "delete", "list"],
                "description": "The action to perform.",
            },
            "name": {
                "type": "string",
                "description": (
                    "Tool name (valid Python identifier, max 64 chars). "
                    "Required for create, edit, delete."
                ),
            },
            "source": {
                "type": "string",
                "description": (
                    "Full Python source code for the tool. Required for 'create' and 'edit'. "
                    "Must include a handler function and a registry.register() call. "
                    "See the tool description for a template."
                ),
            },
        },
        "required": ["action"],
    },
}


# --- Self-register (meta: the tool_creator tool itself is a normal tool) ---
registry.register(
    name="tool_create",
    toolset="custom_tools",
    schema=_TOOL_CREATE_SCHEMA,
    handler=lambda args, **kw: tool_create(
        action=args.get("action", ""),
        name=args.get("name", ""),
        source=args.get("source"),
    ),
    emoji="🔨",
)
