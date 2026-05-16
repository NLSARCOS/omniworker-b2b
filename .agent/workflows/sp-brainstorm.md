# Workflow: /sp-brainstorm

## Description

Explore requirements and create design specs before writing any code. Transforms rough ideas into fully formed designs through collaborative dialogue.

## Usage

```
/sp-brainstorm <idea or feature description>
```

## Process

1. **Explore project context** — check files, docs, recent commits
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — with trade-offs and recommendation
4. **Present design sections** — get approval after each section
5. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
6. **Spec self-review** — check for placeholders, contradictions, ambiguity
7. **User reviews written spec** — wait for approval before proceeding

## Output

- Design document in `docs/superpowers/specs/`
- User approval on approach
- Ready for `/sp-plan`

## Hard Gate

⛔ **NO code is written, no implementation started until design is approved.**

## Next Step

After approval, use `/sp-plan` to create the implementation plan.
