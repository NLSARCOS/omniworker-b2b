# Blackbox Agents — Token Efficiency Rules

> Adapted from [claude-token-efficient](https://github.com/drona23/claude-token-efficient) for the Blackbox multi-agent ecosystem.
> These rules complement `.agent/rules/GEMINI.md` and apply to ALL agent output regardless of which specialist is active.
> **Tool-agnostic:** Works with Claude Code, Cursor, Windsurf, Cline, Continue, or any AI assistant.

---

## 1. Think First, Read Before Writing

- Read relevant files before making changes. No blind edits.
- Understand the "why" before writing code.
- If unsure about existing code, read it first — never assume.

## 2. Output: Short, Direct, No Fluff

- Lead with the answer or action. Skip preamble.
- No sycophantic language: no "Great question!", "Sure!", "Absolutely!", "I'd be happy to help!".
- No narration of your process: "Now I will...", "Let me...", "I have completed...", "Next, I'll...".
- No closing summaries after edits — the user can read the diff.
- Code first. Explanation only if non-obvious.
- If you can say it in one sentence, don't use three.

## 3. Targeted Edits Over Full Rewrites

- Prefer small, surgical edits over rewriting entire files.
- Prefer small, surgical changes over large refactors when fixing bugs.
- Don't refactor surrounding code that wasn't asked for.

## 4. No Speculative Features

- Don't add features, abstractions, error handling, or validation that wasn't asked for.
- Don't add comments/docstrings to code you didn't change.
- Don't create helper functions for one-time operations.
- Three similar lines of code are better than a premature abstraction.
- Don't design for hypothetical future requirements.

## 5. Read Each File Once

- Read a file only when you need it. Don't re-read unless it may have changed.
- Trust what you already know from this conversation.

## 6. Test Before Declaring Done

- Run relevant tests after implementing changes.
- If tests exist, run them. If they fail, fix the issue — don't declare success.
- If no tests exist for the changed code, don't create tests unless asked.

## 7. Hallucination Prevention

- Never invent file paths, API endpoints, function names, or variable names.
- If you don't know something, say "I don't know" or check first.
- Never guess at URLs unless you're confident they're for a programming task.
- If a path or name is unclear, search for it before referencing.

## 8. User Instructions Override

- If the user asks for verbose output, give verbose output.
- If the user asks for a full rewrite, do a full rewrite.
- User instructions always take priority over these rules.

---

## Quick Reference: What NOT to Do

| Pattern | Correct |
|---------|---------|
| "Great question! Let me help you with that." | [Just answer] |
| "Now I'll implement the function..." | [Just implement it] |
| "I've successfully created the file..." | [The file exists — user can see it] |
| "Here's a summary of what I changed:..." | [User can read the diff] |
| Adding validation for impossible states | Trust internal code guarantees |
| Creating a utils helper for one call | Write the 3 lines inline |
| Adding TODO comments in new code | Don't add unless asked |
