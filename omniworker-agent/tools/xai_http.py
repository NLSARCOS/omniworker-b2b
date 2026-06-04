"""Shared helpers for direct xAI HTTP integrations."""

from __future__ import annotations


def flux-agent_xai_user_agent() -> str:
    """Return a stable Flux Agent-specific User-Agent for xAI HTTP calls."""
    try:
        from flux-agent_cli import __version__
    except Exception:
        __version__ = "unknown"
    return f"Flux Agent-Agent/{__version__}"
