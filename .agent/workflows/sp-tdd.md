# Workflow: /sp-tdd

## Description

Enforce Test-Driven Development: RED-GREEN-REFACTOR cycle. Write the test first, watch it fail, write minimal code to pass.

## Usage

```
/sp-tdd <feature or function to implement>
```

Or invoke during any implementation task.

## The Cycle

### 🔴 RED — Write Failing Test

- Write one minimal test showing what should happen
- One behavior per test
- Clear test name
- Real code (no mocks unless unavoidable)

### ✅ Verify RED — Watch It Fail

**MANDATORY. Never skip.**

```bash
npm test path/to/test.test.ts
```

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

### 🟢 GREEN — Minimal Code

- Write simplest code to pass the test
- No extra features
- No refactoring yet
- Just enough to pass

### ✅ Verify GREEN — Watch It Pass

**MANDATORY.**

```bash
npm test path/to/test.test.ts
```

Confirm:
- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

### 🔵 REFACTOR — Clean Up

- Remove duplication
- Improve names
- Extract helpers
- Keep tests green
- Don't add behavior

### 🔁 Repeat

Next failing test for next feature.

## Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? **Delete it. Start over.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Keeping unverified code is debt. |

## Red Flags — STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- "I'll add tests later"
- "Just this once without TDD"

## Verification Checklist

Before marking work complete:

- [ ] Every new function has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine
- [ ] Edge cases covered

Can't check all boxes? You skipped TDD. Start over.
