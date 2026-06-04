"""Regression tests for _apply_profile_override FLUX AGENT_HOME guard (issue #22502).

When FLUX AGENT_HOME is set to the flux-agent root (e.g. systemd hardcodes
FLUX AGENT_HOME=/root/.flux-agent), _apply_profile_override must still read
active_profile and update FLUX AGENT_HOME to the profile directory.

When FLUX AGENT_HOME is already a profile directory (.../profiles/<name>),
_apply_profile_override must trust it and return without re-reading
active_profile (child-process inheritance contract).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


def _run_apply_profile_override(
    tmp_path, monkeypatch, *, flux-agent_home: str | None, active_profile: str | None,
    argv: list[str] | None = None,
):
    """Run _apply_profile_override in isolation.

    Returns the value of os.environ["FLUX AGENT_HOME"] after the call,
    or None if unset.
    """
    flux-agent_root = tmp_path / ".flux-agent"
    flux-agent_root.mkdir(parents=True, exist_ok=True)

    if active_profile is not None:
        (flux-agent_root / "active_profile").write_text(active_profile)

    if active_profile and active_profile != "default":
        (flux-agent_root / "profiles" / active_profile).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if flux-agent_home is not None:
        monkeypatch.setenv("FLUX AGENT_HOME", flux-agent_home)
    else:
        monkeypatch.delenv("FLUX AGENT_HOME", raising=False)

    monkeypatch.setattr(sys, "argv", argv or ["flux-agent", "gateway", "start"])

    from flux-agent_cli.main import _apply_profile_override
    _apply_profile_override()

    return os.environ.get("FLUX AGENT_HOME")


class TestApplyProfileOverrideFlux AgentHomeGuard:
    """Regression guard for issue #22502.

    Verifies that FLUX AGENT_HOME pointing to the flux-agent root does NOT suppress
    the active_profile check, while FLUX AGENT_HOME already pointing to a
    profile directory IS trusted as-is.
    """

    def test_flux-agent_home_at_root_with_active_profile_is_redirected(
        self, tmp_path, monkeypatch
    ):
        """FLUX AGENT_HOME=/root/.flux-agent + active_profile=coder must redirect
        FLUX AGENT_HOME to .../profiles/coder.

        Bug scenario from #22502: systemd sets FLUX AGENT_HOME to the flux-agent root
        and the user switches to a profile via `flux-agent profile use`.
        Before the fix, the guard returned early and active_profile was ignored.
        """
        flux-agent_root = tmp_path / ".flux-agent"
        flux-agent_root.mkdir(parents=True, exist_ok=True)

        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            flux-agent_home=str(flux-agent_root),
            active_profile="coder",
        )

        assert result is not None, "FLUX AGENT_HOME must be set after profile redirect"
        assert "profiles" in result, (
            f"Expected FLUX AGENT_HOME to point into profiles/ dir, got: {result!r}"
        )
        assert result.endswith("coder"), (
            f"Expected FLUX AGENT_HOME to end with 'coder', got: {result!r}"
        )

    def test_flux-agent_home_already_profile_dir_is_trusted(self, tmp_path, monkeypatch):
        """FLUX AGENT_HOME=.../profiles/coder must not be overridden even when
        active_profile says something different.

        Preserves the child-process inheritance contract: a subprocess spawned
        with FLUX AGENT_HOME already set to a specific profile must stay in that
        profile.
        """
        flux-agent_root = tmp_path / ".flux-agent"
        profile_dir = flux-agent_root / "profiles" / "coder"
        profile_dir.mkdir(parents=True, exist_ok=True)

        (flux-agent_root / "active_profile").write_text("other")

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.setenv("FLUX AGENT_HOME", str(profile_dir))
        monkeypatch.setattr(sys, "argv", ["flux-agent", "gateway", "start"])

        from flux-agent_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("FLUX AGENT_HOME") == str(profile_dir), (
            "FLUX AGENT_HOME must remain unchanged when already pointing to a profile dir"
        )

    def test_flux-agent_home_unset_reads_active_profile(self, tmp_path, monkeypatch):
        """Classic case: FLUX AGENT_HOME unset + active_profile=coder must set
        FLUX AGENT_HOME to the profile directory (existing behaviour must not regress).
        """
        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            flux-agent_home=None,
            active_profile="coder",
        )

        assert result is not None
        assert "coder" in result

    def test_flux-agent_home_unset_default_profile_no_redirect(self, tmp_path, monkeypatch):
        """active_profile=default must not redirect FLUX AGENT_HOME."""
        flux-agent_root = tmp_path / ".flux-agent"
        flux-agent_root.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.delenv("FLUX AGENT_HOME", raising=False)
        monkeypatch.setattr(sys, "argv", ["flux-agent", "gateway", "start"])
        (flux-agent_root / "active_profile").write_text("default")

        from flux-agent_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("FLUX AGENT_HOME") is None
