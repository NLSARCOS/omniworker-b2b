---
sidebar_position: 11
title: "ACP Editor Integration"
description: "Use OmniWorker Agent inside ACP-compatible editors such as VS Code, Zed, and JetBrains"
---

# ACP Editor Integration

OmniWorker Agent can run as an ACP server, letting ACP-compatible editors talk to OmniWorker over stdio and render:

- chat messages
- tool activity
- file diffs
- terminal commands
- approval prompts
- streamed thinking / response chunks

ACP is a good fit when you want OmniWorker to behave like an editor-native coding agent instead of a standalone CLI or messaging bot.

## What OmniWorker exposes in ACP mode

OmniWorker runs with a curated `omniworker-acp` toolset designed for editor workflows. It includes:

- file tools: `read_file`, `write_file`, `patch`, `search_files`
- terminal tools: `terminal`, `process`
- web/browser tools
- memory, todo, session search
- skills
- execute_code and delegate_task
- vision

It intentionally excludes things that do not fit typical editor UX, such as messaging delivery and cronjob management.

## Installation

Install OmniWorker normally, then add the ACP extra:

```bash
pip install -e '.[acp]'
```

This installs the `agent-client-protocol` dependency and enables:

- `omniworker acp`
- `omniworker-acp`
- `python -m acp_adapter`

For Zed registry installs, Zed launches OmniWorker through the official ACP Registry entry. That entry uses a `uvx` distribution that runs:

```bash
uvx --from 'omniworker-agent[acp]==<version>' omniworker-acp
```

Make sure `uv` is available on `PATH` before using the registry install path.

## Launching the ACP server

Any of the following starts OmniWorker in ACP mode:

```bash
omniworker acp
```

```bash
omniworker-acp
```

```bash
python -m acp_adapter
```

OmniWorker logs to stderr so stdout remains reserved for ACP JSON-RPC traffic.

For non-interactive checks:

```bash
omniworker acp --version
omniworker acp --check
```

### Browser tools (optional)

Browser tools (`browser_navigate`, `browser_click`, etc.) depend on the
`agent-browser` npm package and Chromium, which aren't part of the Python
wheel. Install them with:

```bash
omniworker acp --setup-browser           # interactive (prompts before ~400 MB download)
omniworker acp --setup-browser --yes     # accept the download non-interactively
```

This is the standalone command. The Zed registry's terminal-auth flow (`omniworker acp --setup`) also offers the browser bootstrap as a follow-up question after model selection, so most users never need to run `--setup-browser` directly.

What it does:

- Installs Node.js 22 LTS into `~/.omniworker/node/` if missing
- `npm install -g agent-browser @askjo/camofox-browser` into that prefix (no sudo needed — `npm`'s `--prefix` points at the user-writable OmniWorker-managed Node)
- Installs Playwright Chromium, or uses a detected system Chrome/Chromium when available

The bootstrap is idempotent — re-running it is fast and skips work that's already done.

## Editor setup

### VS Code

Install the [ACP Client](https://marketplace.visualstudio.com/items?itemName=formulahendry.acp-client) extension.

To connect:

1. Open the ACP Client panel from the Activity Bar.
2. Select **OmniWorker Agent** from the built-in agent list.
3. Connect and start chatting.

If you want to define OmniWorker manually, add it through VS Code settings under `acp.agents`:

```json
{
  "acp.agents": {
    "OmniWorker Agent": {
      "command": "omniworker",
      "args": ["acp"]
    }
  }
}
```

### Zed

Zed v0.221.x and newer installs external agents through the official ACP Registry.

1. Open the Agent Panel.
2. Click **Add Agent**, or run the `zed: acp registry` command.
3. Search for **OmniWorker Agent**.
4. Install it and start a new OmniWorker external-agent thread.

Prerequisites:

- Configure OmniWorker provider credentials first with `omniworker model`, or set them in `~/.omniworker/.env` / `~/.omniworker/config.yaml`.
- Install `uv` so the registry launcher can run `uvx --from 'omniworker-agent[acp]==<version>' omniworker-acp`.

For local development before the registry entry is available, use a custom agent server in Zed settings:

```json
{
  "agent_servers": {
    "omniworker-agent": {
      "type": "custom",
      "command": "omniworker",
      "args": ["acp"]
    }
  }
}
```

### JetBrains

Use an ACP-compatible plugin and point it at:

```text
/path/to/omniworker-agent/acp_registry
```

## Registry manifest

The source copy of OmniWorker' official ACP Registry metadata lives at:

```text
acp_registry/agent.json
acp_registry/icon.svg
```

The upstream registry PR copies those files into the top-level `omniworker-agent/` directory in `agentclientprotocol/registry`.

The registry entry uses a `uvx` distribution that points directly at the `omniworker-agent` PyPI release:

```text
uvx --from 'omniworker-agent[acp]==<version>' omniworker-acp
```

The registry CI verifies that the pinned version exists on PyPI, so the manifest's `version` and uvx `package` pin must always match `pyproject.toml`. `scripts/release.py` keeps them in lockstep automatically.

## Configuration and credentials

ACP mode uses the same OmniWorker configuration as the CLI:

- `~/.omniworker/.env`
- `~/.omniworker/config.yaml`
- `~/.omniworker/skills/`
- `~/.omniworker/state.db`

Provider resolution uses OmniWorker' normal runtime resolver, so ACP inherits the currently configured provider and credentials. OmniWorker also advertises a terminal auth method (`--setup`) for first-run registry clients; this opens OmniWorker' interactive model/provider setup.

## Session behavior

ACP sessions are tracked by the ACP adapter's in-memory session manager while the server is running.

Each session stores:

- session ID
- working directory
- selected model
- current conversation history
- cancel event

The underlying `AIAgent` still uses OmniWorker' normal persistence/logging paths, but ACP `list/load/resume/fork` are scoped to the currently running ACP server process.

## Working directory behavior

ACP sessions bind the editor's cwd to the OmniWorker task ID so file and terminal tools run relative to the editor workspace, not the server process cwd.

## Approvals

Dangerous terminal commands can be routed back to the editor as approval prompts. ACP approval options are simpler than the CLI flow:

- allow once
- allow always
- deny

On timeout or error, the approval bridge denies the request.

## Troubleshooting

### ACP agent does not appear in the editor

Check:

- In Zed, open the ACP Registry with `zed: acp registry` and search for **OmniWorker Agent**.
- For manual/local development, verify the custom `agent_servers` command points to `omniworker acp`.
- OmniWorker is installed and on your PATH.
- The ACP extra is installed (`pip install -e '.[acp]'`).
- `uv` is installed if launching from the official Zed registry entry.

### ACP starts but immediately errors

Try these checks:

```bash
omniworker acp --version
omniworker acp --check
omniworker doctor
omniworker status
```

### Missing credentials

ACP mode uses OmniWorker' existing provider setup. Configure credentials with:

```bash
omniworker model
```

or by editing `~/.omniworker/.env`. Registry clients can also trigger OmniWorker' terminal auth flow, which runs the same interactive provider/model setup.

### Zed registry launcher cannot find uv

Install `uv` from the official uv installation docs, then retry the OmniWorker Agent thread from Zed.

## See also

- [ACP Internals](../../developer-guide/acp-internals.md)
- [Provider Runtime Resolution](../../developer-guide/provider-runtime.md)
- [Tools Runtime](../../developer-guide/tools-runtime.md)
