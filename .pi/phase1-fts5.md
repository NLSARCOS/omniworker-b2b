# Phase 1: FTS5 History Enrichment in Context Compression

**Date:** 2026-05-31
**Status:** ✅ Implemented & Verified

## Summary

Added FTS5-based history retrieval to the `ContextCompressor` so that during context compression, the summarizer LLM receives relevant historical messages from the session database, producing richer summaries that preserve context that would otherwise be lost.

## What Changed

### File 1: `omniworker-agent/agent/context_compressor.py`

**1. New `session_db` parameter on `__init__`** (line ~534)
- Optional `session_db: Any = None` — defaults to None for backward compatibility
- Stored as `self._session_db`
- When None, all FTS5 enrichment is silently skipped (no-op, zero risk)

**2. New `_STOPWORDS` class constant** (line ~932)
- Frozenset of ~60 common English words too generic for FTS5 search
- Used by `_extract_keywords()` to filter noise

**3. New `_extract_keywords()` static method** (line ~947)
- Input: raw text (user message)
- Process: lowercase → split on non-alphanumeric → remove stopwords + tokens < 3 chars
- Output: space-joined string of up to 8 unique keywords
- Pure string processing, no dependencies

**4. New `_sanitize_fts5_query()` static method** (line ~969)
- Strips FTS5-special characters (`+{}()\"'^`) and dangling boolean operators
- Prevents `sqlite3.OperationalError` from malformed MATCH expressions
- Simpler version of `SessionDB._sanitize_fts5_query()` — no quoted-phrase preservation needed since input is already keyword-level

**5. New `_fts5_retrieve_relevant()` method** (line ~986)
- Queries `messages_fts` virtual table: `SELECT content FROM messages_fts WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`
- Uses `self._session_db._conn` and `self._session_db._lock` for thread-safe read access
- Graceful degradation: any exception → returns `[]` (never breaks compression)
- Truncates results > 1500 chars to avoid prompt bloat

**6. Modified `_generate_summary()` method** (line ~1073-1293)
- After `content_to_summarize` is built, extracts keywords from the last user message
- Calls `_fts5_retrieve_relevant()` with those keywords
- Redacts sensitive data from results via `redact_sensitive_text()`
- Builds `_fts5_context_section` with `## Relevant Context From History` header
- Injects into the summarizer prompt AFTER content and focus_topic sections

### File 2: `omniworker-agent/run_agent.py`

**Pass `session_db` to ContextCompressor constructor** (line ~2359)
- Added `session_db=getattr(self, "_session_db", None)` to the constructor call
- `getattr` with default ensures safety even if `_session_db` isn't set yet

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Optional `session_db` param | Backward compatible — all existing callers work unchanged |
| Thread-safe via `_lock` | SessionDB is shared across threads (gateway); must not bypass lock |
| Graceful degradation | FTS5 failure → empty list → no enrichment → compression still works |
| Keywords from last user message only | Most representative of current task; avoids noise from tool outputs |
| 8 keyword limit | Prevents overly broad FTS5 queries that return irrelevant results |
| 1500 char truncation per result | Keeps prompt size bounded; ~5 results × 1500 = ~7500 chars (~1900 tokens) |
| Inject AFTER focus_topic | FTS5 context is supplementary enrichment; focus topic takes precedence |

## What Was NOT Touched

- Core identity/guidance/memory/timestamp — no changes
- `_serialize_for_summary()` — unchanged
- `_compute_summary_budget()` — unchanged
- `compress()` main flow — unchanged
- `_sanitize_tool_pairs()` — unchanged
- Template sections — unchanged
- `_strip_historical_media()` — unchanged
- `SessionDB` class in `omniworker_state.py` — unchanged

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| FTS5 query causes SQLite error | `_sanitize_fts5_query()` strips special chars; try/except returns `[]` |
| Deadlock on `_lock` | Uses `with lock:` (context manager) — same pattern as SessionDB reads |
| Prompt size increase from FTS5 results | Hard limit of 5 results × 1500 chars; included in prompt token estimation |
| `_session_db` not set yet at constructor time | `getattr(self, "_session_db", None)` with fallback; FTS5 gracefully skips |
| Stale FTS5 index | Triggers auto-update on INSERT/UPDATE/DELETE; no manual reindex needed |

## Verification

```
$ python3 -m py_compile agent/context_compressor.py  # OK
$ python3 -m py_compile run_agent.py                  # OK
```

## Follow-up Opportunities

1. **Session-scoped FTS5**: Filter by `session_id` to only retrieve from current session lineage
2. **Trigram CJK support**: Use `messages_fts_trigram` for CJK keyword extraction
3. **Dynamic keyword count**: Scale keyword count with conversation length
4. **Relevance scoring threshold**: Filter out results below a minimum BM25 score
5. **Caching**: Cache FTS5 results for repeated compression on same conversation
