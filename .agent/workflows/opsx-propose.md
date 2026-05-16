---
description: Propose a new change - create it and generate all artifacts in one step
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- specs/*.md (testable requirements)
- tasks.md (implementation steps)

When ready to implement, run /opsx-apply

---

**Input**: The argument after `/opsx-propose` is the change name (kebab-case), OR a description of what the user wants to build.

**Steps**

1. **If no input provided, ask what they want to build**

   Ask the user:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**

   Create the directory structure directly:
   ```bash
   mkdir -p openspec/changes/<name>/specs
   ```

   If `openspec/changes/<name>/` already exists, ask if user wants to continue it or create a new one.

3. **Create artifacts in sequence**

   Create these artifacts in order, reading each completed one before writing the next:

   **a. proposal.md** — What & why
   - Problem being solved
   - Proposed solution (high-level)
   - Scope (in/out)
   - Success criteria

   **b. design.md** — Technical how
   - Architecture decisions
   - Key technical choices and tradeoffs
   - Data model (if applicable)
   - Risk mitigation

   **c. specs/<capability>/spec.md** — Testable requirements
   - Requirements list
   - Given/When/Then scenarios

   **d. tasks.md** — Implementation checklist
   - Ordered `- [ ]` task list
   - Verification steps

4. **Show final status**

   List all created files.

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx-apply` to start implementing."

**Guardrails**
- Create ALL artifacts needed for implementation
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user — but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
