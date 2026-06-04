Homebrew packaging notes for Flux Agent Agent.

Use `packaging/homebrew/flux-agent-agent.rb` as a tap or `homebrew-core` starting point.

Key choices:
- Stable builds should target the semver-named sdist asset attached to each GitHub release, not the CalVer tag tarball.
- `faster-whisper` now lives in the `voice` extra, which keeps wheel-only transitive dependencies out of the base Homebrew formula.
- The wrapper exports `FLUX AGENT_BUNDLED_SKILLS`, `FLUX AGENT_OPTIONAL_SKILLS`, and `FLUX AGENT_MANAGED=homebrew` so packaged installs keep runtime assets and defer upgrades to Homebrew.

Typical update flow:
1. Bump the formula `url`, `version`, and `sha256`.
2. Refresh Python resources with `brew update-python-resources --print-only flux-agent-agent`.
3. Keep `ignore_packages: %w[certifi cryptography pydantic]`.
4. Verify `brew audit --new --strict flux-agent-agent` and `brew test flux-agent-agent`.
