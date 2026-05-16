# Workflow: /sp-execute

## Description

Execute implementation plans inline (in current session) with review checkpoints. Alternative to `/sp-subagent` when subagents are not available.

## Usage

```
/sp-execute
```

Run after `/sp-plan` has created an implementation plan.

## Process

### Step 1: Load and Review Plan

1. Read plan file
2. Review critically — identify questions or concerns
3. If concerns: Raise with user before starting
4. If no concerns: Create TodoWrite and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as `in_progress`
2. Follow each step exactly
3. Run verifications as specified
4. Follow TDD (use `/sp-tdd` if needed)
5. Mark as `completed`

### Step 3: Complete Development

After all tasks complete:
- Use `/sp-finish` to complete the work

## When to Stop and Ask

**STOP immediately when:**
- Hit a blocker (missing dependency, test fails, unclear instruction)
- Plan has critical gaps
- Don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## Differences from /sp-subagent

| Aspect | /sp-subagent | /sp-execute |
|--------|--------------|-------------|
| Execution | Fresh subagent per task | Current session |
| Context | Isolated per task | Shared, accumulates |
| Reviews | Automatic two-stage | Manual checkpoints |
| Best for | Complex, multi-task plans | Simple plans, no subagents |

## Integration

**Required skills:**
- `/sp-worktree` — Set up isolated workspace before starting
- `/sp-tdd` — Follow TDD for each task
- `/sp-finish` — Complete development after all tasks
