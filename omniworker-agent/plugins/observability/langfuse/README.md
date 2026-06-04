# Langfuse Observability Plugin

This plugin ships bundled with Flux Agent but is **opt-in** — it only loads when
you explicitly enable it.

## Enable

Pick one:

```bash
# Interactive: walks you through credentials + SDK install + enable
flux-agent tools  # → Langfuse Observability

# Manual
pip install langfuse
flux-agent plugins enable observability/langfuse
```

## Required credentials

Set these in `~/.flux-agent/.env` (or via `flux-agent tools`):

```bash
FLUX AGENT_LANGFUSE_PUBLIC_KEY=pk-lf-...
FLUX AGENT_LANGFUSE_SECRET_KEY=sk-lf-...
FLUX AGENT_LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-hosted URL
```

Without the SDK or credentials the hooks no-op silently — the plugin fails
open.

## Verify

```bash
flux-agent plugins list                 # observability/langfuse should show "enabled"
flux-agent chat -q "hello"              # then check Langfuse for a "Flux Agent turn" trace
```

## Optional tuning

```bash
FLUX AGENT_LANGFUSE_ENV=production       # environment tag
FLUX AGENT_LANGFUSE_RELEASE=v1.0.0       # release tag
FLUX AGENT_LANGFUSE_SAMPLE_RATE=0.5      # sample 50% of traces
FLUX AGENT_LANGFUSE_MAX_CHARS=12000      # max chars per field (default: 12000)
FLUX AGENT_LANGFUSE_DEBUG=true           # verbose plugin logging
```

## Disable

```bash
flux-agent plugins disable observability/langfuse
```
