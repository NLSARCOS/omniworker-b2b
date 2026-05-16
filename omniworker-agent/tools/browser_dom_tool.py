"""
browser_dom_tool.py — Text-DOM browser session for OmniWorker

Provides a screenshot-free browser interaction layer inspired by:
  - alibaba/page-agent  (text-DOM, numbered interactive elements)
  - browser-use         (DOM tree JS extractor)
  - Kimi WebBridge      (persistent session, real DOM state)

The agent gets its own browser session (via agent-browser CDP/local) and
instead of screenshots it reads an LLM-friendly simplified DOM:

    [0]<a >Home />
    [1]<button >Login />
    [2]<input type=text placeholder=Email />
    [3]<a >Forgot password? />
    Sign in to continue

Elements are numbered, cached in-session, and refreshed automatically
when the page DOM changes (via MutationObserver injected once).

Public API
----------
browser_dom_navigate(url, task_id)       -> str (DOM text)
browser_dom_read(task_id)                -> str (current DOM text, cached if unchanged)
browser_dom_click(index, task_id)        -> str (result message)
browser_dom_type(index, text, task_id)   -> str (result message)
browser_dom_select(index, text, task_id) -> str (result message)
browser_dom_scroll(down, pages, task_id) -> str (result message)
browser_dom_eval(script, task_id)        -> str (JS eval result)
browser_dom_close(task_id)               -> None
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Per-session state: stores DOM cache and mutation flag
# ---------------------------------------------------------------------------

_SESSION_LOCK = threading.Lock()

# task_id -> { "dom": str, "dirty": bool, "url": str, "nav_count": int }
_DOM_CACHE: dict[str, dict[str, Any]] = {}


def _get_session(task_id: str) -> dict[str, Any]:
    with _SESSION_LOCK:
        if task_id not in _DOM_CACHE:
            _DOM_CACHE[task_id] = {"dom": "", "dirty": True, "url": "", "nav_count": 0}
        return _DOM_CACHE[task_id]


def _mark_dirty(task_id: str) -> None:
    with _SESSION_LOCK:
        if task_id in _DOM_CACHE:
            _DOM_CACHE[task_id]["dirty"] = True


def _update_cache(task_id: str, dom: str, url: str) -> None:
    with _SESSION_LOCK:
        entry = _DOM_CACHE.setdefault(
            task_id, {"dom": "", "dirty": True, "url": "", "nav_count": 0}
        )
        entry["dom"] = dom
        entry["dirty"] = False
        entry["url"] = url


# ---------------------------------------------------------------------------
# The DOM extractor script (ported from page-agent / browser-use)
# Injected once per session via browser eval; returns simplified HTML text.
# ---------------------------------------------------------------------------

# fmt: off
_DOM_EXTRACTOR_JS = r"""
(function() {
  // ── helpers ────────────────────────────────────────────────────────────

  const INTERACTIVE_TAGS = new Set([
    'a','button','input','select','textarea','details','summary',
    'label','option','optgroup'
  ]);
  const SKIP_TAGS = new Set([
    'script','style','link','meta','noscript','template','svg','head'
  ]);
  const INCLUDE_ATTRS = [
    'type','role','aria-label','placeholder','value','checked',
    'aria-expanded','aria-checked','aria-haspopup','data-state',
    'name','title','alt','for','target','id','contenteditable'
  ];
  const MAX_ATTR_LEN = 30;
  const MAX_TEXT_LEN = 80;

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    } catch(e) { return false; }
    return true;
  }

  function isInteractive(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) return isVisible(el);
    // cursor-based detection
    try {
      const cursor = window.getComputedStyle(el).cursor;
      if (['pointer','move','text','grab','cell','copy','crosshair','zoom-in','zoom-out'].includes(cursor)) return isVisible(el);
    } catch(e) {}
    // role-based
    const role = el.getAttribute('role') || '';
    if (['button','link','checkbox','radio','tab','menuitem','option','combobox','spinbutton','slider','switch','treeitem'].includes(role)) return isVisible(el);
    // contenteditable
    if (el.isContentEditable) return isVisible(el);
    return false;
  }

  // ── index map: index -> element ref ───────────────────────────────────

  window.__owDomIndexMap = window.__owDomIndexMap || [];
  window.__owDomIndexMap = []; // reset each extraction

  let idx = 0;

  // ── serializer ────────────────────────────────────────────────────────

  function serializeEl(el, depth) {
    if (depth > 30) return '';
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return '';
    if (!isVisible(el)) return '';

    const indent = '\t'.repeat(depth);
    const lines = [];

    if (isInteractive(el)) {
      const myIdx = idx++;
      window.__owDomIndexMap.push(el);

      // collect relevant attributes
      const attrParts = [];
      for (const attr of INCLUDE_ATTRS) {
        const val = el.getAttribute(attr);
        if (val !== null && val !== '') {
          attrParts.push(`${attr}=${val.slice(0,MAX_ATTR_LEN)}`);
        }
      }

      // collect direct text
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim())
        .join(' ')
        .slice(0, MAX_TEXT_LEN);

      const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : '';
      const textStr = directText ? `>${directText}` : '';
      lines.push(`${indent}[${myIdx}]<${tag}${attrStr}${textStr} />`);

      // recurse into children but they won't get new index unless also interactive
      for (const child of el.children) {
        const sub = serializeEl(child, depth + 1);
        if (sub) lines.push(sub);
      }
    } else {
      // not interactive — still recurse to find interactive descendants
      const childLines = [];
      for (const child of el.children) {
        const sub = serializeEl(child, depth);
        if (sub) childLines.push(sub);
      }
      // Also emit visible text nodes at this level if no interactive parent
      const textContent = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3 && n.textContent.trim().length > 0)
        .map(n => n.textContent.trim())
        .join(' ')
        .slice(0, MAX_TEXT_LEN);
      if (textContent && isVisible(el) && childLines.length === 0) {
        lines.push(`${indent}${textContent}`);
      }
      lines.push(...childLines);
    }

    return lines.join('\n');
  }

  const body = document.body;
  if (!body) return '(empty page)';

  const domText = serializeEl(body, 0);

  // ── page header ───────────────────────────────────────────────────────

  const url = window.location.href;
  const title = document.title;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ph = document.body.scrollHeight;
  const scrollY = window.scrollY;
  const pagesBelow = Math.max(0, (ph - scrollY - vh) / vh);

  const header = `Page: [${title}](${url})\nViewport: ${vw}x${vh}px | Page height: ${ph}px | Scroll: ${scrollY}px (${pagesBelow.toFixed(1)} pages below)`;
  const footer = pagesBelow > 0.1
    ? `... ${Math.round(ph - scrollY - vh)}px more below — scroll to see more ...`
    : '[End of page]';

  return header + '\n\n' + domText + '\n\n' + footer;
})()
"""

# MutationObserver injected once per session — marks session as dirty on DOM change
_MUTATION_OBSERVER_JS = r"""
(function() {
  if (window.__owMutationObserver) {
    window.__owMutationObserver.disconnect();
  }
  window.__owDomDirty = false;
  const obs = new MutationObserver(() => {
    window.__owDomDirty = true;
  });
  obs.observe(document.body || document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true
  });
  window.__owMutationObserver = obs;
  return 'observer_installed';
})()
"""

_CHECK_DIRTY_JS = "window.__owDomDirty || false"
_RESET_DIRTY_JS = "window.__owDomDirty = false; true"


# ---------------------------------------------------------------------------
# Internal: run browser eval via browser_tool._run_browser_command
# ---------------------------------------------------------------------------

def _eval(script: str, task_id: str, timeout: int = 15) -> tuple[bool, str]:
    """Run a JS eval in the browser session. Returns (success, result_str)."""
    try:
        from tools.browser_tool import _browser_eval, _get_session_info  # type: ignore[import]
        _get_session_info(task_id)  # ensure session exists
        
        # We use _browser_eval because it routes through the CDP WebSocket fast path
        # if a supervisor is alive, avoiding OS limits on CLI argument length for large scripts.
        res_str = _browser_eval(script, task_id=task_id)
        res_json = json.loads(res_str)
        
        if res_json.get("success"):
            val = res_json.get("result", "")
            return True, str(val) if val is not None else ""
        return False, res_json.get("error", "eval failed")
    except Exception as exc:
        logger.warning("browser_dom eval error (task=%s): %s", task_id, exc)
        return False, str(exc)


def _install_observer(task_id: str) -> None:
    ok, res = _eval(_MUTATION_OBSERVER_JS, task_id, timeout=8)
    if not ok:
        logger.debug("MutationObserver install failed (task=%s): %s", task_id, res)


def _is_page_dirty(task_id: str) -> bool:
    """Check if the DOM has changed since the last extraction."""
    ok, res = _eval(_CHECK_DIRTY_JS, task_id, timeout=5)
    if not ok:
        return True  # assume dirty on failure
    return str(res).lower() in ("true", "1")


def _extract_dom(task_id: str) -> str:
    """Run the DOM extractor and return the text representation."""
    ok, dom_text = _eval(_DOM_EXTRACTOR_JS, task_id, timeout=20)
    if not ok:
        return f"(DOM extraction failed: {dom_text})"
    # reset dirty flag in browser
    _eval(_RESET_DIRTY_JS, task_id, timeout=5)
    return dom_text or "(empty)"


# ---------------------------------------------------------------------------
# Click/type/select scripts that operate on window.__owDomIndexMap
# ---------------------------------------------------------------------------

def _click_script(index: int) -> str:
    return f"""
(function() {{
  const map = window.__owDomIndexMap;
  if (!map || !map[{index}]) return 'error: element [{index}] not in index map. Call browser_dom_read first.';
  const el = map[{index}];
  el.focus && el.focus();
  el.click();
  const tag = el.tagName.toLowerCase();
  const text = el.textContent.trim().slice(0,60) || el.getAttribute('aria-label') || '';
  return `clicked [{index}]<${{tag}}> ${{text}}`;
}})()
"""

def _type_script(index: int, text: str) -> str:
    safe = json.dumps(text)
    return f"""
(function() {{
  const map = window.__owDomIndexMap;
  if (!map || !map[{index}]) return 'error: element [{index}] not found. Call browser_dom_read first.';
  const el = map[{index}];
  el.focus && el.focus();
  // Clear existing value
  if ('value' in el) {{
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {{
      nativeInputValueSetter.call(el, {safe});
    }} else {{
      el.value = {safe};
    }}
    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }} else if (el.isContentEditable) {{
    el.textContent = {safe};
    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
  }}
  return `typed into [{index}]: {text[:40]}`;
}})()
"""

def _select_script(index: int, option_text: str) -> str:
    safe = json.dumps(option_text)
    return f"""
(function() {{
  const map = window.__owDomIndexMap;
  if (!map || !map[{index}]) return 'error: element [{index}] not found.';
  const el = map[{index}];
  if (el.tagName.toLowerCase() !== 'select') return 'error: element [{index}] is not a <select>';
  const opt = Array.from(el.options).find(o => o.text.trim() === {safe} || o.value === {safe});
  if (!opt) return `error: option "${{safe}}" not found. Options: ${{Array.from(el.options).map(o=>o.text.trim()).join(', ')}}`;
  el.value = opt.value;
  el.dispatchEvent(new Event('change', {{ bubbles: true }}));
  return `selected "{safe}" in [{index}]`;
}})()
"""

def _scroll_script(down: bool, pages: float) -> str:
    direction = 1 if down else -1
    return f"""
(function() {{
  const amount = {pages} * window.innerHeight * {direction};
  window.scrollBy({{ top: amount, behavior: 'smooth' }});
  return `scrolled ${{amount > 0 ? 'down' : 'up'}} by {pages} pages`;
}})()
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def browser_dom_navigate(url: str, task_id: Optional[str] = None) -> str:
    """
    Navigate to *url* in the agent's browser session and return the text DOM.

    Preferred over browser_navigate for text-only tasks — no screenshot needed.
    Returns the simplified DOM with numbered interactive elements.
    """
    task_id = task_id or "default"
    try:
        from tools.browser_tool import browser_navigate  # type: ignore[import]
        nav_result = browser_navigate(url, task_id=task_id)
    except Exception as exc:
        return f"Navigation error: {exc}"

    _mark_dirty(task_id)
    _install_observer(task_id)

    dom = _extract_dom(task_id)
    _update_cache(task_id, dom, url)

    return f"Navigated to: {url}\n\n{dom}"


def browser_dom_read(task_id: Optional[str] = None, force: bool = False) -> str:
    """
    Return the current page as a numbered text DOM.

    Uses the cached version if the DOM has not changed since the last call
    (checked via MutationObserver). Pass force=True to always re-extract.

    This is the primary "observe" action — call before clicking.
    """
    task_id = task_id or "default"
    session = _get_session(task_id)

    if not force and not session["dirty"] and session["dom"]:
        # Check the browser-side dirty flag too
        if not _is_page_dirty(task_id):
            return session["dom"]

    _install_observer(task_id)
    dom = _extract_dom(task_id)
    try:
        from tools.browser_tool import _run_browser_command  # type: ignore[import]
        url_res = _run_browser_command(task_id, "eval", ["window.location.href"], timeout=5)
        url = url_res.get("data", {}).get("result", "") or session["url"]
    except Exception:
        url = session["url"]

    _update_cache(task_id, dom, url)
    return dom


def browser_dom_click(index: int, task_id: Optional[str] = None) -> str:
    """
    Click element by its numbered index (from browser_dom_read output).

    Example: browser_dom_click(3, task_id="t1") clicks [3]<button>...
    After clicking, the DOM is marked dirty so the next browser_dom_read
    will re-extract.
    """
    task_id = task_id or "default"
    ok, result = _eval(_click_script(index), task_id, timeout=10)
    _mark_dirty(task_id)
    if not ok:
        return f"Click failed: {result}"
    return f"✅ {result}"


def browser_dom_type(index: int, text: str, task_id: Optional[str] = None) -> str:
    """
    Type *text* into input element at *index*.

    Uses React-compatible native input setter so React/Vue state updates work.
    """
    task_id = task_id or "default"
    ok, result = _eval(_type_script(index, text), task_id, timeout=10)
    _mark_dirty(task_id)
    if not ok:
        return f"Type failed: {result}"
    return f"✅ {result}"


def browser_dom_select(index: int, option_text: str, task_id: Optional[str] = None) -> str:
    """
    Select *option_text* in a <select> dropdown at *index*.
    """
    task_id = task_id or "default"
    ok, result = _eval(_select_script(index, option_text), task_id, timeout=10)
    _mark_dirty(task_id)
    if not ok:
        return f"Select failed: {result}"
    return f"✅ {result}"


def browser_dom_scroll(
    down: bool = True,
    pages: float = 0.8,
    task_id: Optional[str] = None,
) -> str:
    """
    Scroll the page up or down by *pages* viewport heights.

    After scrolling, returns the refreshed text DOM (new elements come
    into view so the index map changes).
    """
    task_id = task_id or "default"
    ok, result = _eval(_scroll_script(down, pages), task_id, timeout=8)
    if not ok:
        return f"Scroll failed: {result}"
    # Wait briefly for scroll animation, then re-read
    time.sleep(0.4)
    _mark_dirty(task_id)
    refreshed_dom = browser_dom_read(task_id=task_id, force=True)
    return f"✅ {result}\n\n{refreshed_dom}"


def browser_dom_eval(script: str, task_id: Optional[str] = None) -> str:
    """
    Evaluate arbitrary JavaScript in the browser session and return the result.

    Use sparingly — prefer the typed actions (click, type, select) when possible.
    """
    task_id = task_id or "default"
    ok, result = _eval(script, task_id, timeout=20)
    _mark_dirty(task_id)
    if not ok:
        return f"JS eval failed: {result}"
    return result


def browser_dom_close(task_id: Optional[str] = None) -> None:
    """Clean up the DOM cache for this session."""
    task_id = task_id or "default"
    with _SESSION_LOCK:
        _DOM_CACHE.pop(task_id, None)
    try:
        from tools.browser_tool import browser_close  # type: ignore[import]
        browser_close(task_id=task_id)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Tool registration — uses registry.register() so AST auto-discovery works
# ---------------------------------------------------------------------------
from tools.registry import registry  # noqa: E402
from tools.browser_tool import check_browser_requirements  # noqa: E402

registry.register(
    name="browser_dom_navigate",
    toolset="browser",
    schema={
        "name": "browser_dom_navigate",
        "description": (
            "Navigate to a URL and return the full page as a text DOM with numbered interactive "
            "elements [0]<button>, [1]<input>, etc. Screenshot-free. "
            "Use instead of browser_navigate for form filling and ERP/CRM tasks."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to navigate to"},
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
            },
            "required": ["url"],
        },
    },
    handler=lambda args, **kw: browser_dom_navigate(
        url=args["url"], task_id=kw.get("task_id") or args.get("task_id")
    ),
    check_fn=check_browser_requirements,
    emoji="🌐",
)

registry.register(
    name="browser_dom_read",
    toolset="browser",
    schema={
        "name": "browser_dom_read",
        "description": (
            "Read the current browser page as a numbered text DOM. Cached when DOM is unchanged. "
            "Call this before browser_dom_click/type to discover element indices."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
                "force": {"type": "boolean", "description": "Force re-extraction even if DOM unchanged"},
            },
        },
    },
    handler=lambda args, **kw: browser_dom_read(
        task_id=kw.get("task_id") or args.get("task_id"),
        force=args.get("force", False),
    ),
    check_fn=check_browser_requirements,
    emoji="📄",
)

registry.register(
    name="browser_dom_click",
    toolset="browser",
    schema={
        "name": "browser_dom_click",
        "description": (
            "Click an interactive element by its index number shown in browser_dom_read output. "
            "E.g. browser_dom_click with index=3 clicks [3]<button>Login />"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "index": {"type": "integer", "description": "Element index from browser_dom_read"},
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
            },
            "required": ["index"],
        },
    },
    handler=lambda args, **kw: browser_dom_click(
        index=args["index"], task_id=kw.get("task_id") or args.get("task_id")
    ),
    check_fn=check_browser_requirements,
    emoji="👆",
)

registry.register(
    name="browser_dom_type",
    toolset="browser",
    schema={
        "name": "browser_dom_type",
        "description": (
            "Type text into an input/textarea by its index. "
            "React-compatible — triggers synthetic input/change events."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "index": {"type": "integer", "description": "Element index from browser_dom_read"},
                "text": {"type": "string", "description": "Text to type"},
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
            },
            "required": ["index", "text"],
        },
    },
    handler=lambda args, **kw: browser_dom_type(
        index=args["index"], text=args["text"],
        task_id=kw.get("task_id") or args.get("task_id"),
    ),
    check_fn=check_browser_requirements,
    emoji="⌨️",
)

registry.register(
    name="browser_dom_select",
    toolset="browser",
    schema={
        "name": "browser_dom_select",
        "description": "Select an option in a <select> dropdown by element index and visible option text.",
        "parameters": {
            "type": "object",
            "properties": {
                "index": {"type": "integer", "description": "Element index of the <select>"},
                "option_text": {"type": "string", "description": "Visible text of the option to select"},
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
            },
            "required": ["index", "option_text"],
        },
    },
    handler=lambda args, **kw: browser_dom_select(
        index=args["index"], option_text=args["option_text"],
        task_id=kw.get("task_id") or args.get("task_id"),
    ),
    check_fn=check_browser_requirements,
    emoji="🔽",
)

registry.register(
    name="browser_dom_scroll",
    toolset="browser",
    schema={
        "name": "browser_dom_scroll",
        "description": (
            "Scroll the page and return refreshed text DOM. "
            "Use when interactive elements are below the current viewport."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "down": {"type": "boolean", "description": "True to scroll down, False for up (default True)"},
                "pages": {"type": "number", "description": "Viewport heights to scroll (default 0.8)"},
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
            },
        },
    },
    handler=lambda args, **kw: browser_dom_scroll(
        down=args.get("down", True), pages=args.get("pages", 0.8),
        task_id=kw.get("task_id") or args.get("task_id"),
    ),
    check_fn=check_browser_requirements,
    emoji="📜",
)

registry.register(
    name="browser_dom_eval",
    toolset="browser",
    schema={
        "name": "browser_dom_eval",
        "description": "Evaluate arbitrary JavaScript in the browser session. Use sparingly — prefer typed actions.",
        "parameters": {
            "type": "object",
            "properties": {
                "script": {"type": "string", "description": "JavaScript code to evaluate"},
                "task_id": {"type": "string", "description": "Browser session ID (optional)"},
            },
            "required": ["script"],
        },
    },
    handler=lambda args, **kw: browser_dom_eval(
        script=args["script"], task_id=kw.get("task_id") or args.get("task_id")
    ),
    check_fn=check_browser_requirements,
    emoji="🖥️",
)
