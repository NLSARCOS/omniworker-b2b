"""Regression tests for _apply_profile_override OMNIWORKER_HOME guard (issue #22502).

When OMNIWORKER_HOME is set to the omniworker root (e.g. systemd hardcodes
OMNIWORKER_HOME=/root/.omniworker), _apply_profile_override must still read
active_profile and update OMNIWORKER_HOME to the profile directory.

When OMNIWORKER_HOME is already a profile directory (.../profiles/<name>),
_apply_profile_override must trust it and return without re-reading
active_profile (child-process inheritance contract).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


def _run_apply_profile_override(
    tmp_path, monkeypatch, *, omniworker_home: str | None, active_profile: str | None,
    argv: list[str] | None = None,
):
    """Run _apply_profile_override in isolation.

    Returns the value of os.environ["OMNIWORKER_HOME"] after the call,
    or None if unset.
    """
    omniworker_root = tmp_path / ".omniworker"
    omniworker_root.mkdir(parents=True, exist_ok=True)

    if active_profile is not None:
        (omniworker_root / "active_profile").write_text(active_profile)

    if active_profile and active_profile != "default":
        (omniworker_root / "profiles" / active_profile).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if omniworker_home is not None:
        monkeypatch.setenv("OMNIWORKER_HOME", omniworker_home)
    else:
        monkeypatch.delenv("OMNIWORKER_HOME", raising=False)

    monkeypatch.setattr(sys, "argv", argv or ["omniworker", "gateway", "start"])

    from omniworker_cli.main import _apply_profile_override
    _apply_profile_override()

    return os.environ.get("OMNIWORKER_HOME")


class TestApplyProfileOverrideOmniWorkerHomeGuard:
    """Regression guard for issue #22502.

    Verifies that OMNIWORKER_HOME pointing to the omniworker root does NOT suppress
    the active_profile check, while OMNIWORKER_HOME already pointing to a
    profile directory IS trusted as-is.
    """

    def test_omniworker_home_at_root_with_active_profile_is_redirected(
        self, tmp_path, monkeypatch
    ):
        """OMNIWORKER_HOME=/root/.omniworker + active_profile=coder must redirect
        OMNIWORKER_HOME to .../profiles/coder.

        Bug scenario from #22502: systemd sets OMNIWORKER_HOME to the omniworker root
        and the user switches to a profile via `omniworker profile use`.
        Before the fix, the guard returned early and active_profile was ignored.
        """
        omniworker_root = tmp_path / ".omniworker"
        omniworker_root.mkdir(parents=True, exist_ok=True)

        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            omniworker_home=str(omniworker_root),
            active_profile="coder",
        )

        assert result is not None, "OMNIWORKER_HOME must be set after profile redirect"
        assert "profiles" in result, (
            f"Expected OMNIWORKER_HOME to point into profiles/ dir, got: {result!r}"
        )
        assert result.endswith("coder"), (
            f"Expected OMNIWORKER_HOME to end with 'coder', got: {result!r}"
        )

    def test_omniworker_home_already_profile_dir_is_trusted(self, tmp_path, monkeypatch):
        """OMNIWORKER_HOME=.../profiles/coder must not be overridden even when
        active_profile says something different.

        Preserves the child-process inheritance contract: a subprocess spawned
        with OMNIWORKER_HOME already set to a specific profile must stay in that
        profile.
        """
        omniworker_root = tmp_path / ".omniworker"
        profile_dir = omniworker_root / "profiles" / "coder"
        profile_dir.mkdir(parents=True, exist_ok=True)

        (omniworker_root / "active_profile").write_text("other")

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.setenv("OMNIWORKER_HOME", str(profile_dir))
        monkeypatch.setattr(sys, "argv", ["omniworker", "gateway", "start"])

        from omniworker_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("OMNIWORKER_HOME") == str(profile_dir), (
            "OMNIWORKER_HOME must remain unchanged when already pointing to a profile dir"
        )

    def test_omniworker_home_unset_reads_active_profile(self, tmp_path, monkeypatch):
        """Classic case: OMNIWORKER_HOME unset + active_profile=coder must set
        OMNIWORKER_HOME to the profile directory (existing behaviour must not regress).
        """
        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            omniworker_home=None,
            active_profile="coder",
        )

        assert result is not None
        assert "coder" in result

    def test_omniworker_home_unset_default_profile_no_redirect(self, tmp_path, monkeypatch):
        """active_profile=default must not redirect OMNIWORKER_HOME."""
        omniworker_root = tmp_path / ".omniworker"
        omniworker_root.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.delenv("OMNIWORKER_HOME", raising=False)
        monkeypatch.setattr(sys, "argv", ["omniworker", "gateway", "start"])
        (omniworker_root / "active_profile").write_text("default")

        from omniworker_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("OMNIWORKER_HOME") is None
