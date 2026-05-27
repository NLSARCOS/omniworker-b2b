# Sprint 1 — Critical Path — Spec

**Scope:** B3, C2-STREAM, D1-SEC, E1-SSE, A4-PROC, A6, C3-TOKEN

---

## Requirements

### R1: Auxiliary Context Validation (B3)
- Before calling `call_llm` for compression summary, the system MUST estimate the prompt size
- If the prompt size exceeds 80% of the auxiliary model's context length, the content MUST be truncated
- A warning MUST be logged when truncation occurs, including the original and truncated token counts
- Truncation MUST preserve the most recent content (truncate from the beginning of the content)

### R2: Streaming Billing Reconciliation (C2-STREAM)
- Streaming responses MUST use a `TransformStream` to count actual SSE chunks
- After the stream completes (`flush()`), the system MUST reconcile estimated vs actual tokens
- If the estimated cost exceeds actual by more than 10%, the difference MUST be refunded to the license balance
- If the stream is interrupted (client disconnect), reconciliation MUST still occur (via background task or error handler)
- The flat `completionTokensEst=500` hardcoded estimate MUST be removed

### R3: Remove webSecurity:false (D1-SEC)
- `webSecurity: false` MUST be removed from the BrowserWindow options
- API calls from the renderer MUST be proxied through main process IPC
- The IPC proxy MUST forward the response status, headers, and body faithfully
- The proxy MUST support both JSON responses and streaming (SSE) responses
- A feature flag (`OMNIWORKER_LEGACY_WEB_SECURITY=1`) SHOULD be available for emergency rollback

### R4: SSE Watchdog Timeout (E1-SSE)
- A watchdog timer MUST be set at 90 seconds of inactivity
- The timer MUST reset on each received `data` event
- On timeout, the system MUST call `controller.abort()`
- The renderer MUST be notified of the timeout with an actionable error message
- The user MUST be able to retry the request after a timeout

### R5: Process Lifecycle Cleanup (A4-PROC)
- `detached: true` MUST be removed from all child process `spawn()` calls
- On application startup, the system MUST check for orphan processes from previous sessions
- PIDs of spawned processes MUST be recorded in `~/.omniworker/pids.json`
- On `will-quit`, ALL spawned processes MUST be gracefully stopped with a 5-second timeout
- If graceful stop fails, `SIGKILL` MUST be sent as fallback
- `EngramDaemonManager.stopDaemon()` MUST be properly awaited in the quit handler

### R6: Tool Output Size Cap (A6)
- Tool results MUST be truncated at insertion time to a configurable maximum (default: 200KB)
- Truncated results MUST include a `[truncated: N bytes omitted]` marker at the end
- The cap MUST be configurable via environment variable `OMNIWORKER_MAX_TOOL_OUTPUT`
- Binary content (images, files) MUST be excluded from the cap (handled separately)

### R7: Token Estimation Non-ASCII (C3-TOKEN)
- Token estimation for the SaaS billing MUST apply a 1.5x multiplier for messages where >30% of characters are non-ASCII
- The system SHOULD use `tiktoken` for OpenAI models when available
- For streaming, the estimate MUST be based on actual prompt size, not a flat number

---

## Scenarios

### Given/When/Then: Auxiliary Context

```
GIVEN main model has 200K context and auxiliary model has 32K context
AND the conversation has 100K+ tokens to compress
WHEN compression is triggered
THEN the compression prompt MUST be truncated to fit within 80% of 32K (25.6K tokens)
AND a warning MUST be logged
AND the summary MUST still be generated (not skipped)
```

### Given/When/Then: SSE Timeout

```
GIVEN an active SSE stream between desktop and agent
AND the agent stops sending data (crash/hang)
WHEN 90 seconds pass without any data event
THEN the stream MUST be aborted
AND the renderer MUST show "Agent appears unresponsive. Retry?"
AND the user MUST be able to retry without restarting the app
```

### Given/When/Then: Orphan Cleanup

```
GIVEN the Electron app was force-quit (kill -9) with gateway running on port 8642
AND pids.json contains the gateway PID
WHEN the app is restarted
THEN the system MUST detect the orphan process
AND MUST kill it before attempting to start a new gateway
AND MUST clean up the PID file entry
```

### Given/When/Then: Tool Output Cap

```
GIVEN a tool returns 5MB of output (e.g., reading a large file)
WHEN the result is inserted into the conversation
THEN only the first 200KB MUST be stored
AND "[truncated: 4.8MB omitted]" MUST be appended
AND the agent MUST be informed of the truncation
```
