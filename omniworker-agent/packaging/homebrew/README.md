Homebrew packaging notes for OmniWorker Agent.

Use `packaging/homebrew/omniworker-agent.rb` as a tap or `homebrew-core` starting point.

Key choices:
- Stable builds should target the semver-named sdist asset attached to each GitHub release, not the CalVer tag tarball.
- `faster-whisper` now lives in the `voice` extra, which keeps wheel-only transitive dependencies out of the base Homebrew formula.
- The wrapper exports `OMNIWORKER_BUNDLED_SKILLS`, `OMNIWORKER_OPTIONAL_SKILLS`, and `OMNIWORKER_MANAGED=homebrew` so packaged installs keep runtime assets and defer upgrades to Homebrew.

Typical update flow:
1. Bump the formula `url`, `version`, and `sha256`.
2. Refresh Python resources with `brew update-python-resources --print-only omniworker-agent`.
3. Keep `ignore_packages: %w[certifi cryptography pydantic]`.
4. Verify `brew audit --new --strict omniworker-agent` and `brew test omniworker-agent`.
