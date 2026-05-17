# License Dashboard — Implementation Results

**Date:** 2026-05-16
**Status:** ✅ Complete

---

## What was implemented

### Schema (`prisma/schema.prisma`)
- `SubscriptionPlan.maxLicenses Int @default(1)` — controls how many active installations a tenant may have
- `License` model — represents an authorized installation/device, linked to Tenant
  - Fields: `id`, `name`, `status` (ACTIVE|REVOKED|EXPIRED), `deviceFingerprint`, `activatedAt`, `lastSeenAt`, `revokedAt`, timestamps
  - Relations: `apiKeys TenantApiKey[]`, `edgeAgents EdgeAgent[]`
- `TenantApiKey.licenseId` + `License?` relation — every API key belongs to a license
- `EdgeAgent.licenseId` + `License?` relation — agents can be bound to a license

### Backend APIs

**`GET /api/v1/licenses`** — list tenant's licenses with API key counts and key info

**`POST /api/v1/licenses`** — create a license if under plan's `maxLicenses` limit

**`PATCH /api/v1/licenses/[id]`** — update name/device fingerprint

**`DELETE /api/v1/licenses/[id]`** — revoke a license (marks revokedAt, disables keys)

**`POST /api/v1/apikeys`** — requires `licenseId`, validates active license owned by tenant, returns license metadata with the one-time raw key

**`GET /api/v1/apikeys`** — returns keys with `license { id, name, status }` info

**`DELETE /api/v1/apikeys?id=...`** — deletes key immediately; lookup by hash fails → access cut instantly

**`auth.ts` API-key branch** — rejects keys with no license, revoked/expired license, or inactive tenant/plan

**Admin plan create/update** — accepts and persists `maxLicenses`

**Edge register/heartbeat** — optionally accepts `licenseId` to bind agent to a license

### Dashboard (`/dashboard`)
- **Licencias/Instalaciones section** — shows all licenses with status badges (ACTIVE/REVOKED/EXPIRED), activation date, last seen, key count
- **"X / maxLicenses instalaciones activas"** counter
- **Inline "Nueva Licencia" form** — name input, creates license up to plan limit
- **API Key generation with license selection** — user picks active license from dropdown before generating; response shows which license the key was added to
- **One-time raw key display** with warning that app will lose access if key is deleted
- **Delete key button** with confirmation: "¿Eliminar esta clave? La app que la usa perderá acceso inmediatamente."

### Build & Lint
- `npx prisma generate` ✅
- `npm run build` ✅ (also includes `api/v1/licenses` and `api/v1/licenses/[id]` routes)
- `npm run lint` — pre-existing warnings/errors unrelated to this task

---

## Key design decisions

| Decision | Rationale |
|-----------|-----------|
| API key deletion = immediate access cut | DB lookup by `keyHash` returns null → `authenticateRequest` returns null → all protected routes reject the request |
| License-bound API keys | Ensures app can only authenticate if license is also active, preventing orphaned keys |
| Revoking license disables all its keys | Revoke cascades through auth checks; each key individually deleted for hard cut |
| `maxLicenses` defaults to 1 | Safe default; existing tenants get single-installation behavior |

---

## Files modified

- `omniworker-saas/prisma/schema.prisma` — schema with License, maxLicenses, licenseId on keys/agents
- `omniworker-saas/src/lib/auth.ts` — license-aware API-key authentication
- `omniworker-saas/src/lib/validation.ts` — `createLicenseSchema`, updated `createApiKeySchema` with licenseId
- `omniworker-saas/src/app/api/v1/apikeys/route.ts` — license-bound POST, license info in GET, DELETE
- `omniworker-saas/src/app/api/v1/licenses/route.ts` — GET/POST tenant licenses (new file)
- `omniworker-saas/src/app/api/v1/licenses/[id]/route.ts` — PATCH/DELETE license (new file)
- `omniworker-saas/src/app/api/admin/plans/route.ts` — maxLicenses in plan CRUD
- `omniworker-saas/src/app/api/v1/edge/register/route.ts` — license binding on registration
- `omniworker-saas/src/app/api/v1/edge/heartbeat/route.ts` — license lastSeenAt update
- `omniworker-saas/src/app/dashboard/page.tsx` — full license management UI
- `taskplane-tasks/CONTEXT.md` — task discovery logging

---

## Commit

```
29aa635 feat(license): complete license system — schema, auth, apikeys, plans, edge, dashboard
```

---

## Blockers encountered

| Blocker | Resolution |
|---------|-----------|
| ENOSPC (worktree agent crash) | Disk space freed; worktree changes committed manually |
| `SubscriptionPlan.licenses` relation missing opposite field in License | Removed `licenses License[]` from SubscriptionPlan (not needed — License→Plan via Tenant) |