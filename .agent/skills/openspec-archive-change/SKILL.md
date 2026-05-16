---
name: openspec-archive-change
description: Archive a completed change. Use when the user wants to finalize and archive a change after implementation is complete.
license: MIT
compatibility: Standalone — no CLI required. Uses mkdir/mv directly.
metadata:
  author: antigravity-unified
  version: "2.0"
  basedOn: "openspec 1.2.0"
---

Archive a completed change.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   List directories in `openspec/changes/` (excluding `archive/`) to find active changes.
   Ask the user to select which one to archive.

   Show only active changes (not already archived).
   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Read the change directory and check which artifacts exist:
   - `proposal.md` — exists?
   - `design.md` — exists?
   - `specs/*/spec.md` — any specs?
   - `tasks.md` — exists?

   **If any expected artifacts are missing:**
   - Display warning listing incomplete artifacts
   - Ask user to confirm they want to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read `tasks.md` and count:
   - `- [ ]` = incomplete tasks
   - `- [x]` = complete tasks

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Ask user to confirm they want to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Check for delta specs at `openspec/changes/<name>/specs/`. If none exist, proceed without sync prompt.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`
   - Determine what changes would be applied
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now"

5. **Perform the archive**

   Create the archive directory if it doesn't exist:
   ```bash
   mkdir -p openspec/changes/archive
   ```

   Generate target name using current date: `YYYY-MM-DD-<change-name>`

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move the change directory to archive

   ```bash
   mv openspec/changes/<name> openspec/changes/archive/YYYY-MM-DD-<name>
   ```

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Archive location
   - Whether specs were synced (if applicable)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All artifacts complete. All tasks complete.
```

**Guardrails**
- Always prompt for change selection if not provided
- Don't block archive on warnings — just inform and confirm
- Show clear summary of what happened
- If delta specs exist, always run the sync assessment before prompting
