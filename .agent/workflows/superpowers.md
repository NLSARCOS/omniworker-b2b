# Workflow: /superpowers

## Description

Execute the complete Superpowers development workflow: from brainstorming to implementation using systematic TDD, debugging, and subagent-driven development.

## Usage

```
/superpowers <feature-description>
```

## Phases

### Phase 1: Brainstorming

**Skill:** `sp-brainstorming`

- Explore project context
- Ask clarifying questions (one at a time)
- Propose 2-3 approaches with trade-offs
- Present design sections for approval
- Write design doc to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Self-review the spec
- Get user approval on written spec

### Phase 2: Writing Plans

**Skill:** `sp-writing-plans`

- Create implementation plan with bite-sized tasks (2-5 min each)
- Map file structure (create/modify/test)
- Include exact file paths and complete code
- Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Self-review for spec coverage and placeholders
- Offer execution options: Subagent-Driven or Inline

### Phase 3: Setup Workspace

**Skill:** `sp-git-worktrees`

- Check existing worktree directories
- Verify .gitignore if project-local
- Create isolated worktree with new branch
- Run project setup (npm install, etc.)
- Verify clean test baseline

### Phase 4: Execute Plan

**Option A: Subagent-Driven (Recommended)**

**Skill:** `sp-subagent-dev`

- Fresh subagent per task
- Two-stage review after each task (spec compliance → code quality)
- Handle subagent questions and blockers
- Fast iteration with quality gates

**Option B: Inline Execution**

**Skill:** `sp-executing-plans`

- Execute tasks in current session
- Batch execution with checkpoints
- Stop when blocked, ask for help

### Phase 5: TDD Enforcement

**Skill:** `sp-tdd`

Every task MUST follow RED-GREEN-REFACTOR:
1. **RED:** Write failing test
2. **Verify RED:** Watch it fail
3. **GREEN:** Write minimal code to pass
4. **Verify GREEN:** Watch all tests pass
5. **REFACTOR:** Clean up while staying green

### Phase 6: Debugging (if needed)

**Skill:** `sp-systematic-debugging`

If issues arise during implementation:
1. **Phase 1:** Root cause investigation
2. **Phase 2:** Pattern analysis
3. **Phase 3:** Hypothesis and testing
4. **Phase 4:** Implementation with failing test

### Phase 7: Code Review

**Skill:** `sp-code-review`

- Review after each task (subagent-driven)
- Review after each batch (inline)
- Review before merge
- Address critical and important issues

### Phase 8: Complete Development

**Skill:** `sp-finish-branch`

- Verify all tests pass
- Present 4 options: Merge locally / Create PR / Keep / Discard
- Execute chosen option
- Clean up worktree (if merge or discard)

## Example

```
You: /superpowers Add user authentication with JWT

AI: 🧠 Starting Superpowers workflow...
    [Phase 1: sp-brainstorming]
    Exploring project context...
    "What auth methods do you prefer? JWT tokens, sessions, or OAuth?"
    ...
    Design approved and saved to docs/superpowers/specs/2024-01-15-auth-design.md
    
    [Phase 2: sp-writing-plans]
    Creating implementation plan with 12 tasks...
    Saved to docs/superpowers/plans/2024-01-15-auth-plan.md
    
    Execution options:
    1. Subagent-Driven (recommended) - Fresh subagent per task + two-stage review
    2. Inline Execution - Execute in this session with checkpoints
    
    Which would you prefer?

You: Option 1

AI: [Phase 3: sp-git-worktrees]
    Creating worktree at .worktrees/auth...
    Tests passing (47 tests, 0 failures)
    
    [Phase 4-7: sp-subagent-dev + sp-tdd + sp-code-review]
    Task 1/12: ✅ Login endpoint (3 reviews passed)
    Task 2/12: ✅ JWT middleware (3 reviews passed)
    ...
    Task 12/12: ✅ Integration tests (3 reviews passed)
    
    [Phase 8: sp-finish-branch]
    All tests passing (63 tests, 0 failures)
    
    What would you like to do?
    1. Merge back to main locally
    2. Push and create a Pull Request
    3. Keep the branch as-is
    4. Discard this work
```

## Individual Skills

You can also use individual Superpowers skills directly:

| Command | Skill | When to use |
|---------|-------|-------------|
| `/sp-brainstorm` | sp-brainstorming | Before starting any creative work |
| `/sp-plan` | sp-writing-plans | After design is approved |
| `/sp-tdd` | sp-tdd | Enforce TDD on current task |
| `/sp-debug` | sp-systematic-debugging | When debugging any issue |
| `/sp-worktree` | sp-git-worktrees | Create isolated workspace |
| `/sp-finish` | sp-finish-branch | Complete development work |

## Philosophy

Superpowers enforces:

- **Test-Driven Development** — Write tests first, always
- **Systematic over ad-hoc** — Process over guessing
- **Complexity reduction** — Simplicity as primary goal
- **Evidence over claims** — Verify before declaring success

## Integration with Blackbox

Superpowers skills complement existing Blackbox components:

- Use `sp-brainstorming` before `/opsx-propose` for rapid ideation
- Use `sp-tdd` with `test-engineer` agent for rigorous testing
- Use `sp-systematic-debugging` with `debugger` agent for root cause analysis
- Use `sp-subagent-dev` with `orchestrator` for complex multi-file changes
