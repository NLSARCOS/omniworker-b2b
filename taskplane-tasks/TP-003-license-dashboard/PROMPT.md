# Task: TP-003 - License dashboard UX

**Created:** 2026-05-16
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** This updates the user dashboard to expose license/install limits, create license-bound API keys, and delete keys. It touches authenticated UI and depends on the backend licensing contract, but does not add new backend security decisions.
**Score:** 5/8 — Blast radius: 1, Pattern novelty: 1, Security: 1, Reversibility: 2

## Canonical Task Folder

```
taskplane-tasks/TP-003-license-dashboard/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission

Update the SaaS dashboard so users can manage licenses/installations and see exactly which license each API key belongs to. A user must be able to create a license up to their plan limit, generate an API key for a selected license, delete an API key, and immediately understand that the app using that key will lose access.

## Dependencies

- **Task:** TP-002 (License backend/API contract must exist)

## Context to Read First

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `AGENTS.md` — project conventions and commands
- `omniworker-saas/src/app/dashboard/page.tsx` — dashboard UI to update
- `omniworker-saas/src/app/api/v1/licenses/route.ts` — backend response contract from TP-002
- `omniworker-saas/src/app/api/v1/apikeys/route.ts` — API-key response contract from TP-002

## Environment

- **Workspace:** `omniworker-saas`
- **Services required:** None for static checks.

## File Scope

- `omniworker-saas/src/app/dashboard/page.tsx`
- `taskplane-tasks/CONTEXT.md`

## Steps

### Step 0: Preflight

- [ ] Required files and paths exist
- [ ] Dependencies satisfied (TP-002 complete or backend contract exists)

### Step 1: Load and display licenses

- [ ] Add dashboard types/state/loading logic for `GET /api/v1/licenses`.
- [ ] Add a Licenses/Installations section that shows active/revoked licenses, device/name metadata, last seen, and plan usage like `active / maxLicenses` when the backend provides it.
- [ ] Preserve the existing brutalist inline style approach and Spanish copy.

**Artifacts:**
- `omniworker-saas/src/app/dashboard/page.tsx` (modified)

### Step 2: Create license-bound API keys and delete keys

- [ ] Add UI to create a license (name/device label) up to plan limit.
- [ ] Change API-key generation so the user selects an active license and `POST /api/v1/apikeys` sends `licenseId`.
- [ ] Show returned one-time raw API key and the license name/id it was added to.
- [ ] Add delete button for each API key that calls `DELETE /api/v1/apikeys?id=...`, removes it from UI state, and warns that the computer/app using that key will immediately lose access.

**Artifacts:**
- `omniworker-saas/src/app/dashboard/page.tsx` (modified)

### Step 3: Testing & Verification

- [ ] Run `cd omniworker-saas && npm run lint`
- [ ] Run `cd omniworker-saas && npm run build`
- [ ] Fix regressions or document unrelated pre-existing failures in `STATUS.md`.

### Step 4: Documentation & Delivery

- [ ] Add any dashboard/licensing discoveries or follow-up technical debt to `taskplane-tasks/CONTEXT.md`.
- [ ] Confirm no project-level docs need updates.

## Documentation Requirements

**Must Update:**
- `taskplane-tasks/CONTEXT.md` — add discoveries/follow-up technical debt if any.

**Check If Affected:**
- `AGENTS.md` — update only if project-level commands/conventions changed (should not be necessary).

## Completion Criteria

- [ ] Dashboard shows licenses/installations and license usage.
- [ ] User can create a license up to plan limits.
- [ ] User can generate an API key for a selected license and sees which license it was added to.
- [ ] User can delete an API key and the UI explains immediate revocation.
- [ ] Lint and build have been run or documented if blocked by pre-existing issues.

## Git Commit Convention

Commits happen at **step boundaries** (not after every checkbox). All commits for this task MUST include the task ID for traceability:

- **Step completion:** `feat(TP-003): complete Step N — description`
- **Bug fixes:** `fix(TP-003): description`
- **Tests:** `test(TP-003): description`
- **Hydration:** `hydrate: TP-003 expand Step N checkboxes`

## Do NOT

- Do not bypass backend license limits in the UI.
- Do not show raw API keys except immediately after creation.
- Do not remove the existing tokens/agents dashboard sections.
- Do not skip validation commands without documenting why.
- Do not modify framework/standards docs without explicit user approval.

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
