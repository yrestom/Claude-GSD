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
@~/.claude/get-shit-done/workflows/code-review.md
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

# Load all task pages once — cached for Step 2 and Step 3a (avoids duplicate entity_pages calls)
task_pages_map = {}
FOR each task in completed_tasks:
  task_pages_map[task.name] = mosic_get_entity_pages("MTask", task.name, {
    include_subtree: false
  })

# Get summary pages linked to tasks
test_items = []

FOR each task in completed_tasks:
  # Get pages related to this task (from cache)
  pages = task_pages_map[task.name] or []

  # Find summary pages
  summary_page = pages.find(p => p.title.includes("Summary"))

  IF summary_page:
    # Get page content in markdown format
    page_content = mosic_get_page(summary_page.name, { content_format: "plain" })

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

Before manual testing, build verification criteria and run automated code review.

### 3a. Build Phase Verification Criteria

```
phase_verification_criteria = []

FOR each task in completed_tasks:
  # Get task's plan page for requirements (from cache loaded in Step 2)
  pages = task_pages_map[task.name] or []
  plan_page = pages.find(p => p.title.includes("Plan") or p.page_type == "Spec")

  task_requirements = []
  IF plan_page:
    plan_content = mosic_get_page(plan_page.name, { content_format: "plain" }).content
    must_haves = extract_section(plan_content, "## Must-Haves")
    IF must_haves:
      truths = extract_list_items(must_haves, "Observable Truths")
      FOR each truth in truths:
        task_requirements.push({ source: "plan", criterion: truth, type: "observable_truth" })

  # Fall back to task title/checklist if no plan
  IF task_requirements.length == 0:
    task_requirements.push({ source: "task", criterion: task.title + " works as expected", type: "general" })
    IF task.checklists:
      FOR each cl in task.checklists:
        task_requirements.push({ source: "checklist", criterion: cl.title, type: "acceptance_criterion", done: cl.done })

  phase_verification_criteria.push(...task_requirements)
```

### 3b-3d. Code Review (Shared Workflow)

Follow `@~/.claude/get-shit-done/workflows/code-review.md` with these scope parameters:

```xml
<review_scope>
  <entity_type>phase</entity_type>
  <entity_identifier>{PHASE_IDENTIFIER}</entity_identifier>
  <completed_tasks>{completed_tasks}</completed_tasks>
  <verification_criteria>{phase_verification_criteria}</verification_criteria>
  <requirements_content>{requirements_content if available}</requirements_content>
</review_scope>
```

The shared workflow handles:
1. **Commit Identification** — gather commits across completed tasks, build consolidated diff
2. **Requirements Traceability** — map criteria to code changes, TDD compliance
3. **Code Quality Analysis** — correctness, security, over-engineering, stubs
4. **Present Review** — verdict, traceability table, findings

Output variables: `traceability[]`, `auto_findings[]`, `changed_files[]`, `all_commits[]`, `verdict`

### 3e. Enrich Test Items with Review Data

```
# Augment test_items with auto-review findings
FOR each test_item in test_items:
  related_trace = traceability.filter(t => t.criterion.task_id == test_item.task_id)
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
    workspace: WORKSPACE_ID,
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
    workspace: WORKSPACE_ID,
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

  failed_results = results.filter(r => r.status == "failed")

  # Batch create all issue tasks in one call
  created_batch = mosic_batch_create_documents("MTask",
    failed_results.map(result => ({
      workspace: WORKSPACE_ID,
      task_list: PHASE_ID,
      title: "Fix: " + result.test.test.substring(0, 80),
      description: build_issue_description(result),
      icon: "lucide:bug",
      status: "Backlog",
      priority: severity_to_priority[result.severity]
    }))
  )
  issue_tasks = created_batch.results

  # Tag and link each created task
  FOR each (result, issue_task) in zip(failed_results, issue_tasks):
    # Tag as issue fix
    mosic_batch_add_tags_to_document("MTask", issue_task.name, [
      config.mosic.tags.gsd_managed,
      config.mosic.tags.fix
    ])

    # Create Blocker relation to original task
    IF result.test.task_id:
      mosic_create_document("M Relation", {
        workspace: WORKSPACE_ID,
        source_doctype: "MTask",
        source_name: issue_task.name,
        target_doctype: "MTask",
        target_name: result.test.task_id,
        relation_type: "Blocker"
      })

    # Create Related relation to UAT page
    mosic_create_document("M Relation", {
      workspace: WORKSPACE_ID,
      source_doctype: "M Page",
      source_name: UAT_PAGE_ID,
      target_doctype: "MTask",
      target_name: issue_task.name,
      relation_type: "Related"
    })

  DISPLAY: "Created " + issue_tasks.length + " fix tasks in Mosic"
```

## Step 8: Diagnose Issues and Create Fix Plans (if needed)

```
IF failed > 0:
  DISPLAY: "Spawning parallel debug agents to diagnose root causes..."

  # Collect all debug prompts first
  debug_prompts = []
  FOR each issue_task in issue_tasks:
    debug_prompts.push({
      prompt: "First, read ./.claude/agents/gsd-debugger.md for your complete role definition and instructions.\n\n" +
        "<objective>\n" +
        "Diagnose root cause for UAT failure.\n" +
        "Load the issue task from Mosic by ID to get full context.\n" +
        "</objective>\n\n" +
        "<context>\n" +
        "Phase: " + PHASE_TITLE + "\n" +
        "UAT Page: https://mosic.pro/app/page/" + UAT_PAGE_ID + "\n" +
        "</context>\n\n" +
        "<output>\n" +
        "Update the issue task description with root cause analysis.\n" +
        "Task ID: " + issue_task.name + "\n" +
        "</output>",
      description: "Diagnose: " + issue_task.title
    })

  # Spawn ALL debug agents in parallel (single response with multiple Task calls)
  # All Task() calls must be in ONE response for true parallelism
  FOR each dp in debug_prompts (ALL IN SINGLE RESPONSE):
    Task(
      prompt=dp.prompt,
      subagent_type="general-purpose",
      model="{debugger_model}",
      description=dp.description
    )

  # After all debug agents complete, spawn planner for fix plans
  DISPLAY: "Creating fix plans..."

  Task(
    prompt="First, read ./.claude/agents/gsd-planner.md for your complete role instructions.\n\n" +
      "<planning_context>\n" +
      "**Mode:** gaps\n" +
      "**Phase:** " + PHASE_ID + "\n" +
      "**Issue Tasks:** " + issue_tasks.map(t => t.name).join(", ") + "\n" +
      "</planning_context>\n\n" +
      "<constraints>\n" +
      "- Create fix plans for each issue task\n" +
      "- Plans should be atomic and testable\n" +
      "- Link plans to issue tasks via M Relation\n" +
      "</constraints>",
    subagent_type="general-purpose",
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
