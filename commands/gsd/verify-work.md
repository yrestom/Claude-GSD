---
name: gsd:verify-work
description: Validate built features through conversational UAT with Mosic integration
argument-hint: "[phase identifier, e.g., 'P01-1' or task list UUID]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - Task
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Validate built features through conversational testing with Mosic as the single source of truth.

Purpose: Confirm what Claude built actually works from user's perspective. One test at a time, plain text responses, no interrogation. When issues are found, automatically diagnose, plan fixes, and prepare for execution.

Output: UAT Page in Mosic tracking all test results. If issues found: diagnosed gaps, verified fix plans ready for /gsd:execute-phase
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/verify-work.md
@~/.claude/get-shit-done/templates/UAT.md
</execution_context>

<context>
Phase: $ARGUMENTS (optional)
- If provided: Test specific phase (e.g., "P01-1" identifier or task list UUID)
- If not provided: Check for active sessions or prompt for phase

**Config file:** config.json (local file with Mosic entity IDs)
</context>

<process>

## Step 0: Load Configuration and Mosic Tools

```bash
# Load config.json
CONFIG=$(cat config.json 2>/dev/null || echo '{}')
WORKSPACE_ID=$(echo "$CONFIG" | jq -r '.mosic.workspace_id // empty')
PROJECT_ID=$(echo "$CONFIG" | jq -r '.mosic.project_id // empty')
```

Validate Mosic is configured:
```
IF WORKSPACE_ID is empty:
  ERROR: "No Mosic workspace configured. Run /gsd:new-project first."
  EXIT
```

Load Mosic tools:
```
ToolSearch("mosic task page entity create")
```

## Step 1: Resolve Phase from Mosic

### If $ARGUMENTS provided:

```
# Try to resolve phase identifier or UUID
IF $ARGUMENTS is UUID format:
  task_list = mosic_get_task_list($ARGUMENTS, { include_tasks: true })
ELSE:
  # Search by identifier (e.g., "P01-1")
  task_list = mosic_get_task_list($ARGUMENTS, {
    workspace_id: WORKSPACE_ID,
    include_tasks: true
  })

IF task_list not found:
  ERROR: "Phase not found: $ARGUMENTS"
  # List available phases
  project = mosic_get_project(PROJECT_ID, { include_task_lists: true })
  DISPLAY: "Available phases:" + project.task_lists
  EXIT
```

### If no $ARGUMENTS:

```
# Get project with task lists
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })

# Find phases ready for verification (status: In Review or tasks completed)
verifiable_phases = project.task_lists.filter(tl =>
  tl.status == "In Review" OR
  (tl.tasks && tl.tasks.filter(t => t.done).length > 0)
)

IF verifiable_phases.length == 0:
  ERROR: "No phases ready for verification. Complete some tasks first."
  EXIT

IF verifiable_phases.length == 1:
  task_list = verifiable_phases[0]
ELSE:
  DISPLAY: "Multiple phases available for verification:"
  FOR each phase in verifiable_phases:
    DISPLAY: "- " + phase.identifier + ": " + phase.title
  PROMPT: "Which phase to verify?"
  task_list = selected_phase
```

Store phase context:
```
PHASE_ID = task_list.name
PHASE_TITLE = task_list.title
PHASE_IDENTIFIER = task_list.identifier
```

## Step 2: Extract Testable Deliverables from Mosic

```
# Get all completed tasks in the phase
completed_tasks = task_list.tasks.filter(t => t.done == true)

IF completed_tasks.length == 0:
  ERROR: "No completed tasks in phase. Nothing to verify."
  EXIT

# Get summary pages linked to tasks
test_items = []

FOR each task in completed_tasks:
  # Get pages related to this task
  pages = mosic_get_entity_pages("MTask", task.name, { include_subtree: false })

  # Find summary pages
  summary_page = pages.find(p => p.title.includes("Summary"))

  IF summary_page:
    # Get page content in markdown format
    page_content = mosic_get_page(summary_page.name, { content_format: "markdown" })

    # Extract testable outcomes from summary
    testable_outcomes = extract_testable_items(page_content)

    FOR each outcome in testable_outcomes:
      test_items.push({
        task_id: task.name,
        task_title: task.title,
        test: outcome.description,
        expected: outcome.expected_behavior,
        source_page: summary_page.name
      })
  ELSE:
    # Use task description and checklist as test items
    test_items.push({
      task_id: task.name,
      task_title: task.title,
      test: task.title + " works as expected",
      expected: task.description,
      source_page: null
    })

DISPLAY: "Found " + test_items.length + " testable items from " + completed_tasks.length + " completed tasks"
```

## Step 3: Automated Code Review

Before manual testing, analyze the code changes across all completed tasks.

### 3a. Gather Phase Changes

```
# Collect commits for all completed tasks
all_commits = []

FOR each task in completed_tasks:
  task_commits = run_bash("git log --all --oneline --grep='" + task.identifier + "'")
  IF task_commits:
    all_commits.push(...task_commits)

# Deduplicate and sort commits
all_commits = deduplicate(all_commits)

# If no task-specific commits, fall back to branch diff
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

### 3b. Per-Task Requirements Traceability

```
task_traceability = []

FOR each task in completed_tasks:
  # Get task's plan page for requirements
  pages = mosic_get_entity_pages("MTask", task.name, { include_subtree: false })
  plan_page = pages.find(p => p.title.includes("Plan") or p.page_type == "Spec")

  task_requirements = []
  IF plan_page:
    plan_content = mosic_get_page(plan_page.name, { content_format: "markdown" }).content
    must_haves = extract_section(plan_content, "## Must-Haves")
    IF must_haves:
      task_requirements = extract_list_items(must_haves, "Observable Truths")

  # Fall back to task title/checklist if no plan
  IF task_requirements.length == 0:
    task_requirements = [task.title + " works as expected"]
    IF task.checklists:
      task_requirements.push(...task.checklists.map(c => c.title))

  # Map requirements to code
  FOR each req in task_requirements:
    evidence = search_changed_files(req, changed_files, full_diff)
    task_traceability.push({
      task_id: task.name,
      task_title: task.title,
      requirement: req,
      status: evidence.length > 0 ? "MET" : "NOT MET",
      evidence: evidence
    })

  # TDD compliance check per task
  task_tags = mosic_get_document_tags("MTask", task.name)
  is_tdd_task = task_tags.some(t => t.tag == "tdd")

  IF is_tdd_task:
    # Verify TDD commit pattern for this task
    task_commits = run_bash("git log --all --oneline --grep='" + task.identifier + "'")
    has_test_commit = task_commits.some(c => c.includes("test("))
    has_feat_commit = task_commits.some(c => c.includes("feat("))

    task_traceability.push({
      task_id: task.name,
      task_title: task.title,
      requirement: "TDD: test commit(s) before implementation commit(s)",
      status: has_test_commit ? "MET" : "NOT MET",
      evidence: has_test_commit ? "Found test() commits" : "No test() commits found"
    })

    # Check RED/GREEN/REFACTOR subtask completion
    subtasks = mosic_search_tasks({ parent_task: task.name })
    tdd_phases = subtasks.filter(s => s.title.match(/^(RED|GREEN|REFACTOR):/))
    incomplete_phases = tdd_phases.filter(s => !s.done)

    IF incomplete_phases.length > 0:
      task_traceability.push({
        task_id: task.name,
        task_title: task.title,
        requirement: "TDD phases complete: " + tdd_phases.map(p => p.title).join(", "),
        status: "NOT MET",
        evidence: "Incomplete: " + incomplete_phases.map(p => p.title).join(", ")
      })
```

### 3c. Code Quality Analysis

```
auto_findings = []

FOR each file in changed_files:
  # CORRECTNESS: logic errors, null handling, error paths, atomicity
  # SECURITY: injection, XSS, permission checks, credentials in code
  # OVER-ENGINEERING: YAGNI, single-use abstractions, trivial helpers
  # STUB DETECTION: TODO/FIXME, empty bodies, hardcoded values

  # Each finding: { severity: "Critical"|"Warning"|"Note", file, line, issue, fix, related_task }

# Add TDD compliance to code quality report
tdd_tasks = completed_tasks.filter(t => {
  tags = mosic_get_document_tags("MTask", t.name)
  return tags.some(tag => tag.tag == "tdd")
})

IF tdd_tasks.length > 0:
  auto_findings.push({
    severity: "Note",
    file: "n/a",
    line: "n/a",
    issue: "TDD Compliance: " + tdd_tasks.length + " TDD tasks in phase",
    fix: "Verify test-first commit ordering and RED/GREEN/REFACTOR phase completion",
    related_task: tdd_tasks.map(t => t.identifier).join(", ")
  })
```

### 3d. Present Phase Code Review

```
met = task_traceability.filter(t => t.status == "MET").length
total = task_traceability.length
critical = auto_findings.filter(f => f.severity == "Critical").length

verdict = "PASS"
IF critical > 0: verdict = "CRITICAL ISSUES"
ELIF auto_findings.length > 0: verdict = "NEEDS ATTENTION"
ELIF met < total: verdict = "GAPS FOUND"

Display:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CODE REVIEW: {PHASE_IDENTIFIER}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verdict: {verdict}
Files changed: {changed_files.length}
Commits: {all_commits.length}

### Requirements Traceability

| Task | Requirement | Status | Evidence |
|------|-------------|--------|----------|
{task_traceability.map(t =>
  "| " + t.task_title.substring(0,30) + " | " + t.requirement.substring(0,40) + " | " +
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
Proceeding to manual testing...
"""

# Enrich test_items with auto-review data
FOR each test_item in test_items:
  related_trace = task_traceability.filter(t => t.task_id == test_item.task_id)
  test_item.auto_traceability = related_trace
  related_findings = auto_findings.filter(f => f.related_task == test_item.task_id)
  test_item.auto_findings = related_findings

# Add Critical/Warning findings as additional test items
FOR each finding in auto_findings.filter(f => f.severity in ["Critical", "Warning"]):
  test_items.push({
    task_id: finding.related_task,
    task_title: "Code Review Finding",
    test: "[" + finding.severity + "] " + finding.issue,
    expected: finding.fix,
    source_page: null,
    auto_detected: true
  })
```

## Step 4: Create UAT Page in Mosic

```
# Create UAT page linked to phase
uat_page = mosic_create_entity_page("MTask List", PHASE_ID, {
  workspace_id: WORKSPACE_ID,
  title: "UAT Results - " + PHASE_IDENTIFIER + " - " + format_date(now),
  page_type: "Document",
  icon: "lucide:user-check",
  status: "Draft",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "User Acceptance Testing", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "Phase: " + PHASE_TITLE }
      },
      {
        type: "header",
        data: { text: "Test Cases", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "Testing " + test_items.length + " deliverables..." }
      }
    ]
  },
  relation_type: "Related"
})

UAT_PAGE_ID = uat_page.name

# Tag the UAT page
mosic_batch_add_tags_to_document("M Page", UAT_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.uat,
  config.mosic.tags.verification
])

DISPLAY: "Created UAT page: https://mosic.pro/app/page/" + UAT_PAGE_ID
```

## Step 5: Run Tests One at a Time

```
results = []
current_test = 0

FOR each test_item in test_items:
  current_test++

  # Show auto-review context if available
  auto_context = ""

  IF test_item.auto_traceability:
    unmet = test_item.auto_traceability.filter(t => t.status == "NOT MET")
    IF unmet.length > 0:
      auto_context += "\n  **Code Review:** Some requirements not traced to code:\n"
      FOR each u in unmet:
        auto_context += "    - " + u.requirement + "\n"

  IF test_item.auto_findings AND test_item.auto_findings.length > 0:
    auto_context += "\n  **Code Review Findings:**\n"
    FOR each f in test_item.auto_findings:
      auto_context += "    - [" + f.severity + "] " + f.issue + " (" + f.file + ":" + f.line + ")\n"

  IF test_item.auto_detected:
    auto_context += "\n  **AUTO-DETECTED** — Found by automated code review.\n"

  DISPLAY:
  """
  ───────────────────────────────────────────────────────────────
  Test {current_test}/{test_items.length}

  **Task:** {test_item.task_title}

  **Expected Behavior:**
  {test_item.expected}
  {auto_context}
  ───────────────────────────────────────────────────────────────

  Does this work as expected?
  (yes/y/next = pass, anything else describes the issue)
  """

  WAIT for user response

  IF response in ["yes", "y", "next", ""]:
    results.push({
      test: test_item,
      status: "passed",
      notes: null
    })
    DISPLAY: "✓ Passed"
  ELSE:
    # Infer severity from description
    severity = infer_severity(response)

    results.push({
      test: test_item,
      status: "failed",
      issue: response,
      severity: severity
    })
    DISPLAY: "✗ Issue logged (" + severity + ")"

  # Update UAT page every 5 tests or on failure
  IF current_test % 5 == 0 OR results[-1].status == "failed":
    update_uat_page(UAT_PAGE_ID, results)
```

## Step 6: Finalize UAT Results in Mosic

```
passed = results.filter(r => r.status == "passed").length
failed = results.filter(r => r.status == "failed").length
total = results.length

# Build final UAT content
uat_content = build_uat_content(results, {
  phase: PHASE_TITLE,
  passed: passed,
  failed: failed,
  total: total
})

# Update UAT page with final results
mosic_update_content_blocks(UAT_PAGE_ID, {
  blocks: uat_content.blocks,
  replace: true
})

# Update page status
mosic_update_document("M Page", UAT_PAGE_ID, {
  status: "Published"
})

# Update phase task list based on results
IF failed == 0:
  mosic_update_document("MTask List", PHASE_ID, {
    status: "Completed"
  })

  # Add success comment
  # IMPORTANT: Comments must use HTML format
  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MTask List",
    ref_name: PHASE_ID,
    content: "<p><strong>UAT Complete</strong></p><p>All " + total + " tests passed.</p><p>UAT Report: <a href=\"https://mosic.pro/app/page/" + UAT_PAGE_ID + "\">View</a></p>"
  })
ELSE:
  mosic_update_document("MTask List", PHASE_ID, {
    status: "In Review"
  })

  # Add issues comment
  # IMPORTANT: Comments must use HTML format
  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MTask List",
    ref_name: PHASE_ID,
    content: "<p><strong>UAT Found Issues</strong></p><p>" + failed + "/" + total + " tests failed.</p><p>Run <code>/gsd:execute-phase " + PHASE_IDENTIFIER + " --gaps-only</code> after fix plans are ready.</p><p>UAT Report: <a href=\"https://mosic.pro/app/page/" + UAT_PAGE_ID + "\">View</a></p>"
  })
```

## Step 7: Create Issue Tasks for Failed Tests

```
IF failed > 0:
  # Severity to priority mapping
  severity_to_priority = {
    "blocker": "Critical",
    "major": "High",
    "minor": "Normal",
    "cosmetic": "Low"
  }

  issue_tasks = []

  FOR each result in results.filter(r => r.status == "failed"):
    # Create MTask for the issue fix
    issue_task = mosic_create_document("MTask", {
      workspace_id: WORKSPACE_ID,
      task_list: PHASE_ID,
      title: "Fix: " + result.test.test.substring(0, 80),
      description: build_issue_description(result),
      icon: "lucide:bug",
      status: "Backlog",
      priority: severity_to_priority[result.severity]
    })

    # Tag as issue fix
    mosic_batch_add_tags_to_document("MTask", issue_task.name, [
      config.mosic.tags.gsd_managed,
      config.mosic.tags.fix
    ])

    # Create Blocker relation to original task
    IF result.test.task_id:
      mosic_create_document("M Relation", {
        workspace_id: WORKSPACE_ID,
        source_doctype: "MTask",
        source_name: issue_task.name,
        target_doctype: "MTask",
        target_name: result.test.task_id,
        relation_type: "Blocker"
      })

    # Create Related relation to UAT page
    mosic_create_document("M Relation", {
      workspace_id: WORKSPACE_ID,
      source_doctype: "M Page",
      source_name: UAT_PAGE_ID,
      target_doctype: "MTask",
      target_name: issue_task.name,
      relation_type: "Related"
    })

    issue_tasks.push(issue_task)

  DISPLAY: "Created " + issue_tasks.length + " fix tasks in Mosic"
```

## Step 8: Diagnose Issues and Create Fix Plans (if needed)

```
IF failed > 0:
  DISPLAY: "Spawning parallel debug agents to diagnose root causes..."

  # Spawn gsd-debugger for each unique issue
  FOR each issue_task in issue_tasks:
    Task(
      prompt="
        <objective>
        Diagnose root cause for UAT failure.

        **Issue:** " + issue_task.title + "
        **Description:** " + issue_task.description + "
        </objective>

        <context>
        Phase: " + PHASE_TITLE + "
        UAT Page: https://mosic.pro/app/page/" + UAT_PAGE_ID + "
        </context>

        <output>
        Update the issue task description with root cause analysis.
        Task ID: " + issue_task.name + "
        </output>
      ",
      subagent_type="gsd-debugger",
      model="{debugger_model}",
      description="Diagnose: " + issue_task.title
    )

  # Spawn gsd-planner in gaps mode
  DISPLAY: "Creating fix plans..."

  Task(
    prompt="
      <planning_context>
      **Mode:** gaps
      **Phase:** " + PHASE_ID + "
      **Issue Tasks:** " + issue_tasks.map(t => t.name).join(", ") + "
      </planning_context>

      <constraints>
      - Create fix plans for each issue task
      - Plans should be atomic and testable
      - Link plans to issue tasks via M Relation
      </constraints>
    ",
    subagent_type="gsd-planner",
    model="{planner_model}",
    description="Fix plans for UAT issues"
  )
```

## Step 9: Update config.json

```
# Update config with UAT page reference
config.mosic.pages["phase-" + PHASE_IDENTIFIER + "-uat"] = UAT_PAGE_ID
config.mosic.session.last_action = "verify-work"
config.mosic.session.last_updated = ISO_TIMESTAMP

write config.json
```

</process>

<anti_patterns>
- Don't use AskUserQuestion for test responses - plain text conversation
- Don't ask severity - infer from description
- Don't present full checklist upfront - one test at a time
- Don't run automated test suites - but DO run code review before manual testing
- Don't fix issues during testing - log as gaps, diagnose after all tests complete
- Don't create local markdown files - all documentation lives in Mosic
</anti_patterns>

<offer_next>
Output this markdown directly (not as a code block). Route based on UAT results:

| Status | Route |
|--------|-------|
| All tests pass + more phases | Route A (next phase) |
| All tests pass + last phase | Route B (milestone complete) |
| Issues found + fix plans ready | Route C (execute fixes) |
| Issues found + planning blocked | Route D (manual intervention) |

---

**Route A: All tests pass, more phases remain**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > PHASE {PHASE_IDENTIFIER} VERIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase:** {PHASE_TITLE}

{passed}/{total} tests passed
UAT complete

Mosic: https://mosic.pro/app/page/{UAT_PAGE_ID}

───────────────────────────────────────────────────────────────

## Next Up

**Next Phase:** {next_phase.title}

/gsd:discuss-phase {next_phase.identifier} - gather context and clarify approach

<sub>/clear first - fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**Route C: Issues found, fix plans ready**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > PHASE {PHASE_IDENTIFIER} ISSUES FOUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase:** {PHASE_TITLE}

{passed}/{total} tests passed
{failed} issues diagnosed
Fix plans verified

### Issues Found

{List issues with severity}

Mosic: https://mosic.pro/app/page/{UAT_PAGE_ID}

───────────────────────────────────────────────────────────────

## Next Up

**Execute fix plans** - run diagnosed fixes

/gsd:execute-phase {PHASE_IDENTIFIER} --gaps-only

<sub>/clear first - fresh context window</sub>

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] Phase resolved from Mosic (by identifier or UUID)
- [ ] Testable items extracted from completed tasks and summary pages
- [ ] Phase commits gathered across all completed tasks
- [ ] Per-task requirements traced to code changes (traceability table)
- [ ] Code quality analysis run (correctness, security, over-engineering, stubs)
- [ ] Auto-review findings presented before manual testing
- [ ] UAT page created in Mosic linked to phase
- [ ] Tests presented one at a time with auto-review context and expected behavior
- [ ] Plain text responses (no structured forms)
- [ ] Severity inferred, never asked
- [ ] UAT page updated with results
- [ ] If issues: fix tasks created with Blocker relations
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: gsd-planner creates fix plans
- [ ] Phase status updated in Mosic
- [ ] config.json updated with UAT page reference
- [ ] Ready for `/gsd:execute-phase` when complete
</success_criteria>
