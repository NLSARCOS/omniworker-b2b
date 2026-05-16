import json
import logging
from typing import Dict, Any

from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)

SCRAPLING_SCHEMA = {
    "name": "scrapling_fetch",
    "description": "Fetch a webpage using Scrapling StealthyFetcher to bypass anti-bot protections.",
    "parameters": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL to fetch."
            },
            "selector": {
                "type": "string",
                "description": "Optional CSS selector to extract."
            }
        },
        "required": ["url"]
    }
}

def scrapling_fetch(args: Dict[str, Any], **kwargs) -> str:
    url = args.get("url")
    selector = args.get("selector")
    
    try:
        from scrapling.fetchers import StealthyFetcher
        with StealthyFetcher(headless=True) as browser:
            page = browser.get(url)
            if selector:
                elements = page.css(selector)
                result = [el.text for el in elements]
                return tool_result(success=True, data=result)
            else:
                return tool_result(success=True, data=page.text)
    except ImportError:
        return tool_error("Scrapling is not installed.")
    except Exception as e:
        return tool_error(f"Error fetching URL: {str(e)}")

def check_scrapling_requirements() -> bool:
    try:
        import scrapling
        return True
    except ImportError:
        return False

registry.register(
    name="scrapling_fetch",
    toolset="scrapling",
    schema=SCRAPLING_SCHEMA,
    handler=scrapling_fetch,
    check_fn=check_scrapling_requirements,
    emoji="🕸️",
)
