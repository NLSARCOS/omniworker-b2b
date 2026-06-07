"""Sandbox validator for agent-created tools.

Performs static analysis (AST-based) on Python source code to enforce
security boundaries before a custom tool is written to disk or imported.

Rules enforced:
  • No imports from banned modules (subprocess, socket, urllib, etc.)
  • No calls to dangerous builtins (eval, exec, compile, __import__)
  • No attribute access on dunder internals (__subclasses__, __globals__, etc.)
  • No deletion of module-level names (prevents registry.unregister)
  • Must define a handler function with the expected signature
  • Must include a valid registry.register() call
"""

from __future__ import annotations

import ast
import builtins
import logging
from pathlib import Path
from typing import List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


# =============================================================================
# Banned lists
# =============================================================================

# Modules whose import is always blocked.
_BANNED_MODULES: Set[str] = {
    "subprocess",
    "socket",
    "socketserver",
    "asyncore",
    "asynchat",
    "ctypes",
    "ctypeslib",
    "multiprocessing",
    "concurrent.futures.process",
    "pickle",
    "cPickle",
    "shelve",
    "marshal",
    "imp",
    "zipimport",
    "runpy",
    "code",
    "codeop",
    "pty",
    "tty",
    "pipes",
    "spwd",
    "crypt",
    "nis",
    "msvcrt",
    "winreg",
    "winsound",
    "msilib",
    "_winapi",
    "posix",
    "pwd",
    "grp",
    "resource",
    "syslog",
    "fcntl",
    "termios",
    "ssl",
    "http",
    "http.client",
    "http.server",
    "urllib",
    "urllib.request",
    "urllib.parse",
    "urllib.error",
    "urllib.robotparser",
    "urllib3",
    "requests",
    "aiohttp",
    "httpx",
    "httplib2",
    "pycurl",
    "paramiko",
    "fabric",
    "telnetlib",
    "ftplib",
    "smtplib",
    "poplib",
    "imaplib",
    "nntplib",
    "email",
    "email.mime",
    "webbrowser",
    "dbm",
    "dbm.dumb",
    "dbm.gnu",
    "dbm.ndbm",
    "gdbm",
    "sqlite3",
    "psycopg2",
    "pymongo",
    "redis",
    "pymysql",
    "sqlalchemy",
    "django",
    "flask",
    "fastapi",
    "tornado",
    "twisted",
    "scrapy",
    "selenium",
    "playwright",
    "popen2",
    "commands",
    "tempfile",  # agent can use terminal() for temp needs
    "shutil",    # agent can use terminal() for file ops
}

# Built-in functions that are always blocked.
_BANNED_BUILTINS: Set[str] = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "open",      # use Path.read_text / write_text instead
    "input",
    "raw_input",
    "breakpoint",
    "exit",
    "quit",
    "help",
}

# Dangerous dunder attributes.
_BANNED_DUNDERS: Set[str] = {
    "__subclasses__",
    "__bases__",
    "__base__",
    "__globals__",
    "__code__",
    "__func__",
    "__closure__",
    "__defaults__",
    "__kwdefaults__",
    "__module__",
    "__class__",
    "__mro__",
    "__prepare__",
    "__init_subclass__",
    "__subclasshook__",
    "__getattribute__",
    "__getattr__",
    "__setattr__",
    "__delattr__",
    "__dict__",
    "__weakref__",
    "__slots__",
}

# Modules that are explicitly allowed (safe stdlib).
_ALLOWED_MODULES: Set[str] = {
    "json",
    "re",
    "math",
    "random",
    "statistics",
    "datetime",
    "time",
    "calendar",
    "decimal",
    "fractions",
    "numbers",
    "typing",
    "collections",
    "collections.abc",
    "itertools",
    "functools",
    "operator",
    "hashlib",
    "base64",
    "binascii",
    "string",
    "textwrap",
    "inspect",
    "types",
    "enum",
    "dataclasses",
    "copy",
    " pprint",
    "uuid",
    "html",
    "html.parser",
    "html.entities",
    "xml.etree.ElementTree",
    "xml.dom.minidom",
    "difflib",
    "fnmatch",
    "glob",
    "linecache",
    "traceback",
    "warnings",
    "contextlib",
    "abc",
    "weakref",
    "pickletools",
    "keyword",
    "token",
    "tokenize",
    "ast",
    "dis",
    "importlib",
    "pkgutil",
    "modulefinder",
    "pathlib",
    "os.path",
    "pathlib",
    "pathlib",
}


class ToolSandboxError(Exception):
    """Raised when a custom tool fails sandbox validation."""
    pass


class _SandboxVisitor(ast.NodeVisitor):
    """AST visitor that collects every policy violation in a single pass."""

    def __init__(self, source: str) -> None:
        self.source = source
        self.violations: List[str] = []
        self._handlers: List[str] = []
        self._has_register = False

    # ------------------------------------------------------------------
    # Imports
    # ------------------------------------------------------------------
    def visit_Import(self, node: ast.Import) -> None:  # noqa: N802
        for alias in node.names:
            top = alias.name.split(".")[0]
            if top in _BANNED_MODULES or alias.name in _BANNED_MODULES:
                self.violations.append(
                    f"Banned import: '{alias.name}' (line {node.lineno})"
                )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:  # noqa: N802
        module = node.module or ""
        top = module.split(".")[0]
        if top in _BANNED_MODULES or module in _BANNED_MODULES:
            self.violations.append(
                f"Banned import from: '{module}' (line {node.lineno})"
            )
        for alias in node.names:
            # Also ban importing specific dangerous names from allowed modules
            if alias.name in _BANNED_BUILTINS:
                self.violations.append(
                    f"Banned builtin import: '{alias.name}' from '{module}' (line {node.lineno})"
                )
        self.generic_visit(node)

    # ------------------------------------------------------------------
    # Calls
    # ------------------------------------------------------------------
    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        if isinstance(node.func, ast.Name):
            if node.func.id in _BANNED_BUILTINS:
                self.violations.append(
                    f"Banned builtin call: '{node.func.id}()' (line {node.lineno})"
                )
        self.generic_visit(node)

    # ------------------------------------------------------------------
    # Attribute access (dunder banning)
    # ------------------------------------------------------------------
    def visit_Attribute(self, node: ast.Attribute) -> None:  # noqa: N802
        if node.attr in _BANNED_DUNDERS:
            self.violations.append(
                f"Banned dunder access: '.{node.attr}' (line {node.lineno})"
            )
        self.generic_visit(node)

    # ------------------------------------------------------------------
    # Deletions (prevent unregistering tools, etc.)
    # ------------------------------------------------------------------
    def visit_Delete(self, node: ast.Delete) -> None:  # noqa: N802
        self.violations.append(
            f"Deletion statements are not allowed (line {node.lineno})"
        )
        self.generic_visit(node)

    # ------------------------------------------------------------------
    # Tracking: handler definitions + registry.register calls
    # ------------------------------------------------------------------
    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        self._handlers.append(node.name)
        self.generic_visit(node)

    def visit_Expr(self, node: ast.Expr) -> None:  # noqa: N802
        # Detect ``registry.register(...)`` calls
        call = node.value
        if isinstance(call, ast.Call):
            if self._is_registry_register(call):
                self._has_register = True
        self.generic_visit(node)

    def _is_registry_register(self, call: ast.Call) -> bool:
        """Heuristic: is this call expression ``registry.register(...)``?"""
        func = call.func
        if isinstance(func, ast.Attribute) and func.attr == "register":
            if isinstance(func.value, ast.Name) and func.value.id == "registry":
                return True
        return False


# =============================================================================
# Public API
# =============================================================================

def validate_tool_source(
    source: str,
    expected_name: Optional[str] = None,
) -> Tuple[bool, List[str]]:
    """Validate a proposed custom tool source against the sandbox policy.

    Returns ``(ok, violations)`` where *ok* is True when the code passes all
    checks and *violations* is a list of human-readable error strings.

    Checks performed:
      1. Parseable Python (SyntaxError → not ok)
      2. No banned imports or builtins
      3. No dangerous dunder access
      4. No deletion statements
      5. Contains at least one function definition (the handler)
      6. Contains a ``registry.register(...)`` call
    """
    if not isinstance(source, str) or not source.strip():
        return False, ["Source code is empty."]

    # 1. Parse
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return False, [f"Syntax error: {exc}"]

    visitor = _SandboxVisitor(source)
    visitor.visit(tree)

    violations = list(visitor.violations)

    # 5. Handler check
    if not visitor._handlers:
        violations.append(
            "Tool source must define at least one function (the tool handler)."
        )

    # 6. Registry registration check
    if not visitor._has_register:
        violations.append(
            "Tool source must call 'registry.register(...)' to self-register. "
            "See existing tools in tools/ for the pattern."
        )

    return not violations, violations


def get_custom_tools_dir() -> Path:
    """Return the directory where agent-created custom tools are stored."""
    from omniworker_constants import get_omniworker_home

    return get_omniworker_home() / "custom_tools"


def list_custom_tools() -> List[str]:
    """Return a list of custom tool module names (without .py extension)."""
    d = get_custom_tools_dir()
    if not d.exists():
        return []
    return sorted(
        p.stem for p in d.glob("*.py") if p.name != "__init__.py"
    )


def load_custom_tools() -> List[str]:
    """Import every custom tool module so they self-register in the tool registry.

    Returns a list of successfully loaded module names.  Import failures are
    logged and swallowed so a single broken custom tool doesn't break the
    whole agent startup.
    """
    d = get_custom_tools_dir()
    loaded: List[str] = []
    if not d.exists():
        return loaded

    # Ensure the directory is on sys.path temporarily so imports work
    import sys

    str_path = str(d)
    inserted = False
    if str_path not in sys.path:
        sys.path.insert(0, str_path)
        inserted = True

    try:
        for py_file in sorted(d.glob("*.py")):
            if py_file.name == "__init__.py":
                continue
            mod_name = py_file.stem
            # Must be a valid Python identifier
            if not mod_name.isidentifier():
                logger.warning("Skipping invalid custom tool filename: %s", py_file.name)
                continue
            try:
                import importlib

                importlib.import_module(mod_name)
                loaded.append(mod_name)
                logger.debug("Loaded custom tool: %s", mod_name)
            except Exception as exc:
                logger.warning(
                    "Failed to load custom tool %s: %s", mod_name, exc
                )
    finally:
        if inserted:
            try:
                sys.path.remove(str_path)
            except ValueError:
                pass

    return loaded


def remove_custom_tool(name: str) -> bool:
    """Delete a custom tool file from disk. Returns True if removed."""
    d = get_custom_tools_dir()
    target = d / f"{name}.py"
    if target.exists():
        target.unlink()
        return True
    return False
