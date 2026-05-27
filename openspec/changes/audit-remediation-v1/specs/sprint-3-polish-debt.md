# Sprint 3 — Polish & Debt — Spec

**Scope:** E5-PROMPT, D8-CSP, C5-PREFETCH, D9-STREAM, D10-SCHEMA, D11-FLOAT, E4-FTS, B6, PC1, D12-CASCADE, A3, B1

---

## Requirements

### R1: Lazy-Load Tool Schemas (E5-PROMPT)
- The prompt builder MUST only include full schemas for tools used in the last N turns (default: 5)
- For other tools, a compact index (name + one-line description) MUST be included instead
- For final-response calls (no tool use expected), `tool_choice='none'` SHOULD be set
- The system MUST measure and log the token savings compared to current behavior

### R2: Nonce-Based CSP (D8-CSP)
- `unsafe-inline` MUST be replaced with nonce-based CSP for Next.js scripts
- `unsafe-eval` MUST be removed in production builds
- A unique nonce MUST be generated per request
- The CSP header MUST allow Next.js hydration and inline scripts via nonce

### R3: Prefetch Cache Cap (C5-PREFETCH)
- `_ext_prefetch_cache` string MUST be capped at 32,000 characters (~8,000 tokens)
- If cap is exceeded, content MUST be truncated with `[prefetch truncated: N chars omitted]` marker
- The cap MUST be configurable via `OMNIWORKER_PREFETCH_MAX_CHARS` env var

### R4: Stream Error Handling (D9-STREAM)
- The streaming pipe MUST be wrapped in a `TransformStream` that catches upstream errors
- On upstream error, a proper SSE error event MUST be injected before closing the stream
- Billing MUST be reconciled on error (refund undelivered tokens)
- The client MUST receive a parseable error event, not a truncated response

### R5: Database Indices (D10-SCHEMA)
- `@@index([userId])` MUST be added to `TaskLog`
- `@@index([tenantId])` MUST be added to `TaskLog`
- `@@index([createdAt])` MUST be added to `TaskLog`
- `@@index([provider, isActive])` MUST be added to `MasterProvider`
- `@@index([family])` MUST be added to `RefreshToken`
- `@@index([tenantId])` MUST be added to `User`
- A Prisma migration MUST be generated and applied

### R6: Float to Int for Billing (D11-FLOAT)
- `SubscriptionPlan.price` MUST be changed from `Float` to `Int` (representing cents)
- `Invoice.amount` MUST be changed from `Float` to `Int` (representing cents)
- A data migration MUST convert existing values: `Math.round(value * 100)`
- All business logic referencing these fields MUST be updated to work with cents

### R7: FTS5 Optimization (E4-FTS)
- After `prune_sessions()`, the FTS5 optimize command MUST be executed
- The command: `INSERT INTO messages_fts(messages_fts) VALUES('optimize')`
- This MUST run asynchronously to not block the pruning operation

### R8: Image Token Constant Unification (B6)
- `_IMAGE_TOKEN_COST` (model_metadata.py) and `_IMAGE_TOKEN_ESTIMATE` (context_compressor.py) MUST be unified to a single constant
- The constant MUST be defined in one location and imported by both modules
- The value MUST be 1600 tokens (the higher of the two, for safety)

### R9: Prompt Caching Shallow Copy (PC1)
- `copy.deepcopy(api_messages)` MUST be replaced with targeted copies
- Only messages that will be modified (system + last 3) MUST be deep-copied
- Other messages MUST use shallow references (no copy)

### R10: Cascade Deletes (D12-CASCADE)
- Foreign keys for Tenant → License, User, EdgeAgent, TaskLog MUST have `onDelete` policies
- License → related records MUST cascade
- User → TaskLog MUST cascade; User → Session SHOULD set null
- Business rules for each relationship MUST be documented in the schema

### R11: Active Subagents Sweeper (A3)
- A periodic sweeper (every 60s) MUST clean stale entries from `_active_subagents`
- Entries where the thread is dead MUST be removed
- Entries where `started_at` exceeds 2x the timeout MUST be removed

### R12: Anti-Thrashing Reset (B1)
- `_ineffective_compression_count` MUST reset when the model or context window changes
- A `reset_anti_thrashing()` method MUST be callable from `/compress` command
- The counter SHOULD reset after a successful compression (saving >20%)

---

## Scenarios

### Given/When/Then: Tool Schema Lazy-Loading

```
GIVEN 70 tools are registered and the last 3 turns used only "terminal" and "read_file"
WHEN the prompt is built for the next API call
THEN full schemas MUST be included only for "terminal" and "read_file"
AND remaining 68 tools MUST appear as a compact index (name + description only)
AND the total tool token overhead MUST be <5,000 tokens (vs current 20-30K)
```

### Given/When/Then: Stream Error

```
GIVEN a streaming response from the LLM provider
AND the provider connection drops mid-stream
WHEN the client receives the truncated stream
THEN the last SSE event MUST be: data: {"error": "Provider connection lost"}
AND tokens for undelivered content MUST be refunded
```

### Given/When/Then: Float to Int Migration

```
GIVEN a SubscriptionPlan with price=29.99
WHEN the migration runs
THEN the value MUST become priceInCents=2999
AND all API responses MUST format prices as dollars (priceInCents / 100)
AND no existing billing functionality MUST break
```
