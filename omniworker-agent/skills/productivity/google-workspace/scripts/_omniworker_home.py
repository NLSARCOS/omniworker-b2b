"""Resolve OMNIWORKER_HOME for standalone skill scripts.

Skill scripts may run outside the OmniWorker process (e.g. system Python,
nix env, CI) where ``omniworker_constants`` is not importable.  This module
provides the same ``get_omniworker_home()`` and ``display_omniworker_home()``
contracts as ``omniworker_constants`` without requiring it on ``sys.path``.

When ``omniworker_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``omniworker_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``OMNIWORKER_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from omniworker_constants import display_omniworker_home as display_omniworker_home
    from omniworker_constants import get_omniworker_home as get_omniworker_home
except (ModuleNotFoundError, ImportError):

    def get_omniworker_home() -> Path:
        """Return the OmniWorker home directory (default: ~/.omniworker).

        Mirrors ``omniworker_constants.get_omniworker_home()``."""
        val = os.environ.get("OMNIWORKER_HOME", "").strip()
        return Path(val) if val else Path.home() / ".omniworker"

    def display_omniworker_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``omniworker_constants.display_omniworker_home()``."""
        home = get_omniworker_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
