"""Resolve FLUX AGENT_HOME for standalone skill scripts.

Skill scripts may run outside the Flux Agent process (e.g. system Python,
nix env, CI) where ``flux-agent_constants`` is not importable.  This module
provides the same ``get_flux-agent_home()`` and ``display_flux-agent_home()``
contracts as ``flux-agent_constants`` without requiring it on ``sys.path``.

When ``flux-agent_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``flux-agent_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``FLUX AGENT_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from flux-agent_constants import display_flux-agent_home as display_flux-agent_home
    from flux-agent_constants import get_flux-agent_home as get_flux-agent_home
except (ModuleNotFoundError, ImportError):

    def get_flux-agent_home() -> Path:
        """Return the Flux Agent home directory (default: ~/.flux-agent).

        Mirrors ``flux-agent_constants.get_flux-agent_home()``."""
        val = os.environ.get("FLUX AGENT_HOME", "").strip()
        return Path(val) if val else Path.home() / ".flux-agent"

    def display_flux-agent_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``flux-agent_constants.display_flux-agent_home()``."""
        home = get_flux-agent_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
