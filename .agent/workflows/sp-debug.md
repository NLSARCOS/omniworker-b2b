# Workflow: /sp-debug

## Description

Systematic 4-phase debugging process. Find root cause before attempting fixes. Symptom fixes are failure.

## Usage

```
/sp-debug <bug description or error message>
```

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## The Four Phases

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?

3. **Check Recent Changes**
   - `git diff`, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence** (multi-component systems)
   - Add logging at each component boundary
   - Log what enters and exits each component
   - Verify environment/config propagation
   - Check state at each layer

5. **Trace Data Flow**
   - Where does bad value originate?
   - What called this with bad value?
   - Trace up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code
   - What works that's similar to what's broken?

2. **Compare Against References**
   - Read reference implementation completely
   - Don't skim — read every line

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small

4. **Understand Dependencies**
   - What components does this need?
   - What settings, config, environment?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? → Phase 4
   - Didn't work? → Form NEW hypothesis
   - DON'T add more fixes on top

### Phase 4: Implementation

**Fix the root cause:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - MUST have before fixing

2. **Implement Single Fix**
   - Address the root cause
   - ONE change at a time
   - No "while I'm here" improvements

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - STOP
   - Count: How many fixes tried?
   - If < 3: Return to Phase 1
   - **If ≥ 3: Question the architecture**

## Red Flags — STOP and Follow Process

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "One more fix attempt" (when already tried 2+)

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |
