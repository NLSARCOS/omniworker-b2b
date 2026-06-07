"""Scrapling stealthy web scraping tool for Flux Agent.

Uses Scrapling's StealthyFetcher to bypass anti-bot protections
(Cloudflare Turnstile, etc.). Auto-installs via lazy deps on first use.

Exposes LLM-callable tools:
  scrapling_fetch -- fetch a webpage with stealth browser
"""

import json
import logging
import subprocess
import sys
from typing import Dict, Any

from tools.registry import registry, tool_error, tool_result
from tools.lazy_deps import ensure, is_available

logger = logging.getLogger(__name__)

SCRAPLING_FEATURE = "tool.scrapling"


def _check_scrapling_requirements() -> bool:
    """Check if scrapling is available (installed or lazily installable)."""
    try:
        import scrapling  # noqa: F401
        return True
    except ImportError:
        pass
    # If not installed yet, report as available so the tool stays registered.
    # The actual lazy-install happens inside the handler on first invocation.
    return is_available(SCRAPLING_FEATURE)


def _ensure_browsers_installed() -> None:
    """Run ``scrapling install`` if browser binaries are missing.

    Scrapling's StealthyFetcher needs Playwright-compatible browser binaries.
    The ``scrapling install`` command downloads them on first use. We gate this
    with a lightweight marker file so we don't re-run on every invocation.
    """
    from pathlib import Path

    marker = Path.home() / ".cache" / "scrapling" / ".browsers_installed"
    if marker.exists():
        return

    logger.info("Installing Scrapling browser binaries (first-time setup)...")
    try:
        r = subprocess.run(
            [sys.executable, "-m", "scrapling", "install"],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if r.returncode == 0:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text("ok")
            logger.info("Scrapling browsers installed successfully.")
        else:
            logger.warning("scrapling install failed: %s", r.stderr[:500])
    except Exception as e:
        logger.warning("scrapling install error: %s", e)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCRAPLING_SCHEMA = {
    "name": "scrapling_fetch",
    "description": (
        "Fetch a webpage using Scrapling StealthyFetcher to bypass anti-bot "
        "protections (Cloudflare, etc.). Returns the page text content. "
        "Optionally extract specific elements with a CSS selector."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL to fetch.",
            },
            "selector": {
                "type": "string",
                "description": "Optional CSS selector to extract specific elements.",
            },
        },
        "required": ["url"],
    },
}


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

async def _handle_scrapling_fetch(args: Dict[str, Any], **kwargs) -> str:
    url = args.get("url", "").strip()
    selector = args.get("selector", "").strip()

    if not url:
        return tool_error("url is required.")

    # Lazy-install scrapling + fetcher deps on first use
    try:
        ensure(SCRAPLING_FEATURE, prompt=False)
    except Exception as e:
        return tool_error(
            f"Scrapling is not installed and auto-install failed: {e}. "
            f"Run manually: uv pip install scrapling[fetchers]==0.4.8 && scrapling install"
        )

    # Ensure browser binaries are downloaded
    _ensure_browsers_installed()

    try:
        from scrapling.fetchers import StealthyFetcher

        # Use the correct Scrapling 0.4.x API: class-level fetch()
        page = StealthyFetcher.fetch(url, headless=True, network_idle=True)

        if selector:
            elements = page.css(selector)
            if not elements:
                return json.dumps({
                    "success": True,
                    "data": [],
                    "message": f"No elements found for selector: {selector}",
                    "url": url,
                }, ensure_ascii=False)
            result = [el.text for el in elements]
            return json.dumps({
                "success": True,
                "data": result,
                "count": len(result),
                "url": url,
            }, ensure_ascii=False)
        else:
            return json.dumps({
                "success": True,
                "data": page.text,
                "url": url,
            }, ensure_ascii=False)

    except ImportError:
        return tool_error(
            "Scrapling import failed after install. Try restarting the agent."
        )
    except Exception as e:
        logger.error("scrapling_fetch error: %s", e)
        return tool_error(f"Error fetching URL: {e}")


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

registry.register(
    name="scrapling_fetch",
    toolset="scrapling",
    schema=SCRAPLING_SCHEMA,
    handler=_handle_scrapling_fetch,
    check_fn=_check_scrapling_requirements,
    is_async=True,
    emoji="🕸️",
)
