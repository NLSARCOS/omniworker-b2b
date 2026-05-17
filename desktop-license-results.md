# Desktop License Usage Display — Implementation Results

**Date:** 2026-05-16
**Status:** ✅ Complete

---

## What was implemented

### 1. Heartbeat response — `omniworker-saas/src/app/api/v1/edge/heartbeat/route.ts`

Added `licenseUsage` to the heartbeat response:

```typescript
// License usage for desktop app header display
const tenantWithPlan = await prisma.tenant.findUnique({
  where: { id: user.tenantId },
  include: { plan: true },
});
const activeLicenseCount = await prisma.license.count({
  where: { tenantId: user.tenantId, status: "ACTIVE" },
});
const maxLicenses = tenantWithPlan?.plan?.maxLicenses ?? 1;

return NextResponse.json({
  success: true,
  commands: [],
  plan: user.plan,
  tokenBalance: user.tokenBalance,
  tenantName: user.tenantName,
  licenseUsage: { active: activeLicenseCount, max: maxLicenses },
});
```

### 2. Desktop state type — `omniworker-desktop/src/renderer/src/screens/Layout/Layout.tsx`

Extended `saasInfo` state to include optional `licenseUsage`:

```typescript
const [saasInfo, setSaasInfo] = useState<{
  plan: string | null;
  tokenBalance: number | null;
  tenantName: string | null;
  licenseUsage?: { active: number; max: number };
} | null>(null);
```

Updated heartbeat response parsing to include `licenseUsage`.

### 3. Desktop header display — `Layout.tsx`

Added a license usage badge next to the plan badge:

```tsx
{saasInfo.licenseUsage && (
  <span style={{
    backgroundColor: saasInfo.licenseUsage.active >= saasInfo.licenseUsage.max
      ? '#ef4444'  // red when at limit
      : 'var(--bg-secondary)',
    padding: '2px 6px',
    borderRadius: '4px',
    color: saasInfo.licenseUsage.active >= saasInfo.licenseUsage.max ? '#fff' : 'inherit'
  }}>
    {saasInfo.licenseUsage.active} / {saasInfo.licenseUsage.max} INST
  </span>
)}
```

Display format: **X / Y INST** (e.g., "3 / 5 INST") in uppercase monospace style matching the brutalist design. Badge turns red when the tenant is at their license limit.

### Build & Commit

- `npm run typecheck` in `omniworker-desktop` — pre-existing TS errors in `ModelPicker.tsx` unrelated to this change (unused variables, not caused by our edits).
- `git commit` — `1574391 feat(desktop): show license usage in desktop app header`

---

## Files modified

- `omniworker-saas/src/app/api/v1/edge/heartbeat/route.ts` — added `licenseUsage` to response
- `omniworker-desktop/src/renderer/src/screens/Layout/Layout.tsx` — state type, heartbeat parsing, badge display

---

## Result

The desktop app header now shows:
- **Plan badge:** `{plan} Plan`
- **License usage badge (when available):** `{active} / {max} INST` — turns red when at limit
- **Token balance:** `{n} TKS`