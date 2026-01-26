---
name: gsd:verify-work
description: Validate built features through conversational UAT
argument-hint: "[phase number, e.g., '4']"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - Task
---

<objective>
Validate built features through conversational testing with persistent state.

Purpose: Confirm what Claude built actually works from user's perspective. One test at a time, plain text responses, no interrogation. When issues are found, automatically diagnose, plan fixes, and prepare for execution.

Output: {phase}-UAT.md tracking all test results. If issues found: diagnosed gaps, verified fix plans ready for /gsd:execute-phase
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/verify-work.md
@~/.claude/get-shit-done/templates/UAT.md
</execution_context>

<context>
Phase: $ARGUMENTS (optional)
- If provided: Test specific phase (e.g., "4")
- If not provided: Check for active sessions or prompt for phase

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
1. Check for active UAT sessions (resume or start new)
2. Find SUMMARY.md files for the phase
3. Extract testable deliverables (user-observable outcomes)
4. Create {phase}-UAT.md with test list
5. Present tests one at a time:
   - Show expected behavior
   - Wait for plain text response
   - "yes/y/next" = pass, anything else = issue (severity inferred)
6. Update UAT.md after each response
7. On completion: commit, present summary
8. If issues found:
   - Spawn parallel debug agents to diagnose root causes
   - Spawn gsd-planner in --gaps mode to create fix plans
   - Spawn gsd-plan-checker to verify fix plans
   - Iterate planner ↔ checker until plans pass (max 3)
   - Present ready status with `/clear` then `/gsd:execute-phase`
9. Sync verification to Mosic (see sync_verification step)
</process>

<sync_verification>
**Sync verification results to Mosic (Deep Integration):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Load Mosic config:
```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE}\"]")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
UAT_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.uat")
FIX_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.fix")
VERIFICATION_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.verification")
PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PHASE}\"]")
```

### Step 1: Create UAT Page (type: Document) Linked to Phase

```
# Parse UAT results for structured content
uat_summary = parse_uat_md(UAT.md)

# Create UAT page with proper type
uat_page = mosic_create_entity_page("MTask List", task_list_id, {
  workspace_id: workspace_id,
  title: "UAT Results - " + format_date(now),
  page_type: "Document",  # UAT results are documentation
  icon: mosic.page_icons.uat,  # "lucide:user-check"
  status: "Published",
  content: convert_uat_to_editorjs(UAT.md),
  relation_type: "Related"
})

# Tag with appropriate tags
mosic_batch_add_tags_to_document("M Page", uat_page.name, [
  GSD_MANAGED_TAG,
  UAT_TAG,
  PHASE_TAG
])

# Store page ID
mosic.pages["phase-" + PHASE + "-uat"] = uat_page.name
```

### Step 2: Create Issue Tasks with Blocker Relations

```
# Severity to priority mapping
severity_to_priority = {
  "blocker": "Critical",
  "major": "High",
  "minor": "Normal",
  "cosmetic": "Low"
}

FOR each issue in UAT.md.gaps:
  # Find the original task that produced this issue
  original_task_id = find_source_task(issue, SUMMARY.md files)

  # Create MTask for the issue fix
  issue_task = mosic_create_document("MTask", {
    workspace_id: workspace_id,
    task_list: task_list_id,
    title: "Fix: " + issue.truth.substring(0, 80),
    description: build_issue_description(issue),
    icon: "lucide:bug",
    status: "Blocked",
    priority: severity_to_priority[issue.severity]
  })

  # Create checklist items for fix verification
  mosic_create_document("MTask CheckList", {
    workspace_id: workspace_id,
    task: issue_task.name,
    title: "Verify: " + issue.truth,
    done: false
  })

  # Tag as issue fix
  mosic_batch_add_tags_to_document("MTask", issue_task.name, [
    GSD_MANAGED_TAG,
    FIX_TAG,
    PHASE_TAG
  ])

  # Create Blocker relation to original task (issue blocks completion)
  IF original_task_id:
    mosic_create_document("M Relation", {
      workspace_id: workspace_id,
      source_doctype: "MTask",
      source_name: issue_task.name,
      target_doctype: "MTask",
      target_name: original_task_id,
      relation_type: "Blocker"
    })

  # Create Related relation to UAT page
  mosic_create_document("M Relation", {
    workspace_id: workspace_id,
    source_doctype: "M Page",
    source_name: uat_page.name,
    target_doctype: "MTask",
    target_name: issue_task.name,
    relation_type: "Related"
  })

  # Store issue task ID
  mosic.tasks["phase-" + PHASE + "-fix-" + issue.test] = issue_task.name
```

### Step 3: Update Phase Task List Status and Description

```
# Build status summary
issue_count = UAT.md.summary.issues
passed_count = UAT.md.summary.passed
total_count = UAT.md.summary.total

IF issue_count == 0:
  # All tests passed - update description with success indicator
  verification_status = "✅ UAT Verified (" + passed_count + "/" + total_count + " tests passed)"

  mosic_update_document("MTask List", task_list_id, {
    description: original_description + "\n\n---\n" + verification_status,
    status: "Completed"
  })

  # Add success comment
  mosic_create_document("M Comment", {
    workspace_id: workspace_id,
    ref_doc: "MTask List",
    ref_name: task_list_id,
    content: "✅ UAT Complete\n\nAll " + total_count + " tests passed."
  })

ELSE:
  # Issues found - update description with warning
  verification_status = "⚠️ UAT Issues Found\n\n" +
    "- Passed: " + passed_count + "/" + total_count + "\n" +
    "- Issues: " + issue_count + " (see linked fix tasks)"

  mosic_update_document("MTask List", task_list_id, {
    description: original_description + "\n\n---\n" + verification_status,
    status: "In Review"
  })

  # Add issues comment
  mosic_create_document("M Comment", {
    workspace_id: workspace_id,
    ref_doc: "MTask List",
    ref_name: task_list_id,
    content: "⚠️ UAT Found Issues\n\n" +
      issue_count + " issues require fixes before phase completion.\n\n" +
      "Run `/gsd:execute-phase " + PHASE + " --gaps-only` after fix plans are ready."
  })
```

### Step 4: Link Fix Plans to Issue Tasks (After Planning)

```
# After gsd-planner creates fix plans, link them to issue tasks
FOR each fix_plan in new_plans:
  IF fix_plan.gap_closure == true:
    # Find the issue task this plan addresses
    related_issue = find_issue_for_plan(fix_plan, issues)

    IF related_issue:
      issue_task_id = mosic.tasks["phase-" + PHASE + "-fix-" + related_issue.test]

      # Create Depends relation (fix plan depends on issue being understood)
      mosic_create_document("M Relation", {
        workspace_id: workspace_id,
        source_doctype: "MTask",
        source_name: fix_plan.mosic_task_id,
        target_doctype: "MTask",
        target_name: issue_task_id,
        relation_type: "Related"
      })
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic verification sync failed: [error]"
  - Add failed items to mosic.pending_sync array
  - Continue (don't block verification flow)
```
</sync_verification>

<anti_patterns>
- Don't use AskUserQuestion for test responses — plain text conversation
- Don't ask severity — infer from description
- Don't present full checklist upfront — one test at a time
- Don't run automated tests — this is manual user validation
- Don't fix issues during testing — log as gaps, diagnose after all tests complete
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
 GSD ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**

{N}/{N} tests passed
UAT complete ✓

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

/gsd:discuss-phase {Z+1} — gather context and clarify approach

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /gsd:plan-phase {Z+1} — skip discussion, plan directly
- /gsd:execute-phase {Z+1} — skip to execution (if already planned)

───────────────────────────────────────────────────────────────

---

**Route B: All tests pass, milestone complete**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {Z} VERIFIED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**

{N}/{N} tests passed
Final phase verified ✓

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Audit milestone** — verify requirements, cross-phase integration, E2E flows

/gsd:audit-milestone

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /gsd:complete-milestone — skip audit, archive directly

───────────────────────────────────────────────────────────────

---

**Route C: Issues found, fix plans ready**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {Z} ISSUES FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**

{N}/{M} tests passed
{X} issues diagnosed
Fix plans verified ✓

### Issues Found

{List issues with severity from UAT.md}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute fix plans** — run diagnosed fixes

/gsd:execute-phase {Z} --gaps-only

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase_dir}/*-PLAN.md — review fix plans
- /gsd:plan-phase {Z} --gaps — regenerate fix plans

───────────────────────────────────────────────────────────────

---

**Route D: Issues found, planning blocked**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {Z} BLOCKED ✗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {Z}: {Name}**

{N}/{M} tests passed
Fix planning blocked after {X} iterations

### Unresolved Issues

{List blocking issues from planner/checker output}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Manual intervention required**

Review the issues above and either:
1. Provide guidance for fix planning
2. Manually address blockers
3. Accept current state and continue

───────────────────────────────────────────────────────────────

**Options:**
- /gsd:plan-phase {Z} --gaps — retry fix planning with guidance
- /gsd:discuss-phase {Z} — gather more context before replanning

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] UAT.md created with tests from SUMMARY.md
- [ ] Tests presented one at a time with expected behavior
- [ ] Plain text responses (no structured forms)
- [ ] Severity inferred, never asked
- [ ] Batched writes: on issue, every 5 passes, or completion
- [ ] Committed on completion
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: gsd-planner creates fix plans from diagnosed gaps
- [ ] If issues: gsd-plan-checker verifies fix plans (max 3 iterations)
- [ ] Mosic sync (if enabled):
  - [ ] UAT page created linked to phase task list
  - [ ] Issue tasks created with Blocker relations
  - [ ] Phase task list status updated
- [ ] Ready for `/gsd:execute-phase` when complete
</success_criteria>
