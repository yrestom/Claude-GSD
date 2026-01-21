# GSD TDD Implementation: Deep Dive Audit

**Date:** 2026-01-21
**Auditor:** Claude Opus 4.5
**Scope:** Complete analysis of how GSD handles Test-Driven Development

---

## Executive Summary

GSD's TDD implementation is **technically complete but philosophically peripheral**. The system treats TDD as a specialized plan type rather than integrating test-first thinking into its core workflow. While the RED-GREEN-REFACTOR mechanics are well-documented, TDD exists as an optional branch rather than a fundamental pillar.

**Current State:** TDD is a feature you can use.
**Exceptional State:** TDD is woven into how GSD thinks about building software.

---

## Part 1: Understanding GSD's Essence

Before auditing TDD, we must understand what makes GSD unique.

### Core Philosophy

GSD is built around five pillars:

| Pillar | Description |
|--------|-------------|
| **Solo Developer + Claude** | One person (visionary) + one AI (builder). No teams, no ceremonies. |
| **Context Engineering** | Quality degrades with context fill. 0-30% peak, 50%+ degrading, 70%+ poor. |
| **Plans as Prompts** | PLAN.md files are directly executable, not documents transformed into prompts. |
| **Ship Fast** | Plan → Execute → Ship → Learn → Repeat. No enterprise process. |
| **Goal-Backward Methodology** | "What must be TRUE for this goal to be achieved?" not "What should we build?" |

### The GSD Workflow Cycle

```
/gsd:discuss-phase  →  Capture implementation vision (CONTEXT.md)
        ↓
/gsd:plan-phase     →  Research + Create plans + Verify plans
        ↓
/gsd:execute-phase  →  Execute plans in parallel waves
        ↓
/gsd:verify-work    →  Automated + human verification
        ↓
      [repeat]
```

### Key Artifacts

- **PROJECT.md** — Vision and requirements
- **REQUIREMENTS.md** — Scoped features with REQ-IDs
- **ROADMAP.md** — Phases mapped to requirements
- **STATE.md** — Living memory across sessions
- **PLAN.md** — Executable task specifications
- **SUMMARY.md** — What was actually built

---

## Part 2: Current TDD Implementation

### What Exists

GSD has substantial TDD documentation spread across multiple files:

| File | TDD Content |
|------|-------------|
| `references/tdd.md` | 264-line reference document covering philosophy, structure, cycle |
| `agents/gsd-planner.md` | TDD detection heuristic, dedicated TDD plans |
| `agents/gsd-executor.md` | RED-GREEN-REFACTOR execution flow |
| `workflows/execute-plan.md` | TDD plan execution protocol |
| `templates/codebase/testing.md` | Test framework documentation template |
| `GSD-STYLE.md` | TDD commit conventions |

### TDD Detection Heuristic

The planner applies this heuristic to identify TDD candidates:

```
Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
→ Yes: Create a TDD plan
→ No: Use standard plan
```

**TDD Candidates:**
- Business logic with defined inputs/outputs
- API endpoints with request/response contracts
- Data transformations, parsing, formatting
- Validation rules and constraints
- Algorithms with testable behavior
- State machines and workflows

**Skip TDD:**
- UI layout, styling, visual components
- Configuration changes
- Glue code connecting existing components
- One-off scripts and migrations
- Simple CRUD with no business logic

### TDD Plan Structure

```yaml
---
phase: XX-name
plan: NN
type: tdd
---
```

```xml
<objective>
[What feature and why]
Purpose: [Design benefit of TDD for this feature]
Output: [Working, tested feature]
</objective>

<feature>
  <name>[Feature name]</name>
  <files>[source file, test file]</files>
  <behavior>
    [Expected behavior in testable terms]
    Cases: input → expected output
  </behavior>
  <implementation>[How to implement once tests pass]</implementation>
</feature>
```

### RED-GREEN-REFACTOR Execution

**RED Phase:**
1. Create test file following project conventions
2. Write test describing expected behavior
3. Run test - MUST fail
4. Commit: `test({phase}-{plan}): add failing test for [feature]`

**GREEN Phase:**
1. Write minimal code to make test pass
2. Run test - MUST pass
3. Commit: `feat({phase}-{plan}): implement [feature]`

**REFACTOR Phase (if needed):**
1. Clean up if obvious improvements exist
2. Run tests - MUST still pass
3. Commit: `refactor({phase}-{plan}): clean up [feature]`

### Context Budget

TDD plans target **~40% context usage** (lower than standard plans' ~50%) because the RED-GREEN-REFACTOR cycle involves more back-and-forth: write test, run test, debug, implement, run test, iterate.

### Test Framework Auto-Setup

If no test framework exists, the executor sets one up during the RED phase:

| Project Type | Framework | Command |
|--------------|-----------|---------|
| Node.js | Jest | `npm install -D jest @types/jest ts-jest` |
| Node.js (Vite) | Vitest | `npm install -D vitest` |
| Python | pytest | `pip install pytest` |
| Go | testing | Built-in |
| Rust | cargo test | Built-in |

---

## Part 3: Where GSD Misses the Mark

### Gap 1: TDD as Afterthought, Not First-Class Citizen

**Current State:**
TDD detection happens at planning time (`/gsd:plan-phase`). The planner scans tasks and asks "Is this a TDD candidate?"

**The Problem:**
This is backwards. By the time you're planning tasks, you've already framed the problem in terms of *what to build*, not *what behavior to verify*. TDD thinking should start at requirements, not planning.

**Evidence:**
- `/gsd:discuss-phase` captures implementation vision but never asks "How would you verify this works?"
- REQUIREMENTS.md uses feature descriptions, not behavior specifications
- No command exists for "test-first requirements gathering"

### Gap 2: Requirements Are Not Testable Specifications

**Current State:**
Requirements in REQUIREMENTS.md look like:
```markdown
**REQ-01:** User authentication with email/password
**REQ-02:** Dashboard showing project metrics
```

**The Problem:**
These are feature descriptions, not behavior specifications. A TDD-native system would capture:
```markdown
**REQ-01:** User authentication
  - Given valid credentials, returns JWT token (200)
  - Given invalid password, returns error (401)
  - Given non-existent email, returns error (401)
  - Given malformed email, returns validation error (400)
```

**Evidence:**
- `templates/requirements.md` has no behavior specification guidance
- No link between requirements and expected test cases
- Verification happens post-implementation, not pre-specification

### Gap 3: Goal-Backward Methodology Ignores Tests

**Current State:**
Goal-backward produces:
- **Truths** — Observable behaviors ("User can see messages")
- **Artifacts** — Files that must exist (`Chat.tsx`, `api/chat/route.ts`)
- **Key Links** — Critical connections between artifacts

**The Problem:**
Observable truths ARE test cases. If "User can see messages" must be TRUE, there should be a test that verifies it. But `must_haves` in PLAN.md frontmatter has no `tests` field.

**Evidence:**
From `gsd-planner.md`:
```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
  artifacts:
    - path: "src/components/Chat.tsx"
  key_links:
    - from: "src/components/Chat.tsx"
      to: "/api/chat"
```

No `tests` section. Truths are verified by humans, not automated tests.

### Gap 4: TDD Plans Are Isolated Islands

**Current State:**
Each TDD plan is a single feature. The planner creates dedicated TDD plans for TDD candidates.

**The Problem:**
There's no awareness of the cumulative test suite:
- Does this feature's tests interact with existing tests?
- Will this change break unrelated tests?
- What's the current test coverage?
- Are there test patterns we should follow?

**Evidence:**
- STATE.md has no test suite health section
- No `/gsd:test-health` or similar command
- Executor checks "tests pass" but doesn't track coverage or test count

### Gap 5: /gsd:verify-work Ignores Test Quality

**Current State:**
Verification checks:
- Code artifacts exist
- Files are substantive
- Key links are wired

**The Problem:**
No verification of:
- Test coverage meets threshold
- Tests actually test the behavior (not just exist)
- Test-to-requirement mapping
- No regression in existing tests

**Evidence:**
From `workflows/verify-phase.md`:
```markdown
**Automated Checks:**
- [ ] Artifacts exist and are non-empty
- [ ] Exports are present
- [ ] Key links are wired
```
No test-related checks.

### Gap 6: Executor Doesn't Enforce TDD Discipline

**Current State:**
The executor documents TDD execution but doesn't enforce it:
```
If test doesn't fail in RED phase: Investigate before proceeding
If test doesn't pass in GREEN phase: Keep iterating
```

**The Problem:**
These are guidelines, not gates. The executor can proceed even if:
- The "failing" test actually passes (feature already exists)
- The test never actually runs
- The commit message says `test()` but no test was written

**Evidence:**
No code in `gsd-executor.md` that:
- Parses test output to confirm failure
- Blocks on test success before allowing GREEN commit
- Validates test file actually exists

### Gap 7: No Test Discovery in Research Phase

**Current State:**
`/gsd:research-phase` investigates:
- Technology stack
- Architecture patterns
- External dependencies

**The Problem:**
No research into:
- Existing test patterns in the codebase
- Test frameworks already configured
- Integration test requirements
- Mock patterns used

**Evidence:**
- No mention of testing in `agents/gsd-phase-researcher.md`
- Research doesn't produce testing strategy recommendations

### Gap 8: /gsd:discuss-phase Never Asks About Verification

**Current State:**
Discussion captures:
- How user imagines the feature working
- What's essential vs nice-to-have
- Implementation preferences

**The Problem:**
Never asks:
- "How would you verify this works?"
- "What are the edge cases?"
- "What should happen when X fails?"

**Evidence:**
From `workflows/discuss-phase.md`, artifact-type questions include:
- UI: "How should it look?"
- API: "What endpoints?"
- CLI: "What commands?"

No artifact type asks about testable behavior.

### Gap 9: No Contract-First Development Pattern

**Current State:**
API endpoints are identified as TDD candidates:
```
- API endpoints with request/response contracts
```

**The Problem:**
No pattern for:
- Define API contract (OpenAPI/JSON Schema) first
- Generate tests from contract
- Implement to satisfy contract
- Contract acts as both spec and test

**Evidence:**
- No mention of contract testing in TDD docs
- No OpenAPI → test generation workflow
- API tests are behavior tests, not contract tests

### Gap 10: Test Health Invisible in STATE.md

**Current State:**
STATE.md tracks:
- Current position
- Decisions
- Blockers
- Session continuity

**The Problem:**
No awareness of:
- Test count (total, passing, failing)
- Coverage percentage
- Recent test failures
- Regression risk

**Evidence:**
STATE.md template has no testing section.

---

## Part 4: What Would Make GSD's TDD Exceptional

### Vision: TDD as a Thinking Mode, Not a Plan Type

The goal isn't to make TDD plans better. It's to make GSD think in tests naturally.

### Proposal 1: Behavior-Driven Requirements

**Change REQUIREMENTS.md format:**

```markdown
## REQ-01: User Authentication

**Behaviors:**
- `POST /auth/login` with valid credentials → 200 + JWT cookie
- `POST /auth/login` with invalid password → 401 + error message
- `POST /auth/login` with non-existent email → 401 + error message
- `POST /auth/login` with malformed email → 400 + validation error
- `GET /auth/me` with valid token → 200 + user object
- `GET /auth/me` with expired token → 401 + "Token expired"
- `GET /auth/me` with no token → 401 + "Not authenticated"

**Edge Cases:**
- Rate limiting after 5 failed attempts
- Token refresh within last 5 minutes of expiry
```

**Why:** Requirements become test specifications. Planning produces tests, not just code.

### Proposal 2: Test-First Discussion Phase

**Add to /gsd:discuss-phase:**

```markdown
## Verification Questions

For each feature discussed, ask:
1. "How would we verify this works automatically?"
2. "What are the edge cases and failure modes?"
3. "What should happen when [external dependency] fails?"
4. "How would a user confirm this is working?"
```

**Output:** CONTEXT.md includes `## Testable Behaviors` section with input → output specifications.

### Proposal 3: Observable Truths = Test Specifications

**Enhance goal-backward methodology:**

```yaml
must_haves:
  truths:
    - truth: "User can see existing messages"
      test: "GET /api/chat returns 200 with messages[]"
    - truth: "User can send a message"
      test: "POST /api/chat with {content} returns 201"
    - truth: "Messages persist across refresh"
      test: "GET /api/chat after POST returns new message"
  artifacts:
    - path: "src/components/Chat.tsx"
  tests:
    - path: "src/components/Chat.test.tsx"
      covers: ["User can see existing messages", "User can send a message"]
    - path: "src/app/api/chat/route.test.ts"
      covers: ["Messages persist across refresh"]
```

**Why:** Every observable truth has a corresponding test. Verification becomes automated.

### Proposal 4: Test Suite Health in STATE.md

**Add section to STATE.md:**

```markdown
## Test Suite Health

| Metric | Value | Trend |
|--------|-------|-------|
| Total Tests | 47 | +5 |
| Passing | 47 | +5 |
| Failing | 0 | — |
| Coverage | 78% | +3% |
| Last Run | 2026-01-21 14:30 | — |

### Recent Additions
- Phase 03-01: +12 tests (auth endpoints)
- Phase 03-02: +5 tests (user model validation)

### Known Gaps
- Integration tests for webhook handlers (TODO: Phase 05)
```

**Why:** Test health is visible context. Planning knows what's tested and what isn't.

### Proposal 5: Test-Aware Verification

**Enhance /gsd:verify-work:**

```markdown
## Automated Verification

### Artifact Checks
- [ ] Files exist and are non-empty
- [ ] Key links are wired

### Test Checks
- [ ] Tests exist for all observable truths
- [ ] All tests pass (npm test)
- [ ] No regression in existing tests
- [ ] Coverage >= threshold or unchanged
- [ ] Test-to-requirement mapping is complete
```

**Why:** Verification includes test quality, not just code existence.

### Proposal 6: TDD Enforcement in Executor

**Add enforcement gates:**

```markdown
## TDD Execution Gates

### RED Phase Gate
Before committing `test()`:
1. Run test
2. Parse output for FAILURE
3. If test passes: STOP - "Test passes before implementation. Investigate."
4. If test fails: Proceed to commit

### GREEN Phase Gate
Before committing `feat()`:
1. Run test
2. Parse output for SUCCESS
3. If test fails: Do not commit, continue iterating
4. If test passes: Proceed to commit

### REFACTOR Phase Gate
Before committing `refactor()`:
1. Run full test suite
2. If any test fails: STOP - "Refactor broke tests"
3. If all pass: Proceed to commit
```

**Why:** TDD discipline is enforced, not suggested.

### Proposal 7: Test Discovery in Research Phase

**Add to /gsd:research-phase:**

```markdown
## Testing Research

Investigate and document:
1. **Existing Framework:** What test framework is configured?
2. **Test Patterns:** How are tests structured? (describe/it, AAA, fixtures)
3. **Mock Patterns:** What's mocked? What patterns are used?
4. **Coverage Config:** Is coverage tracked? What's the threshold?
5. **Integration Tests:** Are there integration/e2e tests? Where?
6. **Test Gaps:** What areas lack tests?

Output: RESEARCH.md includes `## Testing Patterns` section
```

**Why:** Planning knows how to write tests that match existing patterns.

### Proposal 8: Contract-First API Development

**New pattern for API phases:**

```markdown
## Contract-First API Pattern

1. **Define Contract**
   - Create OpenAPI spec or JSON Schema
   - Define request/response shapes
   - Document error responses

2. **Generate Tests**
   - Contract → test cases
   - Happy path + error cases
   - Edge cases from spec

3. **Implement to Contract**
   - Implementation satisfies contract
   - Contract acts as living documentation
   - Changes require contract update first
```

**Why:** API development becomes specification-driven. Tests come from spec, not imagination.

### Proposal 9: Cumulative Test Suite Awareness

**Planner considers existing tests:**

```markdown
## Test Suite Context

Before planning:
1. Scan existing test files
2. Extract test descriptions
3. Identify tested behaviors
4. Note untested areas

During planning:
- "This feature touches UserService, which has 12 existing tests"
- "Auth module has 89% coverage, maintain or improve"
- "Similar feature X uses factory pattern for test data"
```

**Why:** Plans don't duplicate tests or break existing coverage patterns.

### Proposal 10: Regression Prevention Gate

**Add to execution:**

```markdown
## Regression Gate

After any task commit:
1. Run full test suite (not just new tests)
2. If unrelated tests fail:
   - STOP execution
   - Report regression
   - Create deviation checkpoint
3. Only continue when all tests pass
```

**Why:** Breaking existing tests is a first-class failure mode.

---

## Part 5: Implementation Roadmap

### Phase 1: Foundation (Low Effort, High Impact)

| Change | Effort | Impact |
|--------|--------|--------|
| Add test health section to STATE.md | Low | Medium |
| Add testable behaviors to REQUIREMENTS.md template | Low | High |
| Add verification questions to discuss-phase | Low | High |
| Add test checks to verify-work | Medium | High |

### Phase 2: Enforcement (Medium Effort)

| Change | Effort | Impact |
|--------|--------|--------|
| TDD execution gates in executor | Medium | High |
| Regression prevention gate | Medium | High |
| Test discovery in research phase | Medium | Medium |
| Test-aware goal-backward must_haves | Medium | High |

### Phase 3: Advanced Patterns (Higher Effort)

| Change | Effort | Impact |
|--------|--------|--------|
| Contract-first API workflow | High | Medium |
| Cumulative test suite awareness | High | Medium |
| Test-to-requirement mapping | High | Medium |

---

## Part 6: Summary

### What GSD Gets Right

1. **TDD Detection Heuristic** — Clear criteria for when TDD improves quality
2. **Dedicated TDD Plans** — Recognition that TDD needs full context
3. **RED-GREEN-REFACTOR Documentation** — Well-documented cycle
4. **Atomic Commits** — test() → feat() → refactor() pattern
5. **Context Budget Awareness** — TDD plans get lower context target
6. **Test Framework Auto-Setup** — Frictionless first TDD plan

### What GSD Gets Wrong

1. **TDD as Afterthought** — Detection at planning, not requirements
2. **Requirements Not Testable** — Features, not behavior specifications
3. **Goal-Backward Ignores Tests** — Truths without test mappings
4. **Isolated TDD Plans** — No cumulative suite awareness
5. **Verification Ignores Tests** — Code checks, not test quality checks
6. **No Enforcement** — Guidelines, not gates
7. **No Test Discovery** — Research ignores testing patterns
8. **Discussion Ignores Verification** — Vision without verification
9. **No Contract-First Pattern** — APIs without contracts
10. **Invisible Test Health** — STATE.md has no testing section

### The Core Insight

GSD's philosophy is **goal-backward**: "What must be TRUE for this to work?"

The exceptional TDD implementation recognizes that **observable truths ARE test cases**. Every truth should have a corresponding test. The gap between "User can send a message" and `expect(await sendMessage(content)).toReturn({id, content})` should be zero.

GSD currently treats tests as implementation artifacts. Exceptional GSD would treat tests as **the specification itself** — the authoritative definition of what "working" means.

---

## Appendix: File-by-File Recommendations

### `get-shit-done/references/tdd.md`
- Add section on behavior-driven requirements
- Add contract-first pattern
- Add test suite health tracking guidance

### `agents/gsd-planner.md`
- Add test field to must_haves
- Add existing test suite awareness
- Add test-to-requirement mapping

### `agents/gsd-executor.md`
- Add TDD enforcement gates
- Add regression prevention gate
- Add test output parsing

### `workflows/discuss-phase.md`
- Add verification questions
- Add testable behaviors capture

### `workflows/verify-phase.md`
- Add test quality checks
- Add coverage verification
- Add regression detection

### `templates/requirements.md`
- Add behavior specification format
- Add edge case capture

### `templates/state.md`
- Add test suite health section

### `workflows/research-phase.md` (if exists)
- Add testing research section
- Add pattern discovery

---

*End of Audit Report*
