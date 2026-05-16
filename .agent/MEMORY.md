# 🧠 Project Memory

> Auto-maintained by the AI. Read at session start, updated after significant decisions.
> **Keep entries concise** — this file stays under 200 lines to minimize token usage.

---

## 📐 Architecture Decisions

- 2026-03-31 | `.agent` is the daily operating system for development quality | Optimize for fast execution with explicit escalation only when risk is real
- 2026-03-31 | Socratic questioning is targeted, not universal | Avoid blocking routine work with unnecessary discovery loops
- 2026-03-31 | OpenSpec is reserved for high-risk or architecture-shaping work | Medium tasks may use light planning without formal proposal overhead
- 2026-03-31 | Daily readiness should be observable in one command | `doctor.py` is the preferred high-signal operational entry point
- 2026-03-31 | Validation should adapt to the actual changed scope | `smart_validate.py` is the default post-edit audit path
- 2026-03-31 | Project learning must stay repository-scoped | `/learn` writes to `.agent/project-skills/`, not the shared toolkit skills
- 2026-03-31 | Token efficiency matters for daily use | `context_pack.py` is the preferred low-cost startup context

---

## 🛠️ Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Rule engine | Markdown playbooks | Agents, workflows, and global rules live as docs |
| Automation | Python 3 | Validation and helper scripts use Python-based runners |
| Validation | Script-based checks | Quality gates are invoked from `.agent/scripts/*.py` |

---

## 🎨 Design Decisions

- Prefer operational clarity over ceremony in internal tooling docs
- Keep workflows concise, executable, and aligned with day-to-day developer behavior

---

## 🐛 Known Issues & Gotchas

- **[routing]** Overly rigid questioning hurts daily throughput: use targeted clarification only when ambiguity or risk is material
- **[system-docs]** Template-only `CODEBASE.md` and `MEMORY.md` weaken the whole system: keep them minimally useful at all times

---

## 📏 Established Patterns

- **central-rule-first**: `GEMINI.md` defines global behavior and must stay aligned with workflows and agents
- **risk-based-validation**: run checks proportional to change scope instead of always forcing the full suite
- **execution-by-default**: direct work is preferred for clear low-risk tasks; planning is an escalation path, not the default
- **parallel-when-safe**: use subagents in parallel only when dependencies and write scopes are clearly separated

---

## 🔑 Key Configs & Secrets Layout

- No secrets should be stored in `.agent`; only references to command usage and validation entry points belong here

---

## 👤 User Preferences

- Wants `.agent` to be highly practical for day-to-day development
- Values product quality, maintainability, and reliable delivery over flashy process
- Prefers low-friction guidance that still helps ship polished work

---

## 📝 Session Notes

- 2026-03-31 | Added self-check and doctor workflows, upgraded preview management, and reinforced safe parallel-subagent guidance

---

<!-- 
MAINTENANCE RULES (for AI):
- Max 200 lines total
- Prune session notes older than 2 weeks
- Merge duplicate entries
- Keep each entry to 1 line max
- Never store secrets, tokens, or passwords
-->
