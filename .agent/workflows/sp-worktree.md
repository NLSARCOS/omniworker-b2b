# Workflow: /sp-worktree

## Description

Create isolated git worktrees for feature development. Allows work on multiple branches simultaneously without switching.

## Usage

```
/sp-worktree <branch-name>
```

## Process

### 1. Select Directory

Check in priority order:
1. `.worktrees/` — if exists (preferred)
2. `worktrees/` — if exists
3. `AGENTS.md` — for preference
4. Ask user if no preference found

### 2. Verify Ignore (project-local only)

```bash
git check-ignore -q .worktrees 2>/dev/null
```

If NOT ignored:
- Add to `.gitignore`
- Commit the change
- Then proceed

### 3. Create Worktree

```bash
git worktree add "<path>" -b "<branch-name>"
cd "<path>"
```

### 4. Run Project Setup

Auto-detect and run:
```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 5. Verify Clean Baseline

```bash
npm test  # or cargo test, pytest, go test, etc.
```

If tests fail: Report and ask whether to proceed.

### 6. Report Ready

> "Worktree ready at `<full-path>`
> Tests passing (`<N>` tests, 0 failures)
> Ready to implement `<feature-name>`"

## Example

```
You: /sp-worktree feature/auth

AI: Checking .worktrees/... exists
    Verifying .worktrees/ is ignored... yes
    Creating worktree: git worktree add .worktrees/feature/auth -b feature/auth
    Running npm install...
    Running npm test... 47 passing
    
    Worktree ready at /Users/me/project/.worktrees/feature/auth
    Tests passing (47 tests, 0 failures)
    Ready to implement feature/auth
```

## Cleanup

Use `/sp-finish` when done to optionally clean up the worktree.
