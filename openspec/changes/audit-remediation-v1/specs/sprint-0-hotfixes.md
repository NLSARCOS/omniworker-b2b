# Sprint 0 — SaaS Security Hotfixes — Spec

**Scope:** C4-CORS, D3-RATE, D7-RATE, C1, C5-AUTH, D6-REFRESH, D4-VAL, D5-INPUT, B4

---

## Requirements

### R1: CORS Origin Allowlist (C4-CORS)
- The middleware MUST maintain a static set of allowed origins
- The middleware MUST only reflect origins that are in the allowlist
- The middleware MUST NOT set `Access-Control-Allow-Credentials` for non-allowed origins
- The allowlist MUST be configurable via `CORS_ALLOWED_ORIGINS` env var (comma-separated)
- In development mode, `http://localhost:3000` MUST be automatically allowed

### R2: Auth Rate Limit Correction (D3-RATE)
- The in-memory rate limiter for `auth` tier MUST return limit of `5` (not `500`)
- The limit MUST match the Redis-based limit exactly

### R3: Refresh Endpoint Rate Limit (D7-RATE)
- The `/api/v1/auth/refresh` handler MUST call `checkRateLimit(ip, 'auth')` before processing
- Requests exceeding the limit MUST return HTTP 429

### R4: Atomic Token Deduction (C1)
- Token balance deduction MUST use a conditional update: `WHERE tokenBalance >= cost`
- If the conditional update affects 0 rows, the API MUST return HTTP 402
- The stale-read check at line 175 MAY remain as an early-exit optimization but MUST NOT be the sole guard

### R5: Refresh Token Family Chain (C5-AUTH)
- `createRefreshToken` MUST accept an optional `existingFamily` parameter
- When refreshing, the new token MUST continue the existing family chain
- When `validateRefreshToken` encounters a revoked token, it MUST call `revokeTokenFamily(family)`
- The `revokeTokenFamily` function MUST revoke all tokens with the same family value

### R6: Atomic Refresh Rotation (D6-REFRESH)
- The revoke-old + create-new sequence MUST be wrapped in `prisma.$transaction()`
- If the transaction fails, the old token MUST remain valid (no token loss)

### R7: Validation Schema Strictness (D4-VAL)
- `.passthrough()` MUST be removed from chat completion and message schemas
- The schema MUST use `.strict()` or explicitly define all allowed optional fields
- Unknown fields MUST be rejected with a 400 error

### R8: Device Fingerprint Validation (D5-INPUT)
- `deviceFingerprint` and `deviceName` MUST be extracted from `parsed.data` (after Zod validation)
- `deviceFingerprint` MUST have a max length of 256 characters
- `deviceName` MUST have a max length of 128 characters
- Both MUST only allow alphanumeric characters, hyphens, underscores, and dots

### R9: Summary Failure Default (B4)
- `abort_on_summary_failure` default MUST be changed to `True`
- Before dropping messages (when `abort_on_summary_failure=False`), the system MUST persist dropped messages to `~/.omniworker/recovery/dropped_{session_id}_{timestamp}.json`
- The system MUST log an error with the recovery file path

---

## Scenarios

### Given/When/Then: CORS

```
GIVEN a request with Origin header "https://evil.com"
WHEN the middleware processes the request
THEN the response MUST NOT contain Access-Control-Allow-Origin header
AND the response MUST NOT contain Access-Control-Allow-Credentials header
```

```
GIVEN a request with Origin header "https://app.omniworker.com"
WHEN the middleware processes the request
THEN Access-Control-Allow-Origin MUST be "https://app.omniworker.com"
AND Access-Control-Allow-Credentials MUST be "true"
```

### Given/When/Then: Token Balance

```
GIVEN a license with tokenBalance = 100
AND two concurrent requests each costing 80 tokens
WHEN both requests are processed simultaneously
THEN exactly one request MUST succeed with 200
AND exactly one request MUST fail with 402
AND the final tokenBalance MUST be 20 (never negative)
```

### Given/When/Then: Refresh Token Replay

```
GIVEN a user has refresh token A (family="abc")
AND the user refreshes, getting token B (same family="abc"), token A is revoked
WHEN an attacker presents revoked token A
THEN the system MUST revoke ALL tokens in family "abc" (including B)
AND the function MUST return null (force re-login)
```

### Given/When/Then: Summary Failure

```
GIVEN abort_on_summary_failure is False (opt-in)
AND the summary model fails to produce a summary
WHEN compression attempts to drop middle messages
THEN the dropped messages MUST be written to ~/.omniworker/recovery/
AND an error MUST be logged with the file path
```
