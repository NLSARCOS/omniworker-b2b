---
description: Archive a completed change
---

Archive a completed change.

**Input**: Optionally specify a change name after `/opsx-archive` (e.g., `/opsx-archive add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   List directories in `openspec/changes/` (excluding `archive/`) to find active changes.
   Ask the user to select which one to archive.

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Check which artifacts exist in `openspec/changes/<name>/`:
   - `proposal.md`, `design.md`, `specs/*/spec.md`, `tasks.md`

   **If any expected artifacts are missing:**
   - Display warning listing incomplete artifacts
   - Ask user to confirm they want to proceed

3. **Check task completion status**

   Read `tasks.md` and count `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Ask user to confirm they want to proceed

4. **Assess delta spec sync state**

   Check for specs at `openspec/changes/<name>/specs/`. If none exist, proceed.

   **If delta specs exist:**
   - Compare with main specs at `openspec/specs/<capability>/spec.md`
   - Show summary and ask: "Sync now (recommended)" or "Archive without syncing"

5. **Perform the archive**

   ```bash
   mkdir -p openspec/changes/archive
   mv openspec/changes/<name> openspec/changes/archive/YYYY-MM-DD-<name>
   ```

   Check if target already exists first.

6. **Display summary**

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/

All artifacts complete. All tasks complete.
```

**Guardrails**
- Always prompt for change selection if not provided
- Don't block archive on warnings — just inform and confirm
- Show clear summary of what happened
