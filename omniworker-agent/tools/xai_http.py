"""Shared helpers for direct xAI HTTP integrations."""

from __future__ import annotations


def omniworker_xai_user_agent() -> str:
    """Return a stable OmniWorker-specific User-Agent for xAI HTTP calls."""
    try:
        from omniworker_cli import __version__
    except Exception:
        __version__ = "unknown"
    return f"OmniWorker-Agent/{__version__}"
