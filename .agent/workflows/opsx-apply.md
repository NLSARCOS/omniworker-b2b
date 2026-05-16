---
description: Implement tasks from an OpenSpec change
---

Implement tasks from an OpenSpec change.

**Input**: Optionally specify a change name (e.g., `/opsx-apply add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, list directories in `openspec/changes/` (excluding `archive/`) and ask the user to select

   Always announce: "Using change: <name>"

2. **Read context files**

   Read all artifacts in `openspec/changes/<name>/` for context:
   - `proposal.md` — understand what and why
   - `design.md` — understand the technical approach
   - `specs/*/spec.md` — understand the requirements
   - `tasks.md` — get the task list

   If any key file is missing, warn the user and suggest running `/opsx-propose` first.

3. **Parse and show task progress**

   Read `tasks.md` and count:
   - `- [ ]` = pending tasks
   - `- [x]` = completed tasks

   Display progress: "N/M tasks complete" + remaining tasks overview

4. **Implement tasks (loop until done or blocked)**

   For each pending task:
   - Show which task is being worked on
   - Make the code changes required
   - Keep changes minimal and focused
   - Mark task complete in tasks.md: `- [ ]` → `- [x]`
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → suggest updating artifacts
   - Error or blocker encountered → report and wait for guidance
   - User interrupts

5. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest `/opsx-archive`
   - If paused: explain why and wait for guidance

**Guardrails**
- Keep going through tasks until done or blocked
- Always read context files before starting
- If task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
