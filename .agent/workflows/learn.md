---
description: Auto-extracts established project knowledge into a new reusable skill.
---

# 🧠 Self-Learning Extraction (/learn)

This workflow extracts project-specific knowledge, recurring patterns, or user preferences into a dedicated `.agent/project-skills/` directory so the AI operates better in future sessions for this project only.

### Step 1: Identify the Knowledge
- Analyze the user request or recent conversation history.
- Identify the core principles, anti-patterns, or project-specific rules that need to be memorized.

### Step 2: Extract the Skill
- Determine a concise, hyphenated name for the project skill (e.g., `project-auth-flow`, `ayvens-design-system`).
- Create a new directory at `.agent/project-skills/<skill-name>/`.
- Create `.agent/project-skills/<skill-name>/SKILL.md` using the standard YAML frontmatter format:
```yaml
---
name: [Skill Name]
description: [Short description of when to use this project-specific skill]
---
```
- Write the Markdown rules clearly. Focus on "Principles, not copying" and include concrete code examples based on the user's codebase.
- Keep the skill scoped to this repository's conventions. Do not encode generic toolkit behavior here.

### Step 3: Register the Learning
- Silently update `.agent/MEMORY.md` to note that the new skill was created.
- Announce to the user: "🧠 *He extraído este conocimiento en un nuevo skill de proyecto (`[skill-name]`). A partir de ahora lo aplicaré en este proyecto cuando trabajemos en esto.*"

### Step 4: Safety Rules
- `/learn` is explicit, project-scoped persistence.
- Repeated corrections may be tracked in `.agent/project-skills/_registry.json`.
- Once the project threshold is met, the system may materialize an initial project skill scaffold automatically.
- Never write learned project rules into `.agent/skills/`, which is reserved for the shared toolkit.

### Step 5: Validate
Ensure the created files don't break the system structure:
```bash
python3 .agent/scripts/self_check.py .
```
