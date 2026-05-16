# Workflow: /sp-subagent

## Description

Execute implementation plans by dispatching fresh subagents per task with two-stage review (spec compliance → code quality).

## Usage

```
/sp-subagent
```

Run after `/sp-plan` has created an implementation plan.

## Prerequisites

- Implementation plan exists at `docs/superpowers/plans/`
- Git worktree set up (use `/sp-worktree` if needed)

## Process

### Preparation

1. Read plan file
2. Extract all tasks with full text
3. Note context for each task
4. Create TodoWrite with all tasks

### Per Task

1. **Dispatch implementer subagent**
   - Provide full task text + context
   - Answer any questions
   - Wait for implementation, tests, commit, self-review

2. **Check implementer status:**
   - **DONE** → Proceed to spec review
   - **DONE_WITH_CONCERNS** → Read concerns, address if needed
   - **NEEDS_CONTEXT** → Provide context, re-dispatch
   - **BLOCKED** → Assess, escalate if needed

3. **Dispatch spec compliance reviewer**
   - Confirms code matches spec
   - If issues found → implementer fixes → re-review

4. **Dispatch code quality reviewer**
   - Reviews code quality
   - If issues found → implementer fixes → re-review

5. **Mark task complete**

### After All Tasks

1. Dispatch final code reviewer for entire implementation
2. Use `/sp-finish` to complete development

## Model Selection

- **Mechanical tasks** (1-2 files, clear specs): Fast, cheap model
- **Integration tasks** (multi-file, judgment): Standard model
- **Architecture/review tasks**: Most capable model

## Red Flags

**Never:**
- Start on main/master without explicit consent
- Skip either review stage
- Dispatch multiple implementers in parallel
- Make subagent read plan file (provide full text)
- Start code quality review before spec compliance ✅
- Move to next task with open review issues

## Advantages

- Fresh context per task (no confusion)
- Subagents follow TDD naturally
- Quality gates catch issues early
- Parallel-safe (subagents don't interfere)
