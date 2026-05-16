# Blackbox Agents — Multi-Agent Profile

> Profile optimized for the Blackbox multi-agent orchestration system.
> Use when running automated pipelines, multi-agent workflows, or batch operations.
> Based on [claude-token-efficient](https://github.com/drona23/claude-token-efficient) agents profile.
> **Tool-agnostic:** Works with Claude Code, Cursor, Windsurf, Cline, Continue, or any AI assistant.

---

## Structured Output Only

- Responses must be actionable: code, JSON, bullets, or tables.
- No prose paragraphs when a bullet or table works.
- No conversational filler.

## Zero Narration

| Forbidden | Allowed |
|-----------|---------|
| "Now I will analyze the code..." | [Analyze it] |
| "Let me check the database schema..." | [Check it] |
| "I have completed the implementation..." | [The implementation is done — show results] |
| "I'll start by reading the agent file..." | [Read it] |
| "Here's what I found: ..." | [Show what you found] |

## No Confirmation Prompts on Defined Tasks

- If the task is clearly defined (via workflow, agent, or explicit instruction): execute.
- Only ask for clarification when requirements are genuinely ambiguous.
- Never ask "Should I proceed?" when the instruction is clear.

## Hallucination Prevention (Critical for Agents)

- Never invent file paths — search for them first.
- Never invent API endpoints — check the codebase.
- Never invent function/variable names — read the source.
- Never invent dependency versions — check package files.
- If unknown: return `null`, `UNKNOWN`, or explicitly say "not found in codebase".

## Token Efficiency in Multi-Agent Context

Every token saved multiplies across agent calls:

| Pattern | Impact |
|---------|--------|
| Agent returns 200 words instead of 50 | 4x waste per agent call |
| Agent includes 3 paragraphs of explanation | Skipped by orchestrator |
| Agent narrates its process | Slows pipeline, adds noise |
| Agent summarizes its output | User/orchestrator reads the code |

**Rule:** Return the minimum useful output. Let the orchestrator or user decide if more is needed.

## Agent Output Format

```
🤖 Applying knowledge of @[agent-name]...

[Code / Fix / Answer / Table / JSON]

[1-2 line explanation ONLY if non-obvious]
```

## Parallel Agent Coordination

When dispatching multiple agents:

1. **Decompose** the task into independent subtasks
2. **Tag** each as `parallel-safe` or `sequential-required`
3. **Dispatch** parallel-safe tasks concurrently
4. **Merge** results — check for conflicts before presenting

Rules:
- Never parallelize tasks writing to the same file
- If unsure about dependencies, default to sequential
- Report conflicts explicitly — never silently overwrite

## Error Handling in Agent Pipeline

- If an agent fails, report: agent name + error + file/line
- Don't retry the same action blindly — diagnose first
- If a dependency is missing, say what's missing and where to find it
- Never suppress errors to "clean up" output

## Integration with Blackbox System

| Component | Location | When to Read |
|-----------|----------|-------------|
| Master rules | `.agent/rules/GEMINI.md` | Every session start |
| Token efficiency | `.agent/rules/token-efficiency.md` | Always active |
| Multi-agent profile | `.agent/rules/profile-multi-agent.md` | Agent pipelines |
| Architecture | `.agent/ARCHITECTURE.md` | Session start |
| Memory | `.agent/MEMORY.md` | Session start, before decisions |
| Agent configs | `.agent/agents/*.md` | When agent is activated |
| Skills | `.agent/skills/*/SKILL.md` | When skill is needed |
| Workflows | `.agent/workflows/*.md` | When command is invoked |
| Validation | `.agent/scripts/*.py` | After significant changes |

## Quick Checklist Before Every Agent Response

| # | Check |
|---|-------|
| 1 | Did I skip the preamble? |
| 2 | Is my output actionable (code/bullet/table)? |
| 3 | Did I avoid narrating my process? |
| 4 | Did I verify paths/names exist (not hallucinated)? |
| 5 | Is the explanation under 2 lines (or absent)? |
| 6 | Did I avoid adding unsolicited features? |
