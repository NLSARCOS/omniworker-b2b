# Workflow: /sp-plan

## Description

Create detailed implementation plans with bite-sized tasks (2-5 minutes each). Assumes the implementer has zero context and questionable taste — documents everything they need.

## Usage

```
/sp-plan
```

Run after `/sp-brainstorm` has completed and design is approved.

## Process

1. **Load approved design** from `docs/superpowers/specs/`
2. **Map file structure** — which files to create/modify
3. **Create bite-sized tasks** — each task is one action (2-5 min)
4. **Include exact paths and complete code** — no placeholders
5. **Save plan** to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
6. **Self-review** — check spec coverage and placeholders
7. **Offer execution options** — Subagent-Driven or Inline

## Task Format

```markdown
### Task N: Component Name

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**
  [complete test code]
  
- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest tests/path/test.py::test_name -v`
  Expected: FAIL with "function not defined"
  
- [ ] **Step 3: Write minimal implementation**
  [complete implementation code]
  
- [ ] **Step 4: Run test to verify it passes**
  Run: `pytest tests/path/test.py::test_name -v`
  Expected: PASS
  
- [ ] **Step 5: Commit**
  ```bash
  git add tests/path/test.py src/path/file.py
  git commit -m "feat: add specific feature"
  ```
```

## Execution Options

After plan is complete, choose:

1. **Subagent-Driven (recommended)** — Use `/superpowers` or `/sp-subagent`
2. **Inline Execution** — Use `/sp-execute`

## Principles

- DRY (Don't Repeat Yourself)
- YAGNI (You Aren't Gonna Need It)
- TDD (Test-Driven Development)
- Frequent commits
