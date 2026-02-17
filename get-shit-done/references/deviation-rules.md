# Deviation Rules

Rules for handling work discovered during execution that was not in the plan.

**Consumers:** execute-plan.md, gsd-executor.md

## What Constitutes a Deviation

A deviation is any work needed that was NOT specified in the plan's subtask list:
- **Bug found** — existing code breaks when integrating new work
- **Missing dependency** — import, package, config, or migration not listed in plan
- **Scope creep** — feature or behavior beyond what the plan specified
- **Blocked by external** — auth gate, unavailable service, missing credentials
- **Unexpected refactor** — existing code needs restructuring to accept new work

## RULE 1: Auto-Fix Bugs

**When:** You discover a bug in existing code while implementing a subtask.

**Auto-fix IF ALL of these are true:**
- The bug blocks your current subtask
- The fix is < 20 lines of code
- The fix is obviously correct (not a design decision)
- The fix is in files related to your current work

**Escalate IF ANY of these are true:**
- The bug is in unrelated code (unintended side-effect risk)
- The fix requires architectural changes
- You are unsure if the current behavior is intentional
- The fix is > 20 lines

**Track:** `[DEVIATION] Auto-fixed bug: {description} in {file}`

## RULE 2: Auto-Add Missing Critical Functionality

**When:** The plan omits something required for the subtask to work (missing import, config entry, type definition, migration step).

**Auto-add IF ALL of these are true:**
- The omission blocks subtask completion
- The addition is mechanical/obvious (not a design decision)
- The addition does not change the public interface

**Escalate IF ANY of these are true:**
- The missing piece implies the plan was fundamentally wrong
- Adding it changes how other subtasks would work
- It requires a new dependency (package, service, API)

**Track:** `[DEVIATION] Auto-added: {description}`

## RULE 3: Auto-Fix Blocking Issues

**When:** Tests fail, linter errors, type errors, or build breaks after implementing a subtask.

**Auto-fix IF:**
- The fix is mechanical (type annotation, import path, config value)
- The fix does not change the intended behavior

**Escalate IF:**
- Fixing requires rethinking the approach
- Multiple cascading failures suggest a deeper problem

**Track:** `[DEVIATION] Auto-fixed blocking: {description}`

## RULE 4: Escalate Architectural Changes

**When:** You realize the plan's approach will not work and a different approach is needed.

**Always escalate. Never auto-fix architectural decisions.**

**Report format:**
```
DEVIATION ESCALATION:
- Subtask: {current subtask}
- Issue: {what does not work}
- Why plan approach fails: {root cause}
- Suggested alternative: {your recommendation}
- Impact on remaining subtasks: {which ones change}
```

**In subtask mode:** Return as SUBTASK FAILED with the escalation details.
**In normal mode:** Present to user if interactive, or document and continue with best judgment if yolo mode.

## Documenting Deviations

All deviations (auto-fixed or escalated) MUST appear in the execution summary:

```
### Deviations

| # | Type | Description | Resolution |
|---|------|-------------|------------|
| 1 | Bug fix | Null check missing in auth middleware | Auto-fixed (Rule 1) |
| 2 | Missing dep | bcrypt not in package.json | Auto-added (Rule 2) |
| 3 | Scope | User requested email notifications | Escalated — deferred |
```

**Zero deviations:** Write "None - executed exactly as planned."

**Deviation count** feeds into the task completion comment and summary page.
