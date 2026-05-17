# TP-002: License backend and API key binding — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-05-16
**Review Level:** 3
**Review Counter:** 0
**Iteration:** 0
**Size:** L

> **Hydration:** Checkboxes represent meaningful outcomes, not individual code changes. Workers expand steps when runtime discoveries warrant it — aim for 2-5 outcome-level items per step.

---

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Required files and paths exist
- [ ] Dependencies satisfied

---

### Step 1: Add license data model and plan limits
**Status:** ⬜ Not Started

- [ ] Add plan license limit and license/API-key/edge-agent relations to Prisma schema
- [ ] Add migration artifacts and regenerate Prisma client

---

### Step 2: Implement license-aware authentication and public APIs
**Status:** ⬜ Not Started

- [ ] Implement tenant license list/create APIs with plan limit enforcement
- [ ] Implement license update/revoke APIs
- [ ] Enforce active license checks inside API-key authentication

---

### Step 3: Bind API keys to licenses and support immediate revocation
**Status:** ⬜ Not Started

- [ ] Require active tenant license when creating API keys and return license metadata
- [ ] Include license metadata in API key listings
- [ ] Add tenant-scoped API key delete/revoke endpoint

---

### Step 4: Plan CRUD and edge agent integration
**Status:** ⬜ Not Started

- [ ] Add `maxLicenses` support to admin plan create/update
- [ ] Attach edge registrations/heartbeats to active licenses when provided

---

### Step 5: Testing & Verification
**Status:** ⬜ Not Started

- [ ] Run `cd omniworker-saas && npx prisma generate`
- [ ] Run `cd omniworker-saas && npm run lint`
- [ ] Run `cd omniworker-saas && npm run build`
- [ ] Fix regressions or document unrelated pre-existing failures

---

### Step 6: Documentation & Delivery
**Status:** ⬜ Not Started

- [ ] Update `taskplane-tasks/CONTEXT.md` with discoveries/follow-up if needed
- [ ] Review `AGENTS.md` only if conventions changed

---

## Discoveries

| Date | Discovery | Impact |
|------|-----------|--------|

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|

## Notes


