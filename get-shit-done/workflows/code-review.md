# Shared Code Review Workflow

Shared logic for `/gsd:verify-work` (Step 3) and `/gsd:verify-task` (Step 6). Both commands provide scope-specific parameters via `<review_scope>` XML, then follow this workflow for automated code review.

**Consumers:** `commands/gsd/verify-work.md`, `commands/gsd/verify-task.md`

---

## Scope Parameters (provided by command)

```xml
<review_scope>
  <entity_type>phase | task</entity_type>
  <entity_identifier>{phase identifier | task identifier}</entity_identifier>
  <completed_tasks>[{name, identifier, title, done}]</completed_tasks>
  <verification_criteria>[{source, criterion, type}]</verification_criteria>
  <requirements_content>{markdown, if available}</requirements_content>
</review_scope>
```

---

<commit_identification>

## Identify and Gather Changes

```
all_commits = []

# For phase scope: iterate completed tasks
# For task scope: single task identifier
FOR each task in review_scope.completed_tasks:
  task_commits = run_bash("git log --all --oneline --grep='" + task.identifier + "'")
  IF task_commits:
    all_commits.push(...task_commits)

# Deduplicate and sort
all_commits = deduplicate(all_commits)

# Fallback if no task-specific commits found
IF all_commits.length == 0:
  # Check summary pages for commit references
  IF summary_content:
    commit_refs = extract_commit_hashes(summary_content)
    IF commit_refs.length > 0:
      all_commits = commit_refs

  # Last resort: recent changes
  IF all_commits.length == 0:
    all_commits = run_bash("git log --oneline -20")
    Display: "No task-specific commits found. Reviewing recent changes."

# Get consolidated diff
IF all_commits has identifiable range:
  changed_files = run_bash("git diff --name-only " + oldest + "^.." + newest)
  full_diff = run_bash("git diff " + oldest + "^.." + newest)
ELSE:
  changed_files = run_bash("git diff --name-only HEAD~10")
  full_diff = run_bash("git diff HEAD~10")

# Read changed files for context
FOR each file in changed_files:
  Read(file)

Display: "Reviewing {changed_files.length} files across {all_commits.length} commits"
```

</commit_identification>

<requirements_traceability>

## Requirements Traceability

Map each verification criterion to actual code changes.

```
traceability = []

FOR each criterion in review_scope.verification_criteria:
  evidence = []
  FOR each file in changed_files:
    matches = search_diff_and_file(criterion.criterion, file, full_diff)
    IF matches:
      evidence.push(file + ":" + match_lines)

  status = "NOT MET"
  IF evidence.length > 0:
    status = "MET"
  ELIF criterion.type == "subtask_completion" AND criterion.done:
    status = "MET (subtask marked done)"

  traceability.push({
    criterion: criterion,
    status: status,
    evidence: evidence
  })
```

### TDD Compliance Check

```
FOR each task in review_scope.completed_tasks:
  task_tags = mosic_get_document_tags("MTask", task.name)
  is_tdd_task = task_tags.some(t => t.tag == "tdd")

  IF is_tdd_task:
    # Verify TDD commit pattern
    task_commits = run_bash("git log --all --oneline --grep='" + task.identifier + "'")
    has_test_commit = task_commits.some(c => c.includes("test("))
    has_feat_commit = task_commits.some(c => c.includes("feat("))

    traceability.push({
      criterion: { criterion: "TDD: test commit(s) before implementation commit(s)", type: "tdd_compliance" },
      status: has_test_commit ? "MET" : "NOT MET",
      evidence: has_test_commit ? ["Found test() commits"] : ["No test() commits found"]
    })

    # Check RED/GREEN/REFACTOR subtask completion
    subtasks = mosic_search_tasks({ parent_task: task.name })
    tdd_phases = subtasks.filter(s => s.title.match(/^(RED|GREEN|REFACTOR):/))
    incomplete_phases = tdd_phases.filter(s => !s.done)

    IF incomplete_phases.length > 0:
      traceability.push({
        criterion: { criterion: "TDD phases complete", type: "tdd_phase_completion" },
        status: "NOT MET",
        evidence: ["Incomplete: " + incomplete_phases.map(p => p.title).join(", ")]
      })
```

</requirements_traceability>

<code_quality_analysis>

## Code Quality Analysis

For each changed file, analyze the diff and full content for issues.

```
auto_findings = []

FOR each file in changed_files:
  # CORRECTNESS
  # - Logic errors, off-by-one, null/undefined handling
  # - Error paths handled appropriately
  # - Return types and function signatures correct
  # - Database operations atomic where needed
  # - External boundaries validated (user input, API responses)

  # SECURITY
  # - No SQL injection (parameterized queries)
  # - No XSS (escaped user content in templates)
  # - No command injection (sanitized shell input)
  # - Permission checks present on endpoints
  # - No secrets/credentials in code or logs

  # OVER-ENGINEERING
  # - Abstractions used only once
  # - Config/options for hypothetical future needs (YAGNI)
  # - Helper functions wrapping 3 or fewer lines
  # - Extra error handling for impossible scenarios

  # STUB DETECTION (per verification-patterns.md)
  # - TODO/FIXME/PLACEHOLDER in new code
  # - Empty function bodies (return null, pass, ...)
  # - Console.log-only handlers
  # - Hardcoded values where dynamic expected

  # Each finding: { severity: "Critical"|"Warning"|"Note", file, line, issue, fix, related_task }

# Add TDD compliance to findings summary
tdd_tasks = review_scope.completed_tasks.filter(t => {
  tags = mosic_get_document_tags("MTask", t.name)
  return tags.some(tag => tag.tag == "tdd")
})

IF tdd_tasks.length > 0:
  auto_findings.push({
    severity: "Note",
    file: "n/a",
    line: "n/a",
    issue: "TDD Compliance: " + tdd_tasks.length + " TDD tasks in scope",
    fix: "Verify test-first commit ordering and RED/GREEN/REFACTOR phase completion",
    related_task: tdd_tasks.map(t => t.identifier).join(", ")
  })
```

</code_quality_analysis>

<present_review>

## Present Review Results

```
met = traceability.filter(t => t.status.startsWith("MET")).length
total = traceability.length
critical = auto_findings.filter(f => f.severity == "Critical").length
warnings = auto_findings.filter(f => f.severity == "Warning").length

verdict = "PASS"
IF critical > 0: verdict = "CRITICAL ISSUES"
ELIF warnings > 0: verdict = "NEEDS ATTENTION"
ELIF met < total: verdict = "GAPS FOUND"

# Flag files changed but not traced to any criterion
unrequested_files = changed_files.filter(f =>
  !traceability.any(t => t.evidence.any(e => e.includes(f)))
)

Display:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CODE REVIEW: {entity_identifier}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verdict: {verdict}
Files changed: {changed_files.length}
Commits: {all_commits.length}

### Requirements Traceability

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
{traceability.map((t, i) =>
  "| " + (i+1) + " | " + t.criterion.criterion.substring(0,60) + " | " +
  t.status + " | " + (t.evidence.join(", ") or "-") + " |"
).join("\n")}

Score: {met}/{total} requirements traced to code

{IF auto_findings.length > 0:}
### Findings

{auto_findings.map(f =>
  "**" + f.severity + "** `" + f.file + ":" + f.line + "`\n" +
  f.issue + "\n*Suggested fix:* " + f.fix
).join("\n\n")}
{ENDIF}

---

{IF unrequested_files.length > 0:}
### Scope Check

Files changed but not traced to any requirement:
{unrequested_files.map(f => "- " + f).join("\n")}
{ENDIF}

Proceeding to manual testing/verification...
"""
```

### Augment Test/Verification Items

```
# Add Critical/Warning findings as additional test items
FOR each finding in auto_findings.filter(f => f.severity in ["Critical", "Warning"]):
  # Command adds these to its test_items or verification_criteria list
  # with source: "code_review", type: "code_review_finding", auto_detected: true
```

### Output Variables

The workflow produces these variables for the command to use:
- `traceability[]` — per-criterion trace results
- `auto_findings[]` — code quality findings
- `changed_files[]` — list of changed file paths
- `all_commits[]` — list of relevant commits
- `verdict` — overall review verdict
- `unrequested_files[]` — files changed but not traced to any criterion

</present_review>
