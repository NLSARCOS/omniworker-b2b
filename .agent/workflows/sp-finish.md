# Workflow: /sp-finish

## Description

Complete development work by verifying tests, presenting options, and executing chosen workflow (merge, PR, keep, or discard).

## Usage

```
/sp-finish
```

Run after implementation is complete and all tests pass.

## Process

### Step 1: Verify Tests

**Before presenting options:**

```bash
npm test  # or cargo test, pytest, go test, etc.
```

If tests fail:
> "Tests failing (`<N>` failures). Must fix before completing:
> [Show failures]
> Cannot proceed with merge/PR until tests pass."

Stop. Don't proceed to Step 2.

### Step 2: Determine Base Branch

```bash
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

### Step 3: Present Options

> "Implementation complete. What would you like to do?
>
> 1. Merge back to `<base-branch>` locally
> 2. Push and create a Pull Request
> 3. Keep the branch as-is (I'll handle it later)
> 4. Discard this work
>
> Which option?"

### Step 4: Execute Choice

#### Option 1: Merge Locally

```bash
git checkout <base-branch>
git pull
git merge <feature-branch>
<test command>
git branch -d <feature-branch>
```

Then: Cleanup worktree

#### Option 2: Create PR

```bash
git push -u origin <feature-branch>
gh pr create --title "<title>" --body "..."
```

Then: Cleanup worktree

#### Option 3: Keep As-Is

Report: "Keeping branch `<name>`. Worktree preserved at `<path>`."

Don't cleanup worktree.

#### Option 4: Discard

**Confirm first:**
> "This will permanently delete:
> - Branch `<name>`
> - All commits: `<commit-list>`
> - Worktree at `<path>`
>
> Type 'discard' to confirm."

If confirmed:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

Then: Cleanup worktree

### Step 5: Cleanup Worktree (Options 1, 2, 4)

```bash
git worktree list | grep $(git branch --show-current)
git worktree remove <worktree-path>
```

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | ✓ | - | - | ✓ |
| 2. Create PR | - | ✓ | ✓ | - |
| 3. Keep as-is | - | - | ✓ | - |
| 4. Discard | - | - | - | ✓ (force) |
