# Task: TP-002 - License backend and API key binding

**Created:** 2026-05-16
**Size:** L

## Review Level: 3 (Full)

**Assessment:** This adds a new licensing domain that gates API-key authentication and installation limits. It touches schema, auth, public APIs, and plan/admin behavior, so security and migration risk are high.
**Score:** 8/8 — Blast radius: 2, Pattern novelty: 2, Security: 2, Reversibility: 2

## Canonical Task Folder

```
taskplane-tasks/TP-002-license-backend/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission

Add a SaaS licensing system so a plan controls how many app installations/licenses a tenant can activate, and every API key belongs to a specific active license. Revoking/deleting an API key or license must immediately prevent any desktop/agent using that API key from accessing protected platform APIs.

## Dependencies

- **None**

## Context to Read First

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `AGENTS.md` — project conventions and commands
- `omniworker-saas/prisma/schema.prisma` — data model
- `omniworker-saas/src/lib/auth.ts` — API-key authentication path
- `omniworker-saas/src/lib/validation.ts` — Zod schemas
- `omniworker-saas/src/app/api/v1/apikeys/route.ts` — existing key creation/listing API
- `omniworker-saas/src/app/api/admin/plans/route.ts` — plan CRUD
- `omniworker-saas/src/app/api/v1/edge/register/route.ts` — installation/agent registration limit behavior
- `omniworker-saas/src/app/api/v1/edge/heartbeat/route.ts` — active install heartbeat behavior

## Environment

- **Workspace:** `omniworker-saas`
- **Services required:** None for static checks; local SQLite DATABASE_URL may be needed for Prisma migration/generate.

## File Scope

- `omniworker-saas/prisma/schema.prisma`
- `omniworker-saas/prisma/migrations/*`
- `omniworker-saas/src/lib/auth.ts`
- `omniworker-saas/src/lib/validation.ts`
- `omniworker-saas/src/app/api/v1/apikeys/route.ts`
- `omniworker-saas/src/app/api/v1/licenses/route.ts` (new)
- `omniworker-saas/src/app/api/v1/licenses/[id]/route.ts` (new)
- `omniworker-saas/src/app/api/admin/plans/route.ts`
- `omniworker-saas/src/app/api/v1/edge/register/route.ts`
- `omniworker-saas/src/app/api/v1/edge/heartbeat/route.ts`

## Steps

### Step 0: Preflight

- [ ] Required files and paths exist
- [ ] Dependencies satisfied

### Step 1: Add license data model and plan limits

- [ ] Add `SubscriptionPlan.maxLicenses Int @default(1)` to `schema.prisma`.
- [ ] Add a `License` model related to `Tenant`, `User` owner if appropriate, and `TenantApiKey`; include at least `name`, optional device metadata/fingerprint, `status` (`ACTIVE`/`REVOKED`/`EXPIRED` as string is acceptable to match current schema style), `lastSeenAt`, `activatedAt`, `revokedAt`, timestamps, and useful tenant/status indexes.
- [ ] Add `licenseId` relation fields to `TenantApiKey`; creation APIs must require/attach a license even if the DB field is nullable for migration compatibility.
- [ ] Add `licenseId` to `EdgeAgent` if useful so registered installations can be tied to licenses and heartbeat can update the license.
- [ ] Create or update Prisma migration artifacts and run `npx prisma generate`.

**Artifacts:**
- `omniworker-saas/prisma/schema.prisma` (modified)
- `omniworker-saas/prisma/migrations/*` (new/modified)

### Step 2: Implement license-aware authentication and public APIs

- [ ] Create `GET /api/v1/licenses` to list the tenant's licenses with API key counts and active key prefixes.
- [ ] Create `POST /api/v1/licenses` to create/activate a license only if the tenant is under `plan.maxLicenses` (default 1); validate input with Zod.
- [ ] Create `PATCH /api/v1/licenses/[id]` to rename/update device metadata/status where appropriate.
- [ ] Create `DELETE /api/v1/licenses/[id]` or revoke action that marks the license revoked and disables/deletes associated API keys so access stops immediately.
- [ ] Update `authenticateRequest()` API-key branch to reject keys with no active license, revoked/expired license, inactive tenant, or inactive plan; update both `TenantApiKey.lastUsedAt` and `License.lastSeenAt` on successful API-key auth.

**Artifacts:**
- `omniworker-saas/src/lib/auth.ts` (modified)
- `omniworker-saas/src/lib/validation.ts` (modified)
- `omniworker-saas/src/app/api/v1/licenses/route.ts` (new)
- `omniworker-saas/src/app/api/v1/licenses/[id]/route.ts` (new)

### Step 3: Bind API keys to licenses and support immediate revocation

- [ ] Update `POST /api/v1/apikeys` to require a valid active `licenseId` owned by the tenant and return license details (`id`, `name`, `status`) with the one-time key payload.
- [ ] Update `GET /api/v1/apikeys` to include the license each key belongs to.
- [ ] Add `DELETE /api/v1/apikeys?id=...` to delete/revoke a tenant key; after deletion the same raw API key must fail authentication because lookup by hash no longer succeeds.
- [ ] Ensure rate limiting and existing Spanish error style remain consistent.

**Artifacts:**
- `omniworker-saas/src/app/api/v1/apikeys/route.ts` (modified)
- `omniworker-saas/src/lib/validation.ts` (modified)

### Step 4: Plan CRUD and edge agent integration

- [ ] Update admin plan create/update handling to accept and persist `maxLicenses`, with parsing behavior matching `maxAgents` and `maxUsers`.
- [ ] Update edge registration to optionally accept `licenseId`, verify active tenant license ownership, respect `maxLicenses`/active license count, and attach the registered agent to the license when provided.
- [ ] Update heartbeat to include license status/info in the response when authenticated by a license-bound API key and update `License.lastSeenAt`.

**Artifacts:**
- `omniworker-saas/src/app/api/admin/plans/route.ts` (modified)
- `omniworker-saas/src/app/api/v1/edge/register/route.ts` (modified)
- `omniworker-saas/src/app/api/v1/edge/heartbeat/route.ts` (modified)
- `omniworker-saas/src/lib/validation.ts` (modified)

### Step 5: Testing & Verification

- [ ] Run `cd omniworker-saas && npx prisma generate`
- [ ] Run `cd omniworker-saas && npm run lint`
- [ ] Run `cd omniworker-saas && npm run build`
- [ ] If build/lint failures are pre-existing and unrelated, document exact evidence in `STATUS.md`; otherwise fix all regressions.

### Step 6: Documentation & Delivery

- [ ] "Must Update" docs modified
- [ ] "Check If Affected" docs reviewed
- [ ] Discoveries logged in `STATUS.md`

## Documentation Requirements

**Must Update:**
- `taskplane-tasks/CONTEXT.md` — add discoveries or follow-up technical debt if any.

**Check If Affected:**
- `AGENTS.md` — update only if project-level commands/conventions changed (should not be necessary).

## Completion Criteria

- [ ] Plans expose a `maxLicenses` limit.
- [ ] Licenses can be created/listed/revoked per tenant and enforce plan limits.
- [ ] Every newly generated API key is attached to a license and response data shows which license it belongs to.
- [ ] Deleting/revoking an API key immediately prevents further authenticated use.
- [ ] Revoking a license prevents all API keys under that license from authenticating.
- [ ] Prisma generate, lint, and build have been run or documented if blocked by pre-existing issues.

## Git Commit Convention

Commits happen at **step boundaries** (not after every checkbox). All commits for this task MUST include the task ID for traceability:

- **Step completion:** `feat(TP-002): complete Step N — description`
- **Bug fixes:** `fix(TP-002): description`
- **Tests:** `test(TP-002): description`
- **Hydration:** `hydrate: TP-002 expand Step N checkboxes`

## Do NOT

- Do not store raw API keys in the database; store only hashes and prefixes.
- Do not allow API-key auth to bypass license/tenant/plan status checks.
- Do not silently create unlimited licenses.
- Do not remove existing auth behavior for normal JWT/cookie users.
- Do not skip validation commands without documenting why.
- Do not modify framework/standards docs without explicit user approval.

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
