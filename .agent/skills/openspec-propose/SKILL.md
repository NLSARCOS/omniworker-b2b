---
name: openspec-propose
description: Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation.
license: MIT
compatibility: Standalone — no CLI required. Works by creating files directly.
metadata:
  author: antigravity-unified
  version: "2.0"
  basedOn: "openspec 1.2.0"
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- specs/*.md (testable requirements)
- tasks.md (implementation steps)

When ready to implement, run /opsx-apply

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Ask the user:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory structure**

   Create the following directory and files directly (no CLI needed):

   ```
   openspec/changes/<name>/
   ├── proposal.md      # What & why
   ├── design.md        # Technical how
   ├── specs/           # Testable requirements
   │   └── <capability>/spec.md
   └── tasks.md         # Implementation checklist
   ```

   If `openspec/changes/<name>/` already exists, ask if user wants to continue it or create a new one.

3. **Create artifacts in sequence**

   **a. proposal.md** — What and why
   ```markdown
   # <Change Name>

   ## Problem
   <What problem does this solve?>

   ## Proposed Solution
   <High-level approach>

   ## Scope
   - In scope: <what's included>
   - Out of scope: <what's excluded>

   ## Success Criteria
   - <measurable outcomes>
   ```

   **b. design.md** — Technical how
   ```markdown
   # Technical Design: <Change Name>

   ## Architecture
   <How it fits into the system>

   ## Key Decisions
   <Technical choices and tradeoffs>

   ## Data Model
   <If applicable>

   ## Risk Mitigation
   <What could go wrong and how to handle it>
   ```

   **c. specs/<capability>/spec.md** — Testable requirements
   ```markdown
   # Spec: <Capability Name>

   ## Requirements
   - <requirement 1>
   - <requirement 2>

   ## Scenarios
   ### Scenario: <name>
   - Given: <precondition>
   - When: <action>
   - Then: <expected result>
   ```

   **d. tasks.md** — Implementation checklist
   ```markdown
   # Tasks: <Change Name>

   ## Implementation Checklist

   - [ ] Task 1: <description>
   - [ ] Task 2: <description>
   - [ ] Task 3: <description>

   ## Verification
   - [ ] All tests pass
   - [ ] Manual verification complete
   ```

4. **Show final status**

   List all created files and their locations.

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx-apply` to start working on the tasks."

**Guardrails**
- Create ALL artifacts needed for implementation
- If context is critically unclear, ask the user — but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
- `context` and `rules` are constraints for YOU, not content for the file
