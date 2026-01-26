<purpose>
Validate built features through conversational testing with persistent state in Mosic. Creates UAT page that tracks test progress, survives /clear, and feeds gaps into /gsd:plan-phase --gaps.

User tests, Claude records. One test at a time. Plain text responses.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (task lists, tasks, summary pages)
- UAT results stored in Mosic pages
- Issue tasks created in Mosic
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<philosophy>
**Show expected, ask if reality matches.**

Claude presents what SHOULD happen. User confirms or describes what's different.
- "yes" / "y" / "next" / empty → pass
- Anything else → logged as issue, severity inferred

No Pass/Fail buttons. No severity questions. Just: "Here's what should happen. Does it?"
</philosophy>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic:**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- task_lists (phase mappings)
- pages (page IDs)
- tags (tag IDs)
- model_profile (default: balanced)
```

```javascript
// Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

// Find the phase task list
phase_task_list = project.task_lists.find(tl =>
  tl.title.includes("Phase " + PHASE_ARG) ||
  tl.identifier.startsWith(PHASE_ARG + "-")
)

// Get phase with tasks
phase = mosic_get_task_list(phase_task_list.name, { include_tasks: true })

// Get phase pages
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name)
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-planner | opus | opus | sonnet |
| gsd-plan-checker | sonnet | sonnet | haiku |

</step>

<step name="check_active_session">
**Check for active UAT page:**

```javascript
uat_page = phase_pages.find(p => p.title.includes("UAT"))

if (uat_page && !PHASE_ARG) {
  // Active session exists, no specific phase requested
  uat_content = mosic_get_page(uat_page.name, { content_format: "markdown" })

  // Check if testing is complete
  if (uat_content.includes("status: complete")) {
    console.log("UAT already complete for this phase.")
    // Offer to restart or view results
  } else {
    // Resume testing
    go_to_resume_from_page()
  }
}
```

**If UAT page exists AND still testing:**
→ Resume from current test

**If no UAT page OR argument provided:**
→ Continue to extract_tests
</step>

<step name="extract_tests">
**Extract testable deliverables from task summaries:**

```javascript
tests = []

for (task of phase.tasks) {
  if (task.done) {
    // Get task summary page
    task_pages = mosic_get_entity_pages("MTask", task.name)
    summary_page = task_pages.find(p => p.title.includes("Summary"))

    if (summary_page) {
      summary = mosic_get_page(summary_page.name, { content_format: "markdown" })

      // Parse for testable deliverables
      deliverables = extract_deliverables(summary)

      for (deliverable of deliverables) {
        tests.push({
          name: deliverable.name,
          expected: deliverable.expected,
          source_task: task.identifier
        })
      }
    }
  }
}

console.log("Found " + tests.length + " testable deliverables")
```

Focus on USER-OBSERVABLE outcomes, not implementation details.

For each deliverable, create a test:
- name: Brief test name
- expected: What the user should see/experience (specific, observable)

Skip internal/non-observable items (refactors, type changes, etc.).
</step>

<step name="create_uat_page">
**Create UAT page in Mosic:**

```javascript
uat_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE_ARG + " UAT Results",
  page_type: "Document",
  icon: "lucide:clipboard-check",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + PHASE_ARG + " User Acceptance Testing", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Status:** testing\n**Started:** " + format_date(now) }
      },
      {
        type: "header",
        data: { text: "Current Test", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "**Test 1:** " + tests[0].name + "\n**Expected:** " + tests[0].expected }
      },
      {
        type: "header",
        data: { text: "Tests", level: 2 }
      },
      // Test list with pending status
      ...tests.map((t, i) => ({
        type: "paragraph",
        data: { text: "**" + (i+1) + ". " + t.name + "**\nExpected: " + t.expected + "\nResult: pending" }
      })),
      {
        type: "header",
        data: { text: "Summary", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "Total: " + tests.length + "\nPassed: 0\nIssues: 0\nPending: " + tests.length }
      },
      {
        type: "header",
        data: { text: "Gaps", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "[none yet]" }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the UAT page
mosic_batch_add_tags_to_document("M Page", uat_page.name, [
  tags.gsd_managed,
  tags.uat,
  tags["phase-" + PHASE_ARG]
])

// Store page ID
config.pages["phase-" + PHASE_ARG + "-uat"] = uat_page.name
```

Proceed to present_test.
</step>

<step name="present_test">
**Present current test to user:**

Display using checkpoint box format:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

──────────────────────────────────────────────────────────────
→ Type "pass" or describe what's wrong
──────────────────────────────────────────────────────────────
```

Wait for user response (plain text, no AskUserQuestion).
</step>

<step name="process_response">
**Process user response and update UAT page:**

**If response indicates pass:**
- Empty response, "yes", "y", "ok", "pass", "next", "approved"

Update test result to "pass"

**If response indicates skip:**
- "skip", "can't test", "n/a"

Update test result to "skipped"

**If response is anything else:**
- Treat as issue description

Infer severity from description:
- Contains: crash, error, exception, fails, broken → blocker
- Contains: doesn't work, wrong, missing, can't → major
- Contains: slow, weird, off, minor, small → minor
- Contains: color, font, spacing, alignment → cosmetic
- Default if unclear: major

Update test result to "issue" with reported text and severity

**Update UAT page in Mosic:**

```javascript
mosic_update_content_blocks(uat_page.name, {
  // Update current test section
  // Update test result
  // Update summary counts
  // Add to gaps if issue
})
```

If more tests remain → Update current test, go to present_test
If no more tests → Go to complete_session
</step>

<step name="resume_from_page">
**Resume testing from UAT page:**

```javascript
uat_content = mosic_get_page(uat_page.name, { content_format: "markdown" })

// Find first test with result: pending
current_test_num = find_first_pending_test(uat_content)
current_test = tests[current_test_num - 1]

// Calculate progress
passed = count_passed(uat_content)
issues = count_issues(uat_content)
total = tests.length
```

Announce:
```
Resuming: Phase ${PHASE_ARG} UAT
Progress: ${passed + issues}/${total}
Issues found so far: ${issues}

Continuing from Test ${current_test_num}...
```

Proceed to present_test.
</step>

<step name="complete_session">
**Complete testing and finalize UAT page:**

```javascript
// Update UAT page status
mosic_update_content_blocks(uat_page.name, {
  // Update status to "complete"
  // Clear current test section
  // Finalize summary
})

// Add completion comment
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "M Page",
  reference_name: uat_page.name,
  content: "<p><strong>UAT Complete</strong></p>" +
    "<ul>" +
    "<li>Passed: " + passed_count + "</li>" +
    "<li>Issues: " + issues_count + "</li>" +
    "<li>Skipped: " + skipped_count + "</li>" +
    "</ul>"
})
```

Continue to create_issue_tasks.
</step>

<step name="create_issue_tasks">
**Create issue tasks for each failed test:**

```javascript
if (issues_count > 0) {
  for (issue of issues_list) {
    // IMPORTANT: Task descriptions must use Editor.js format
    issue_task = mosic_create_document("MTask", {
      workspace_id: workspace_id,
      task_list: phase_task_list.name,
      title: "Fix: " + issue.truth.substring(0, 80),
      description: {
        blocks: [
          {
            type: "paragraph",
            data: { text: "**Failed UAT Test:** " + issue.test_num }
          },
          {
            type: "header",
            data: { text: "Expected", level: 2 }
          },
          {
            type: "paragraph",
            data: { text: issue.expected }
          },
          {
            type: "header",
            data: { text: "Reported", level: 2 }
          },
          {
            type: "paragraph",
            data: { text: issue.reported }
          },
          {
            type: "header",
            data: { text: "Severity", level: 2 }
          },
          {
            type: "paragraph",
            data: { text: issue.severity }
          }
        ]
      },
      icon: "lucide:alert-circle",
      status: "Blocked",  // Blocked until diagnosed
      priority: severity_to_priority(issue.severity)
    })

    // Tag the issue task
    mosic_batch_add_tags_to_document("MTask", issue_task.name, [
      tags.gsd_managed,
      tags.fix,
      tags["phase-" + PHASE_ARG]
    ])

    // Link issue task to UAT page
    mosic_create_document("M Relation", {
      workspace_id: workspace_id,
      source_doctype: "MTask",
      source_name: issue_task.name,
      target_doctype: "M Page",
      target_name: uat_page.name,
      relation_type: "Related"
    })

    // Store task ID
    config.tasks = config.tasks || {}
    config.tasks["phase-" + PHASE_ARG + "-fix-" + issue.test_num] = issue_task.name
  }
}
```

</step>

<step name="update_config">
**Update config.json:**

```javascript
config.last_sync = new Date().toISOString()

// Write config.json
```

```bash
git add config.json
git commit -m "test(phase-${PHASE_ARG}): complete UAT - ${passed_count} passed, ${issues_count} issues"
```

</step>

<step name="present_summary">
Present summary:

```
## UAT Complete: Phase ${PHASE_ARG}

| Result | Count |
|--------|-------|
| Passed | ${passed_count} |
| Issues | ${issues_count} |
| Skipped| ${skipped_count} |

Mosic: https://mosic.pro/app/page/[uat_page.name]
Issue tasks: ${issues_count} created

[If issues > 0:]
### Issues Found

${issues_list.map(i => "- **" + i.test_num + ":** " + i.truth.substring(0, 50) + "... (" + i.severity + ")").join("\n")}
```

**If issues > 0:** Proceed to diagnose_issues

**If issues == 0:**
```
All tests passed. Ready to continue.

- `/gsd:plan-phase ${next}` — Plan next phase
- `/gsd:execute-phase ${next}` — Execute next phase
```
</step>

<step name="diagnose_issues">
**Diagnose root causes before planning fixes:**

```
---

${issues_count} issues found. Diagnosing root causes...

Spawning parallel debug agents to investigate each issue.
```

- Load diagnose-issues workflow
- Follow @~/.claude/get-shit-done/workflows/diagnose-issues.md
- Spawn parallel debug agents for each issue
- Collect root causes
- Update issue tasks with root causes
- Proceed to plan_gap_closure

Diagnosis runs automatically - no user prompt. Parallel agents investigate simultaneously.
</step>

<step name="plan_gap_closure">
**Auto-plan fixes from diagnosed gaps:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner for gap closure...
```

Spawn gsd-planner in --gaps mode to create fix plans.

On return:
- **PLANNING COMPLETE:** Proceed to verify_gap_plans
- **PLANNING INCONCLUSIVE:** Report and offer manual intervention
</step>

<step name="verify_gap_plans">
**Verify fix plans with checker:**

Spawn gsd-plan-checker to verify fix plans.

On return:
- **VERIFICATION PASSED:** Proceed to present_ready
- **ISSUES FOUND:** Proceed to revision_loop
</step>

<step name="revision_loop">
**Iterate planner ↔ checker until plans pass (max 3):**

If iteration_count < 3: Send back to planner for revision
If iteration_count >= 3: Offer options (force proceed, provide guidance, abandon)
</step>

<step name="present_ready">
**Present completion and next steps:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase ${PHASE_ARG}: ${phase.title}** — ${issues_count} gap(s) diagnosed, fix tasks created

Mosic:
- UAT: https://mosic.pro/app/page/[uat_page.name]
- Fix tasks: ${issues_count} ready for execution

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute fixes** — run fix tasks

`/clear` then `/gsd:execute-phase ${PHASE_ARG} --gaps-only`

───────────────────────────────────────────────────────────────
```
</step>

</process>

<severity_inference>
**Infer severity from user's natural language:**

| User says | Infer |
|-----------|-------|
| "crashes", "error", "exception", "fails completely" | blocker |
| "doesn't work", "nothing happens", "wrong behavior" | major |
| "works but...", "slow", "weird", "minor issue" | minor |
| "color", "spacing", "alignment", "looks off" | cosmetic |

Default to **major** if unclear. User can correct if needed.

**Never ask "how severe is this?"** - just infer and move on.
</severity_inference>

<success_criteria>
- [ ] Mosic context loaded (phase task list, tasks, pages)
- [ ] UAT page created with all tests from task summaries
- [ ] Tests presented one at a time with expected behavior
- [ ] User responses processed as pass/issue/skip
- [ ] Severity inferred from description (never asked)
- [ ] UAT page updated after each response
- [ ] Issue tasks created for failed tests (status: Blocked)
- [ ] Issue tasks linked to UAT page
- [ ] config.json updated with page and task IDs
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: gsd-planner creates fix plans
- [ ] If issues: gsd-plan-checker verifies fix plans
- [ ] Ready for `/gsd:execute-phase --gaps-only` when complete
</success_criteria>
