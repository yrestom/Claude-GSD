---
name: gsd:verify-task
description: Verify a completed task achieved its goal through user acceptance testing
argument-hint: "[task-identifier]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Verify that a completed task achieved its goal through user acceptance testing (UAT).

**Mirrors:** `/gsd:verify-work` but for single task scope

**How it works:**
1. Load completed task and its summary
2. Extract acceptance criteria from plan/checklist
3. Guide user through verification steps
4. Document results as UAT M Page
5. Create fix subtasks if issues found

**Output:** UAT M Page linked to task, optional fix subtasks
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/templates/UAT.md
@~/.claude/get-shit-done/references/verification-patterns.md
</execution_context>

<context>
Task identifier: $ARGUMENTS (e.g., "AUTH-5" or task UUID)
</context>

<process>

## 1. Load Config and Validate

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
model_profile = config.model_profile or "balanced"
```

## 2. Load Task from Mosic

```
# Extract task identifier
task_identifier = extract_identifier($ARGUMENTS)

# Load task
IF task_identifier:
  task = mosic_get_task(task_identifier, {
    workspace_id: workspace_id,
    description_format: "markdown",
    include_checklists: true
  })
ELSE:
  # Use active task from config or last completed
  task_id = config.mosic.session?.active_task
  IF not task_id:
    # Find most recently completed task
    recent_tasks = mosic_search_tasks({
      workspace_id: workspace_id,
      project_id: project_id,
      filters: { done: true },
      order_by: "completed_date desc",
      limit: 1
    })
    IF recent_tasks.results.length == 0:
      ERROR: "No completed tasks found. Complete a task first."
    task = recent_tasks.results[0]
  ELSE:
    task = mosic_get_task(task_id, {
      description_format: "markdown",
      include_checklists: true
    })

TASK_ID = task.name
TASK_IDENTIFIER = task.identifier
TASK_TITLE = task.title
```

Display:
```
-------------------------------------------
 GSD > VERIFYING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
Status: {task.status}
```

## 3. Load Task Artifacts

```
# Get task pages
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

# Find key pages
plan_page = task_pages.find(p => p.title.includes("Plan") or p.page_type == "Spec")
summary_page = task_pages.find(p => p.title.includes("Summary"))
existing_uat_page = task_pages.find(p => p.title.includes("UAT") or p.title.includes("Verification"))

# Load plan content for acceptance criteria
plan_content = ""
IF plan_page:
  plan_content = mosic_get_page(plan_page.name, {
    content_format: "markdown"
  }).content

# Load summary content
summary_content = ""
IF summary_page:
  summary_content = mosic_get_page(summary_page.name, {
    content_format: "markdown"
  }).content

# Get subtasks
subtasks = mosic_search_tasks({
  workspace_id: workspace_id,
  filters: { parent_task: TASK_ID }
})

# Get checklists
checklists = task.checklists or []
```

Display:
```
Artifacts found:
- Plan page: {plan_page ? "Yes" : "No"}
- Summary page: {summary_page ? "Yes" : "No"}
- Subtasks: {subtasks.results.length}
- Checklist items: {checklists.length}
- Previous UAT: {existing_uat_page ? "Yes" : "No"}
```

## 4. Load Context Page Decisions

```
# Load task context page (from discuss-task)
task_context_page = task_pages.find(p => p.title.includes("Context") or p.title.includes("Decisions"))

task_context_content = ""
locked_decisions = []
deferred_ideas = []

IF task_context_page:
  task_context_content = mosic_get_page(task_context_page.name, {
    content_format: "markdown"
  }).content

  # Extract locked decisions
  locked_decisions = extract_list_items(task_context_content, "Decisions")
  deferred_ideas = extract_list_items(task_context_content, "Deferred Ideas")

# Load phase pages for inherited context
phase_id = task.task_list
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

# Also check phase context for inherited locked decisions
phase_context_page = phase_pages.find(p => p.title.includes("Context"))
IF phase_context_page:
  phase_context_content = mosic_get_page(phase_context_page.name, {
    content_format: "markdown"
  }).content
  phase_locked = extract_list_items(phase_context_content, "Implementation Decisions")
  locked_decisions = locked_decisions.concat(phase_locked)
```

Display:
```
Context fidelity check:
- Locked decisions: {locked_decisions.length}
- Deferred ideas: {deferred_ideas.length}
```

## 5. Extract Verification Criteria

```
verification_criteria = []

# From locked decisions (context fidelity - highest priority)
FOR each decision in locked_decisions:
  verification_criteria.push({
    source: "locked_decision",
    criterion: decision,
    type: "context_fidelity"
  })

# From plan page - extract must-haves
IF plan_content:
  must_haves = extract_section(plan_content, "## Must-Haves")
  IF must_haves:
    truths = extract_list_items(must_haves, "Observable Truths")
    FOR each truth in truths:
      verification_criteria.push({
        source: "plan",
        criterion: truth,
        type: "observable_truth"
      })

# From checklists
FOR each checklist in checklists:
  verification_criteria.push({
    source: "checklist",
    criterion: checklist.title,
    type: "acceptance_criterion",
    done: checklist.done
  })

# From subtask names/descriptions
FOR each subtask in subtasks.results:
  verification_criteria.push({
    source: "subtask",
    criterion: subtask.identifier + ": " + subtask.title,
    type: "subtask_completion",
    done: subtask.done
  })

IF verification_criteria.length == 0:
  # Generate basic criteria from task title
  verification_criteria.push({
    source: "generated",
    criterion: "Task objective achieved: " + TASK_TITLE,
    type: "general"
  })
```

Display:
```
Verification Criteria ({verification_criteria.length}):

{verification_criteria.map((c, i) =>
  (i+1) + ". [" + c.source + "] " + c.criterion
).join("\n")}
```

## 6. Guide User Through Verification

```
Display:
"""
-------------------------------------------
 UAT: {TASK_IDENTIFIER}
-------------------------------------------

I'll guide you through verifying each criterion.
For each, you'll confirm if it passes or note issues.
"""

verification_results = []

FOR each criterion in verification_criteria:
  Display:
  """
  ---
  Criterion {index + 1}/{total}: {criterion.type}

  {criterion.criterion}
  ---
  """

  # Suggest verification steps based on criterion type
  IF criterion.type == "context_fidelity":
    Display: "**LOCKED DECISION** - This was explicitly decided by the user during discussion. It MUST be implemented as specified."

  ELIF criterion.type == "observable_truth":
    Display: "This should be observable in the running application."

  ELIF criterion.type == "acceptance_criterion":
    Display: "This was an acceptance criterion from planning."

  ELIF criterion.type == "subtask_completion":
    IF criterion.done:
      Display: "Subtask was marked complete. Verify the implementation."
    ELSE:
      Display: "WARNING: Subtask not marked complete."

  AskUserQuestion({
    questions: [{
      question: "Does this criterion pass?",
      header: "Verify",
      options: [
        { label: "Pass", description: "Criterion met, working as expected" },
        { label: "Fail", description: "Criterion not met or has issues" },
        { label: "Skip", description: "Cannot verify right now" },
        { label: "Partial", description: "Partially working, needs refinement" }
      ],
      multiSelect: false
    }]
  })

  result = {
    criterion: criterion,
    status: user_selection,
    notes: ""
  }

  IF user_selection in ["Fail", "Partial"]:
    AskUserQuestion({
      questions: [{
        question: "What's the issue?",
        header: "Issue",
        options: [
          { label: "Describe issue", description: "I'll explain what's wrong" }
        ],
        multiSelect: false
      }]
    })
    result.notes = user_response  # From "Other" option

  verification_results.push(result)
```

## 7. Summarize Results

```
passed = verification_results.filter(r => r.status == "Pass")
failed = verification_results.filter(r => r.status == "Fail")
partial = verification_results.filter(r => r.status == "Partial")
skipped = verification_results.filter(r => r.status == "Skip")

overall_status = "passed"
IF failed.length > 0:
  overall_status = "failed"
ELIF partial.length > 0:
  overall_status = "partial"
ELIF skipped.length > verification_results.length / 2:
  overall_status = "incomplete"

Display:
"""
-------------------------------------------
 UAT SUMMARY: {TASK_IDENTIFIER}
-------------------------------------------

Status: {overall_status.toUpperCase()}

Results:
- Passed: {passed.length}/{verification_results.length}
- Failed: {failed.length}
- Partial: {partial.length}
- Skipped: {skipped.length}

{IF failed.length > 0 or partial.length > 0:}
### Issues Found

{failed.concat(partial).map(r =>
  "- [" + r.status + "] " + r.criterion.criterion + "\n  " + r.notes
).join("\n\n")}
{ENDIF}
"""
```

## 8. Create UAT Page in Mosic

```
# Build UAT content
uat_content = """
# """ + TASK_IDENTIFIER + """ UAT Results

**Task:** """ + TASK_TITLE + """
**Verified:** """ + new Date().toISOString() + """
**Overall Status:** """ + overall_status + """

## Summary

- **Passed:** """ + passed.length + """/""" + verification_results.length + """
- **Failed:** """ + failed.length + """
- **Partial:** """ + partial.length + """
- **Skipped:** """ + skipped.length + """

## Verification Details

""" + verification_results.map((r, i) => """
### Criterion """ + (i+1) + """: """ + r.status.toUpperCase() + """

**""" + r.criterion.type + """** (from """ + r.criterion.source + """)

> """ + r.criterion.criterion + """

""" + (r.notes ? "**Notes:** " + r.notes : "") + """
""").join("\n") + """

## Issues Requiring Action

""" + (failed.length + partial.length > 0 ?
  failed.concat(partial).map(r =>
    "- [ ] " + r.criterion.criterion + ": " + r.notes
  ).join("\n")
  : "_No issues found._") + """
"""

IF existing_uat_page:
  # Update existing UAT page
  mosic_update_document("M Page", existing_uat_page.name, {
    content: convert_to_editorjs(uat_content),
    status: "Published"
  })
  UAT_PAGE_ID = existing_uat_page.name
ELSE:
  # Create new UAT page
  uat_page = mosic_create_entity_page("MTask", TASK_ID, {
    workspace_id: workspace_id,
    title: TASK_IDENTIFIER + " UAT Results",
    page_type: "Document",
    icon: "lucide:user-check",
    status: "Published",
    content: convert_to_editorjs(uat_content),
    relation_type: "Related"
  })
  UAT_PAGE_ID = uat_page.name

# Tag UAT page
mosic_batch_add_tags_to_document("M Page", UAT_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.uat
])

Display: "UAT page: https://mosic.pro/app/page/" + UAT_PAGE_ID
```

## 9. Create Fix Subtasks (if issues found)

```
IF failed.length > 0 or partial.length > 0:
  AskUserQuestion({
    questions: [{
      question: "Create fix subtasks for the issues found?",
      header: "Fix Tasks",
      options: [
        { label: "Yes, create fixes", description: "Add subtasks to address issues" },
        { label: "No, I'll handle it", description: "Skip creating fix tasks" }
      ],
      multiSelect: false
    }]
  })

  IF user_selection == "Yes, create fixes":
    fix_tasks_created = []

    FOR each issue in failed.concat(partial):
      # Create fix subtask
      fix_task = mosic_create_document("MTask", {
        workspace: workspace_id,
        task_list: task.task_list,
        parent_task: TASK_ID,
        title: "Fix: " + issue.criterion.criterion.substring(0, 60),
        description: {
          blocks: [
            {
              type: "paragraph",
              data: { text: "**Issue:** " + issue.notes }
            },
            {
              type: "paragraph",
              data: { text: "**Original Criterion:** " + issue.criterion.criterion }
            },
            {
              type: "paragraph",
              data: { text: "**From UAT:** " + TASK_IDENTIFIER }
            }
          ]
        },
        icon: "lucide:wrench",
        status: "ToDo",
        priority: issue.status == "Fail" ? "High" : "Normal"
      })

      # Tag fix task
      mosic_batch_add_tags_to_document("MTask", fix_task.name, [
        config.mosic.tags.gsd_managed,
        config.mosic.tags.fix
      ])

      fix_tasks_created.push(fix_task)

    # Re-open parent task if it was complete
    IF task.done:
      mosic_update_document("MTask", TASK_ID, {
        done: false,
        status: "In Progress"
      })

    Display:
    """
    Created {fix_tasks_created.length} fix subtask(s):

    {fix_tasks_created.map(t => "- " + t.identifier + ": " + t.title).join("\n")}
    """
```

## 10. Update Config

```
config.mosic.pages["task-" + TASK_IDENTIFIER + "-uat"] = UAT_PAGE_ID
config.mosic.session.last_action = "verify-task"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

## 11. Present Results and Next Steps

```
IF overall_status == "passed":
  Display:
  """
  -------------------------------------------
   GSD > TASK VERIFIED
  -------------------------------------------

  **{TASK_IDENTIFIER}:** {TASK_TITLE}

  All {verification_results.length} criteria passed!

  UAT: https://mosic.pro/app/page/{UAT_PAGE_ID}

  ---

  ## Next Up

  Continue with phase execution or work on next task.

  `/gsd:execute-phase` - continue phase
  `/gsd:task` - add another task
  `/gsd:progress` - check overall status

  ---
  """

ELIF overall_status in ["failed", "partial"]:
  Display:
  """
  -------------------------------------------
   GSD > ISSUES FOUND
  -------------------------------------------

  **{TASK_IDENTIFIER}:** {TASK_TITLE}

  {passed.length}/{verification_results.length} criteria passed
  {failed.length + partial.length} issues to address

  UAT: https://mosic.pro/app/page/{UAT_PAGE_ID}

  ---

  ## Next Up

  {IF fix_tasks_created.length > 0:}
  Fix subtasks created. Execute them:

  `/gsd:execute-task {TASK_IDENTIFIER}`

  {ELSE:}
  Address the issues and re-verify:

  `/gsd:verify-task {TASK_IDENTIFIER}`
  {ENDIF}

  ---
  """

ELSE:
  Display:
  """
  -------------------------------------------
   GSD > VERIFICATION INCOMPLETE
  -------------------------------------------

  **{TASK_IDENTIFIER}:** {TASK_TITLE}

  Too many criteria skipped to determine status.

  UAT: https://mosic.pro/app/page/{UAT_PAGE_ID}

  Complete verification when ready:

  `/gsd:verify-task {TASK_IDENTIFIER}`

  ---
  """
```

</process>

<success_criteria>
- [ ] Task loaded from Mosic
- [ ] Context page loaded and locked decisions extracted (context fidelity)
- [ ] Plan, summary, subtasks, checklists loaded
- [ ] Verification criteria extracted from all sources (including locked decisions)
- [ ] User guided through each criterion
- [ ] Results captured with notes for failures
- [ ] UAT page created/updated in Mosic
- [ ] Fix subtasks created if issues found
- [ ] Parent task re-opened if issues found
- [ ] config.json updated with UAT page ID
- [ ] User knows next steps based on results
</success_criteria>
