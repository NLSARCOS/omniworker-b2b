---
description: Universal initialization — scan project, validate system, generate AGENTS.md. Works with ANY AI tool. Run this first. No IDE config required.
---

# /init — Universal Bootstrap

$ARGUMENTS

## Purpose

**The only command you need to start.** Scans the project, validates the `.agent/` system, generates `AGENTS.md` (the universal self-contained guide), and sets up infrastructure. Works with Claude Code, Cursor, Windsurf, ChatGPT, Gemini, Cline, or any AI that can read files.

## When to Run

- First time using Blackbox in a project
- After cloning the repo
- After adding/removing agents, skills, or workflows
- When `AGENTS.md` is missing or outdated
- On any new AI session if unsure about project state

## Process

### Phase 1: Project Scan

Analyze the current project to detect type, stack, and structure:

```
1. Detect project type:
   - package.json → Web/Node.js
   - pubspec.yaml → Flutter
   - build.gradle/Podfile → Mobile native
   - requirements.txt/pyproject.toml → Python
   - Cargo.toml → Rust
   - go.mod → Go
   - None → Generic

2. Identify tech stack:
   - Framework (React, Next.js, Vue, Express, Django, etc.)
   - Database (PostgreSQL, MongoDB, Prisma, etc.)
   - Testing (Jest, Vitest, Pytest, etc.)
   - CSS (Tailwind, CSS Modules, Styled Components, etc.)

3. Map project structure:
   - Top-level directories
   - Source code directories
   - Config files
   - Total file count by type
```

### Phase 2: Validate `.agent/` System

Check toolkit completeness:

```
1. Count agents in .agent/agents/ (expected: 20)
2. Count skills in .agent/skills/ (expected: 58)
3. Count workflows in .agent/workflows/ (expected: 25+)
4. Verify rules files:
   - .agent/rules/GEMINI.md
   - .agent/rules/token-efficiency.md
   - .agent/rules/profile-multi-agent.md
5. Verify scripts in .agent/scripts/
6. Report any missing components
```

### Phase 3: Generate `AGENTS.md`

Create the self-contained master guide at project root:

```
1. Read all .agent/agents/*.md files — extract agent names, domains, skills
2. Read all .agent/workflows/*.md files — extract command names, descriptions
3. Read .agent/rules/GEMINI.md — extract routing matrix
4. Read .agent/rules/token-efficiency.md — extract output rules
5. Read .agent/rules/profile-multi-agent.md — extract agent profile rules

6. Generate AGENTS.md containing EVERYTHING inline:
   - Complete agent routing table (keyword → agent → skills)
   - Output rules (token efficiency, anti-sycophancy, anti-narration)
   - Workflow reference (when to use each command)
   - Superpowers workflow
   - OpenSpec workflow
   - Validation scripts reference
   - Parallel dispatch rules
   - Memory system rules
   - Complete skill list (58)
   - File map

7. The generated file must be SELF-CONTAINED:
   - No "see .agent/rules/..." references for rules
   - All behavioral rules written inline
   - Any AI reads ONLY AGENTS.md and can work immediately
```

### Phase 4: Setup Infrastructure

Create directories and optional IDE files:

```
1. Create if missing:
   - docs/superpowers/specs/    (with .gitkeep)
   - docs/superpowers/plans/    (with .gitkeep)

2. Create optional IDE entry points (thin wrappers pointing to AGENTS.md):
   - CLAUDE.md      → "Read AGENTS.md first"
   - .cursorrules   → "Read AGENTS.md first"
   - .windsurfrules → "Read AGENTS.md first"
   These are OPTIONAL convenience files. AGENTS.md works alone.

3. Update .agent/CODEBASE.md if empty or template
4. Initialize .agent/MEMORY.md with project detection results
```

### Phase 5: Initialization Report

Present a concise summary:

```
BLACKBOX INITIALIZATION COMPLETE
=================================

Project: [type] — [framework] — [database]
Stack: [detected technologies]

.agent/ Status:
  Agents:    [count]/20    ✅ or ⚠️ (missing: list)
  Skills:    [count]/58    ✅ or ⚠️ (missing: list)
  Workflows: [count]/25+   ✅ or ⚠️ (missing: list)
  Rules:     ✅ all present or ⚠️ (missing: list)
  Scripts:   [count] validation scripts

Generated:
  ✅ AGENTS.md — Self-contained system guide (read this first)
  ✅ docs/superpowers/specs/ — Created
  ✅ docs/superpowers/plans/ — Created
  ✅ IDE wrappers (optional) — Created

Primary agents for this [project-type] project:
  → [top 3-5 most relevant agents]

Next steps:
  1. Any AI can now read AGENTS.md and start working
  2. Run: python3 .agent/scripts/doctor.py
  3. Start with any /command
```

## Output Rules

- Follow all output rules from the generated AGENTS.md — no narration, no preamble
- Report facts only — what was found, what was created, what's missing
- No confirmation prompts — execute all phases
- If errors occur, report them and continue

## Key Principle

**AGENTS.md is the product.** After `/init` runs, the user can take `AGENTS.md` + `.agent/` to ANY AI tool and it just works. No IDE-specific setup required. The AI reads `AGENTS.md` and has everything it needs.

## Integration

- Reads: `.agent/` system files
- Writes: `AGENTS.md`, `docs/superpowers/`, optional IDE wrappers
- After init: project is ready for ANY AI assistant
