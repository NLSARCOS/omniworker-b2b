---
description: Coordinate multiple agents for complex tasks. Use for multi-perspective analysis, comprehensive reviews, or tasks requiring different domain expertise.
---

# Multi-Agent Orchestration

You are now in **ORCHESTRATION MODE**. Your task: coordinate specialized agents to solve this complex problem.

## Task to Orchestrate
$ARGUMENTS

---

## 🧠 Adaptive Agent Selection

> **Use the RIGHT number of agents for the task — not a hardcoded minimum.**

| Task Complexity | Agents Needed | Example |
|----------------|---------------|---------|
| **Focused** (1-2 files, 1 domain) | 1-2 agents | "Fix the API auth bug" → debugger + security-auditor |
| **Medium** (3-5 files, 2 domains) | 2-3 agents | "Add dark mode" → frontend + test-engineer |
| **Complex** (5+ files, 3+ domains) | 3-5 agents | "Build checkout" → backend + frontend + db + security |
| **Full Stack** (entire feature) | 4+ agents | "Build social platform" → planner + frontend + backend + db + devops |

> 🔴 **Rule: Match agent count to complexity. Don't force 3 agents for a 1-agent task.**

### Agent Selection Matrix

| Task Type | Recommended Agents |
|-----------|--------------------|
| **Web App** | frontend-specialist, backend-specialist, test-engineer |
| **API** | backend-specialist, security-auditor, test-engineer |
| **UI/Design** | frontend-specialist, seo-specialist, performance-optimizer |
| **Database** | database-architect, backend-specialist, security-auditor |
| **Full Stack** | project-planner, frontend-specialist, backend-specialist, devops-engineer |
| **Debug** | debugger, test-engineer |
| **Security** | security-auditor, devops-engineer |

---

## 2-Phase Orchestration

### PHASE 1: PLANNING (Quick Assessment)

**For simple tasks (1-2 agents):** Skip formal planning. Assess, then execute.

**For complex tasks (3+ agents):**

| Step | Agent | Action |
|------|-------|--------|
| 1 | `project-planner` | Create task breakdown |
| 2 | (optional) Read CODEBASE.md | Understand dependencies |

> After planning, show the user what you'll do and which agents you'll use.
> For complex tasks, ask for approval before implementing.

### PHASE 2: IMPLEMENTATION

Execute agents based on dependency order:

| Parallel Group | Agents |
|----------------|--------|
| Foundation | `database-architect`, `security-auditor` |
| Core | `backend-specialist`, `frontend-specialist` |
| Polish | `test-engineer`, `devops-engineer` |

> ✅ Independent tasks should run in parallel when possible.

## Available Agents

| Agent | Domain | Use When |
|-------|--------|----------|
| `project-planner` | Planning | Task breakdown |
| `frontend-specialist` | UI/UX | React, Vue, CSS, HTML |
| `backend-specialist` | Server | API, Node.js, Python |
| `database-architect` | Data | SQL, NoSQL, Schema |
| `security-auditor` | Security | Vulnerabilities, Auth |
| `test-engineer` | Testing | Unit, E2E, Coverage |
| `devops-engineer` | Ops | CI/CD, Docker, Deploy |
| `mobile-developer` | Mobile | React Native, Flutter |
| `performance-optimizer` | Speed | Lighthouse, Profiling |
| `seo-specialist` | SEO | Meta, Schema, Rankings |
| `debugger` | Debug | Error analysis |
| `game-developer` | Games | Unity, Godot |
| `orchestrator` | Meta | Coordination |
| `penetration-tester` | Security | Offensive validation |
| `product-owner` | Product | Scope, backlog, acceptance criteria |
| `product-manager` | Product | Requirements and prioritization |
| `documentation-writer` | Docs | README, changelogs, guides |
| `qa-automation-engineer` | QA | E2E automation and pipelines |
| `code-archaeologist` | Legacy | Brownfield analysis and refactors |
| `explorer-agent` | Discovery | Codebase mapping and impact analysis |

---

## Orchestration Protocol

### Step 1: Analyze Task Domains
Identify which domains this task touches:
```
□ Security     → security-auditor
□ Backend/API  → backend-specialist
□ Frontend/UI  → frontend-specialist
□ Database     → database-architect
□ Testing      → test-engineer
□ DevOps       → devops-engineer
□ Mobile       → mobile-developer
□ Performance  → performance-optimizer
□ SEO          → seo-specialist
□ Animation    → frontend-specialist + gsap-* skills
```

### Step 2: Select Agents (match to complexity)

**Simple (1-2 domains):** Select 1-2 agents. Execute directly.
**Complex (3+ domains):** Select 3+ agents. Plan first, then implement.

### Step 3: Execute

**🔴 CRITICAL: Context Passing (MANDATORY)**

When coordinating agents, always include:

1. **Original User Request:** Full text of what user asked
2. **Decisions Made:** All user answers to questions
3. **Previous Agent Work:** Summary of what previous agents did
4. **Current State:** Relevant files and context

### Step 4: Verification
Run appropriate validation scripts for the actual risk profile of the task:
```bash
python3 .agent/skills/vulnerability-scanner/scripts/security_scan.py .
python3 .agent/skills/lint-and-validate/scripts/lint_runner.py .
```

Minimum expectation:
- Run `lint_runner.py` for code changes.
- Add `security_scan.py` for auth, secrets, infra, or exposed endpoints.
- Add domain-specific checks when relevant (`test_runner.py`, `schema_validator.py`, `ux_audit.py`, `seo_checker.py`, `playwright_runner.py`).

### Step 5: Synthesize Results
Combine all agent outputs into unified report.

---

## Output Format

```markdown
## 🎼 Orchestration Report

### Task
[Original task summary]

### Agents Invoked
| # | Agent | Focus Area | Status |
|---|-------|------------|--------|
| 1 | agent-name | Focus | ✅ |

### Key Findings
1. **[Agent 1]**: Finding
2. **[Agent 2]**: Finding

### Deliverables
- [x] Code implemented
- [x] Tests passing
- [x] Validation scripts run

### Summary
[One paragraph synthesis of all agent work]
```

---

**Begin orchestration now. Analyze the task, select the right agents, execute, verify, synthesize.**
