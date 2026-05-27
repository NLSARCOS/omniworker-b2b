# Sprint 2 — Hardening — Spec

**Scope:** D2-SEC, E4-MEM, B2, E2-THREAD, A1, E1-CHAT, E3-ENGRAM

---

## Requirements

### R1: safeStorage Migration (D2-SEC)
- JWT tokens (access + refresh) MUST be stored using `safeStorage.encryptString()`
- Encrypted buffers MUST be persisted via `electron-store` (not localStorage)
- On read, `safeStorage.decryptString()` MUST be used to retrieve tokens
- Credentials for spawned CLI processes MUST be passed via `spawn()` env option (never written to `.env`)
- If `safeStorage.isEncryptionAvailable()` returns false, fall back to current behavior with a warning log
- Existing plaintext tokens in localStorage and `.env` MUST be migrated on first launch, then deleted

### R2: Memory Provider Timeout (E4-MEM)
- `prefetch_all()` and `sync_all()` MUST use `ThreadPoolExecutor` with a configurable timeout (default: 10s)
- If a provider times out, the system MUST log a warning and continue without that provider's data
- The timeout MUST be configurable via `OMNIWORKER_MEMORY_TIMEOUT` env var (in seconds)
- Timed-out providers MUST NOT block subsequent conversation turns

### R3: Token Estimation Improvement (B2)
- For OpenAI models, `tiktoken` MUST be used for accurate token counting when available
- For non-ASCII-heavy messages (>30% non-ASCII chars), a 1.5x correction factor MUST be applied
- Image token estimation MUST use actual dimensions when available (not flat 1500 constant)
- The system MUST log estimation accuracy metrics (estimated vs actual) for debugging

### R4: ThreadPoolExecutor Cleanup (E2-THREAD)
- After delegation timeout, `child._force_stop` MUST be set to `True`
- `child.interrupt()` MUST be called aggressively after timeout
- The closure reference to the child AIAgent MUST be broken in the `finally` block
- `shutdown(wait=True, cancel_futures=True)` MUST be used instead of `shutdown(wait=False)`

### R5: Conversation Message Cap (A1)
- In-memory message list MUST be capped at 500 messages
- When cap is reached, proactive compression MUST be triggered (not waiting for token threshold)
- The cap MUST be configurable via `OMNIWORKER_MAX_MESSAGES` env var
- After compression, the message count MUST drop below 80% of the cap

### R6: Chat Message Virtualization (E1-CHAT)
- The MessageList component MUST use `react-window` (or equivalent) for virtual rendering
- Only messages visible in the viewport (+buffer) MUST be rendered as DOM nodes
- IPC history payloads MUST be limited to the last 50 messages (not full history)
- A "Load more" button MUST be available to load earlier messages
- The chat MUST display a message count indicator

### R7: Engram Daemon Async Cleanup (E3-ENGRAM)
- `EngramDaemonManager.stopDaemon()` MUST be properly awaited in the quit handler
- The quit handler MUST use `event.preventDefault()` to delay exit until cleanup completes
- After cleanup completes (or 5s timeout), `app.exit(0)` MUST be called
- The handler MUST work with the new process lifecycle from A4-PROC

---

## Scenarios

### Given/When/Then: safeStorage

```
GIVEN the user has existing JWT tokens in localStorage
AND safeStorage is available on the platform
WHEN the app starts after the update
THEN the tokens MUST be migrated to safeStorage
AND localStorage entries MUST be cleared
AND any .env entries with JWT tokens MUST be removed
AND subsequent token reads MUST come from safeStorage
```

### Given/When/Then: Memory Provider Timeout

```
GIVEN a Honcho memory provider configured with endpoint "https://slow-server.com"
AND the provider takes 30 seconds to respond
WHEN the user sends a message
THEN the memory prefetch MUST timeout after 10 seconds
AND the conversation turn MUST proceed without Honcho's data
AND a warning MUST be logged: "Memory provider 'honcho' timed out after 10s"
```

### Given/When/Then: Message Virtualization

```
GIVEN a chat session with 300 messages
WHEN the user views the chat
THEN the DOM MUST contain fewer than 50 message nodes (viewport + buffer)
AND scrolling MUST be smooth (no jank from re-rendering)
AND the IPC payload for new messages MUST include only the last 50 messages
```

### Given/When/Then: Delegation Cleanup

```
GIVEN a subagent delegation that times out after 600 seconds
WHEN the timeout occurs
THEN child._force_stop MUST be True
AND the child AIAgent reference MUST be released (no closure retention)
AND the thread count MUST return to pre-delegation level within 10 seconds
AND RSS MUST not grow more than 10% per timed-out delegation
```
