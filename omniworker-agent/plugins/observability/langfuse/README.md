# Langfuse Observability Plugin

This plugin ships bundled with OmniWorker but is **opt-in** — it only loads when
you explicitly enable it.

## Enable

Pick one:

```bash
# Interactive: walks you through credentials + SDK install + enable
omniworker tools  # → Langfuse Observability

# Manual
pip install langfuse
omniworker plugins enable observability/langfuse
```

## Required credentials

Set these in `~/.omniworker/.env` (or via `omniworker tools`):

```bash
OMNIWORKER_LANGFUSE_PUBLIC_KEY=pk-lf-...
OMNIWORKER_LANGFUSE_SECRET_KEY=sk-lf-...
OMNIWORKER_LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-hosted URL
```

Without the SDK or credentials the hooks no-op silently — the plugin fails
open.

## Verify

```bash
omniworker plugins list                 # observability/langfuse should show "enabled"
omniworker chat -q "hello"              # then check Langfuse for a "OmniWorker turn" trace
```

## Optional tuning

```bash
OMNIWORKER_LANGFUSE_ENV=production       # environment tag
OMNIWORKER_LANGFUSE_RELEASE=v1.0.0       # release tag
OMNIWORKER_LANGFUSE_SAMPLE_RATE=0.5      # sample 50% of traces
OMNIWORKER_LANGFUSE_MAX_CHARS=12000      # max chars per field (default: 12000)
OMNIWORKER_LANGFUSE_DEBUG=true           # verbose plugin logging
```

## Disable

```bash
omniworker plugins disable observability/langfuse
```
