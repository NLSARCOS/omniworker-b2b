# OmniWorker SaaS — License System Implementation Plan

**Date:** 2026-05-16
**Scope:** Full license/install-management system for SaaS multi-tenant platform

---

## Overview

A **License** represents an authorized installation/device for a tenant. Each License can have multiple API Keys bound to it. The plan's `maxLicenses` field controls how many active installations a tenant may have. Revoking a License or deleting an API Key immediately cuts off access.

---

## Part 1: Schema Changes (`prisma/schema.prisma`)

### 1.1 Add `maxLicenses` to `SubscriptionPlan`

```prisma
model SubscriptionPlan {
  id            String   @id @default(uuid())
  name          String   @unique
  description   String?
  tokenLimit    Int
  maxAgents     Int      @default(1)
  maxUsers      Int      @default(1)
  maxLicenses   Int      @default(1)   // ← NEW: how many active installations allowed
  price         Float
  billingPeriod String   @default("monthly")
  isActive      Boolean  @default(true)
  isPublic      Boolean  @default(true)
  features      String   @default("[]")
  sortOrder     Int      @default(0)

  tenants       Tenant[]
  licenses      License[]  // ← NEW: reverse relation
}
```

### 1.2 Add `License` Model

Add this block after `AdminAuditLog` and before `EdgeAgent`:

```prisma
// ─── LICENSE ───────────────────────────────────────────────────────────────
model License {
  id               String    @id @default(uuid())
  tenantId         String
  tenant           Tenant    @relation(fields: [tenantId], references: [id])
  name             String                    // friendly name, e.g. "MacBook Pro Nelson"
  status           String    @default("ACTIVE")  // ACTIVE | REVOKED | EXPIRED
  deviceFingerprint String?                  // optional hardware/OS fingerprint
  activatedAt      DateTime  @default(now())
  lastSeenAt       DateTime?
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  apiKeys          TenantApiKey[]
  edgeAgents       EdgeAgent[]

  @@index([tenantId])
  @@index([status])
}
```

### 1.3 Update `Tenant` — add `licenses` relation

```prisma
model Tenant {
  // ... existing fields ...
  users       User[]
  edgeAgents  EdgeAgent[]
  apiKeys     TenantApiKey[]
  licenses    License[]   // ← NEW
  tasks       TaskLog[]
}
```

### 1.4 Update `TenantApiKey` — add `licenseId` FK

```prisma
model TenantApiKey {
  id          String    @id @default(uuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  licenseId   String?   // ← NEW: optional FK, null for migration compat
  license     License?  @relation(fields: [licenseId], references: [id])
  keyHash     String    @unique
  keyPrefix   String
  name        String?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@index([tenantId])
  @@index([licenseId])   // ← NEW
}
```

### 1.5 Update `EdgeAgent` — add `licenseId` FK

```prisma
model EdgeAgent {
  id            String    @id @default(uuid())
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  licenseId     String?   // ← NEW
  license       License?  @relation(fields: [licenseId], references: [id])
  agentName     String
  hostname      String?
  platform      String?
  status        String    @default("offline")
  lastSeenAt    DateTime?
  capabilities  String    @default("[]")
  createdAt     DateTime  @default(now())

  @@index([tenantId])
  @@index([licenseId])   // ← NEW
}
```

### 1.6 Migration

After saving the schema, run:
```bash
cd omniworker-saas
npx prisma generate
npx prisma db push   # or: npx prisma migrate dev --name add_license_system
```

---

## Part 2: Auth Changes (`src/lib/auth.ts`)

### What changes

The `token.startsWith("tsto_")` branch (API-key authentication) must verify:
1. The API key has a `licenseId` attached (not null)
2. The `License` exists and `status === "ACTIVE"`
3. `tenant.isActive === true`
4. `tenant.plan.isActive === true`
5. `tenant.plan.maxLicenses` is not exceeded (active license count check)

On success: update both `TenantApiKey.lastUsedAt` AND `License.lastSeenAt`.

### Replace the `tsto_` block in `authenticateRequest`

Find this block in `authenticateRequest`:

```typescript
if (token.startsWith("tsto_")) {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const apiKey = await prisma.tenantApiKey.findUnique({
      where: { keyHash },
      include: { tenant: { include: { plan: true, users: { where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, take: 1 } } } },
    });

    if (!apiKey || !apiKey.tenant.isActive) return null;

    const dbUser = apiKey.tenant.users[0];
    if (!dbUser) return null;

    await prisma.tenantApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        tenantId: apiKey.tenantId,
        tenantName: apiKey.tenant.name,
        tokenBalance: dbUser.tokenBalance,
        plan: apiKey.tenant.plan?.name ?? null,
        isLocked: dbUser.tokenBalance <= 0,
      },
      payload: { ... },
    };
  }
```

Replace with:

```typescript
if (token.startsWith("tsto_")) {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const apiKey = await prisma.tenantApiKey.findUnique({
      where: { keyHash },
      include: {
        license: true,
        tenant: {
          include: {
            plan: true,
            users: { where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, take: 1 }
          }
        }
      },
    });

    // 1. Key must exist
    if (!apiKey) return null;

    // 2. Tenant must be active
    if (!apiKey.tenant.isActive) return null;

    // 3. Tenant plan must be active
    if (!apiKey.tenant.plan?.isActive) return null;

    // 4. Key must have an active license attached
    if (!apiKey.licenseId || !apiKey.license) return null;
    if (apiKey.license.status !== "ACTIVE") return null;

    // 5. Tenant must not exceed maxLicenses
    const activeLicenseCount = await prisma.license.count({
      where: { tenantId: apiKey.tenantId, status: "ACTIVE" },
    });
    const maxLicenses = apiKey.tenant.plan?.maxLicenses ?? 1;
    if (activeLicenseCount > maxLicenses) return null;

    const dbUser = apiKey.tenant.users[0];
    if (!dbUser) return null;

    // Update lastUsedAt on the key AND lastSeenAt on the license
    const now = new Date();
    await Promise.all([
      prisma.tenantApiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: now } }),
      prisma.license.update({ where: { id: apiKey.licenseId }, data: { lastSeenAt: now } }),
    ]);

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        tenantId: apiKey.tenantId,
        tenantName: apiKey.tenant.name,
        tokenBalance: dbUser.tokenBalance,
        plan: apiKey.tenant.plan?.name ?? null,
        isLocked: dbUser.tokenBalance <= 0,
      },
      payload: {
        userId: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        tenantId: apiKey.tenantId,
      },
    };
  }
```

### Also update the `include` in the normal JWT branch

In the JWT branch after `prisma.user.findUnique`, add `license` to the include if needed for any downstream use. The core auth logic does not need it there.

---

## Part 3: API Routes — Licenses

### 3.1 `src/app/api/v1/licenses/route.ts` (NEW file)

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/v1/licenses — list all licenses for the tenant
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const licenses = await prisma.license.findMany({
    where: { tenantId: user.tenantId },
    include: {
      _count: { select: { apiKeys: true } },
      apiKeys: { select: { id: true, name: true, keyPrefix: true, lastUsedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get plan maxLicenses
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    include: { plan: true },
  });
  const maxLicenses = tenant?.plan?.maxLicenses ?? 1;
  const activeCount = licenses.filter(l => l.status === "ACTIVE").length;

  return NextResponse.json({
    success: true,
    licenses,
    usage: { active: activeCount, max: maxLicenses },
  });
}

// POST /api/v1/licenses — create a new license (if under plan limit)
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, deviceFingerprint } = body as { name?: string; deviceFingerprint?: string };

  // Check plan limit
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    include: {
      plan: true,
      licenses: { where: { status: "ACTIVE" } },
    },
  });

  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  const maxLicenses = tenant.plan?.maxLicenses ?? 1;
  if (tenant.licenses.length >= maxLicenses) {
    return NextResponse.json(
      { error: `Límite de instalaciones alcanzado (${maxLicenses}). Actualizá tu plan.` },
      { status: 403 }
    );
  }

  const license = await prisma.license.create({
    data: {
      tenantId: user.tenantId,
      name: name || `Instalación ${tenant.licenses.length + 1}`,
      deviceFingerprint: deviceFingerprint || null,
      status: "ACTIVE",
    },
  });

  return NextResponse.json({ success: true, license }, { status: 201 });
}
```

### 3.2 `src/app/api/v1/licenses/[id]/route.ts` (NEW file)

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

function notFound() {
  return NextResponse.json({ error: "Licencia no encontrada" }, { status: 404 });
}

// GET /api/v1/licenses/[id]
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) return NextResponse.json({ error: "Sin tenant" }, { status: 400 });

  const { id } = await params;

  const license = await prisma.license.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      _count: { select: { apiKeys: true } },
      apiKeys: { select: { id: true, name: true, keyPrefix: true, lastUsedAt: true } },
    },
  });

  if (!license) return notFound();
  return NextResponse.json({ success: true, license });
}

// PATCH /api/v1/licenses/[id] — update name, deviceFingerprint
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) return NextResponse.json({ error: "Sin tenant" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const { id } = await params;
  const existing = await prisma.license.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) return notFound();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, deviceFingerprint } = body as { name?: string; deviceFingerprint?: string };

  const updated = await prisma.license.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(deviceFingerprint !== undefined ? { deviceFingerprint } : {}),
    },
  });

  return NextResponse.json({ success: true, license: updated });
}

// DELETE /api/v1/licenses/[id] — revoke the license AND cascade-delete all its API keys
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) return NextResponse.json({ error: "Sin tenant" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const { id } = await params;
  const existing = await prisma.license.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) return notFound();

  // Mark license as REVOKED and delete all its API keys immediately
  const [license] = await prisma.$transaction([
    prisma.license.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    }),
    // Cascade: delete all API keys bound to this license (immediate access cut)
    prisma.tenantApiKey.deleteMany({ where: { licenseId: id } }),
    // Also detach edge agents
    prisma.edgeAgent.updateMany({
      where: { licenseId: id },
      data: { licenseId: null },
    }),
  ]);

  return NextResponse.json({ success: true, license });
}
```

---

## Part 4: API Keys Update (`src/app/api/v1/apikeys/route.ts`)

### Changes to POST

1. Accept `licenseId` in body
2. Verify the license belongs to the tenant and is `ACTIVE`
3. Attach the key to the license
4. Return license metadata in response

### Changes to GET

1. Include `licenseId` and `license.name` in the returned key objects

### Add DELETE method

1. `DELETE /api/v1/apikeys?id=keyId` — deletes the key so the same raw token will fail auth immediately

### Complete replacement

Replace the entire file with:

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomBytes, createHash } from "crypto";

// POST /api/v1/apikeys — create a key bound to a license
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "El usuario no pertenece a un tenant" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "default");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones. Intenta más tarde." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, licenseId } = body as { name?: string; licenseId?: string };

  if (!licenseId) {
    return NextResponse.json(
      { error: "licenseId es requerido" },
      { status: 400 }
    );
  }

  // Verify license belongs to tenant and is ACTIVE
  const license = await prisma.license.findFirst({
    where: { id: licenseId, tenantId: user.tenantId, status: "ACTIVE" },
  });
  if (!license) {
    return NextResponse.json(
      { error: "Licencia inválida o inactiva" },
      { status: 400 }
    );
  }

  // Generate API key
  const rawKey = "tsto_" + randomBytes(16).toString("hex");
  const keyPrefix = rawKey.substring(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const newKey = await prisma.tenantApiKey.create({
    data: {
      tenantId: user.tenantId,
      licenseId: license.id,
      keyHash,
      keyPrefix,
      name: name || "Nueva Clave",
    },
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      id: newKey.id,
      name: newKey.name,
      key: rawKey,
      licenseId: license.id,
      licenseName: license.name,
      createdAt: newKey.createdAt,
    },
  });
}

// GET /api/v1/apikeys — list all keys with their license info
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "El usuario no pertenece a un tenant" }, { status: 400 });
  }

  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      licenseId: true,
      license: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, keys });
}

// DELETE /api/v1/apikeys?id=keyId — revoke and delete a key immediately
export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { user } = auth;
  if (!user.tenantId) {
    return NextResponse.json({ error: "Sin tenant" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("id");
  if (!keyId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  // Verify the key belongs to this tenant
  const key = await prisma.tenantApiKey.findFirst({
    where: { id: keyId, tenantId: user.tenantId },
  });
  if (!key) {
    return NextResponse.json({ error: "Clave no encontrada" }, { status: 404 });
  }

  // Delete the key — next time the app uses this raw key, auth will fail because
  // the keyHash lookup will return null (no key found = auth denied immediately)
  await prisma.tenantApiKey.delete({ where: { id: keyId } });

  return NextResponse.json({ success: true });
}
```

---

## Part 5: Admin Plans Update (`src/app/api/admin/plans/route.ts`)

### Changes

Add `maxLicenses` to the `PlanCreateBody` and `PlanUpdateBody` interfaces, parse it like `maxAgents`, and include it in the create/update data.

### Key changes (show diff-style)

**In `POST` function, add to interface:**
```typescript
maxLicenses?: number | string;
```

**In the create data:**
```typescript
maxLicenses: typeof maxLicenses === 'string' ? parseInt(maxLicenses) : (maxLicenses ?? 1),
```

**In `PATCH` function, add to interface:**
```typescript
maxLicenses?: number | string;
```

**In the update data:**
```typescript
if (rest.maxLicenses !== undefined) updateData.maxLicenses = typeof rest.maxLicenses === 'string' ? parseInt(rest.maxLicenses) : rest.maxLicenses;
```

---

## Part 6: Edge Agent Registration / Heartbeat (`src/app/api/v1/edge/register/route.ts` + `heartbeat/route.ts`)

### 6.1 Register (`register/route.ts`)

In the `POST` function:

1. Accept optional `licenseId` in the request body (add to `edgeRegisterSchema` in validation.ts)
2. When `licenseId` is provided:
   - Verify it belongs to the tenant and is `ACTIVE`
   - Attach the edge agent to the license (`licenseId` field on `EdgeAgent`)
3. The `maxAgents` check already exists; if `maxAgents` is 0 or `maxAgents` not in plan, reject. The `licenseId` part is independent.

### 6.2 Heartbeat (`heartbeat/route.ts`)

In the `POST` function:

1. If the authenticated API key has a `licenseId` (which it will after this system), update `License.lastSeenAt` when processing the heartbeat.
2. Include license info in the response:
   ```typescript
   licenseId: apiKey.licenseId,
   licenseStatus: license?.status,
   ```
   (This requires loading `apiKey.license` in the auth response or doing a separate lookup here.)

### 6.3 Validation update (`src/lib/validation.ts`)

Add to `edgeRegisterSchema`:
```typescript
licenseId: z.string().optional(),
```

Add to `edgeHeartbeatSchema` (optional, for future use):
```typescript
licenseId: z.string().optional(),
```

---

## Part 7: Dashboard (`src/app/dashboard/page.tsx`)

### What to add

A new section called "LICENCIAS / INSTALACIONES" that shows:

1. **Header** with usage stats: `X / MAX_LICENSES instalaciones activas`
2. **List of licenses** showing: name, status badge (ACTIVE=success, REVOKED=danger), last seen date, API key count
3. **"Nueva Licencia" button** — calls `POST /api/v1/licenses`, shows error if at limit
4. **API Keys section update:**
   - Each key row shows which license it belongs to (`licenseName` column)
   - The "Nueva Clave" flow now requires selecting a license first (dropdown populated from `GET /api/v1/licenses`)
   - A "Eliminar" button per key calls `DELETE /api/v1/apikeys?id=...` and shows a confirmation dialog: "Esta clave se eliminará inmediatamente y la app en ese computador perderá acceso."
5. **License detail/delete:** Each license row has a revoke/delete button calling `DELETE /api/v1/licenses/[id]`

### UI mock (inline brutalist style matching existing dashboard)

```
┌──────────────────────────────────────────────────────────────────┐
│ LICENCIAS / INSTALACIONES                              [3 / 5]  │
├──────────────────────────────────────────────────────────────────┤
│ [+ NUEVA LICENCIA]                                               │
│                                                                  │
│ ● MacBook Pro Nelson         ACTIVE   Visto: hace 2 min   2 keys │
│   [Revocar]                                                        │
│                                                                  │
│ ● Ubuntu Server AWS          REVOKED  Revocado: 2026-05-10  0 keys│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ API KEYS — CONEXIÓN AGENTE                                       │
├──────────────────────────────────────────────────────────────────┤
│ Licencia          Nombre           Prefijo          Acciones      │
│ MacBook Pro Nelson  Desktop Key     tsto_a1b2...     [Eliminar]  │
└──────────────────────────────────────────────────────────────────┘
```

### Key implementation notes

- The license dropdown in the "Nueva Clave" form should only show `ACTIVE` licenses.
- When deleting an API key, show a `<dialog>` or `confirm()` warning: "Esta clave se eliminará inmediatamente. La app en ese computador perderá acceso."
- When revoking a license, warn that all API keys under it will be deleted and all associated apps will lose access.
- The one-time raw API key display (yellow box) should continue to show the `licenseName` it was created for.

---

## Migration Steps Summary

After all code changes are made, run these commands in `omniworker-saas/`:

```bash
# 1. Regenerate Prisma client with new schema
npx prisma generate

# 2. Push schema changes to the database (creates/modifies tables)
npx prisma db push

# 3. Lint
npm run lint

# 4. Build
npm run build
```

If `db push` fails due to existing data, use a migration instead:
```bash
npx prisma migrate dev --name add_license_system
```

---

## Files Summary

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Modify: add `maxLicenses`, `License` model, `licenseId` on `TenantApiKey` and `EdgeAgent` |
| `src/lib/auth.ts` | Modify: add license/plan checks in `tsto_` branch, update `lastSeenAt` |
| `src/lib/validation.ts` | Modify: add `licenseId` to edge schemas |
| `src/app/api/v1/licenses/route.ts` | **NEW**: GET + POST for licenses |
| `src/app/api/v1/licenses/[id]/route.ts` | **NEW**: GET + PATCH + DELETE for single license |
| `src/app/api/v1/apikeys/route.ts` | Modify: require `licenseId`, add DELETE, include license in GET |
| `src/app/api/admin/plans/route.ts` | Modify: add `maxLicenses` to create/update |
| `src/app/api/v1/edge/register/route.ts` | Modify: accept and attach `licenseId` |
| `src/app/api/v1/edge/heartbeat/route.ts` | Modify: update `License.lastSeenAt`, include license in response |
| `src/app/dashboard/page.tsx` | Modify: add Licenses section, update API Keys section |
