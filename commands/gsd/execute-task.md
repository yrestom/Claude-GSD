---
name: gsd:execute-task
description: Execute a task's plan with subtask commits and summary creation
argument-hint: "[task-identifier]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<critical_requirements>
**LOAD MOSIC TOOLS FIRST:**
Before using ANY Mosic MCP tool, you MUST call:
```
ToolSearch("mosic task page entity create document complete update comment relation batch")
```

**SUBTASK EXECUTION:**
- Subtasks (1-5) share context and are executed by a single agent
- This is by design: subtasks are small (15-60 min each) and cohesive
- If many independent subtasks exist, consider splitting into separate tasks at planning stage
</critical_requirements>

<objective>
Execute a planned task by implementing all subtasks with atomic commits.

**Key differences from execute-phase:**
- Executes subtasks of a single parent task (not plan tasks)
- Creates single Summary Page linked to parent task
- Marks parent task and subtasks complete
- Returns to phase execution context after completion

**Spawns:** gsd-executor for implementation work
**Output:** Summary Page + completed task with commit history
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Task identifier: $ARGUMENTS (e.g., "AUTH-5" or task UUID)
</context>

<process>

## 0. Load Mosic Tools and Config

**CRITICAL FIRST STEP - Load Mosic MCP tools:**
```
ToolSearch("mosic task page entity create document complete update comment relation batch")
```

Verify tools are available before proceeding.

**Load config:**
```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
model_profile = config.model_profile or "balanced"

Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-executor | opus | sonnet | sonnet |
```

## 1. Load Task and Validate

```
# Extract task identifier
task_identifier = extract_identifier($ARGUMENTS)

# Load task from Mosic
IF task_identifier:
  task = mosic_get_task(task_identifier, {
    workspace_id: workspace_id,
    description_format: "markdown"
  })
ELSE:
  # Use active task from config
  task_id = config.mosic.session?.active_task
  IF not task_id:
    ERROR: "No task identifier provided and no active task. Provide task ID or run /gsd:task first."
  task = mosic_get_task(task_id, { description_format: "markdown" })

TASK_ID = task.name
TASK_IDENTIFIER = task.identifier
TASK_TITLE = task.title

IF task.done:
  Display: "Task {TASK_IDENTIFIER} is already complete."
  EXIT
```

Display:
```
-------------------------------------------
 GSD > EXECUTING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
```

## 2. Load Subtasks and Plan

```
# Get subtasks
subtasks = mosic_search_tasks({
  workspace_id: workspace_id,
  filters: { parent_task: TASK_ID }
})

IF subtasks.results.length == 0:
  ERROR: "No subtasks found for task " + TASK_IDENTIFIER + ". Run /gsd:plan-task first."

# Categorize subtasks by status
incomplete_subtasks = subtasks.results.filter(t => not t.done)
complete_subtasks = subtasks.results.filter(t => t.done)

IF incomplete_subtasks.length == 0:
  Display: "All subtasks already complete. Creating summary..."
  GOTO step 5

# Get plan page
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

plan_page = task_pages.find(p =>
  p.title.includes("Plan") or p.page_type == "Spec"
)

plan_content = ""
IF plan_page:
  plan_content = mosic_get_page(plan_page.name, {
    content_format: "markdown"
  }).content
ELSE:
  Display: "Warning: No plan page found. Proceeding with subtask execution."
```

Display:
```
Task: {TASK_IDENTIFIER}
- Total subtasks: {subtasks.results.length}
- Complete: {complete_subtasks.length}
- Remaining: {incomplete_subtasks.length}
```

## 3. Load Phase Context

```
# Get parent phase
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Get phase pages for context
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

research_page = phase_pages.find(p => p.title.includes("Research"))
context_page = phase_pages.find(p => p.title.includes("Context"))

research_content = ""
IF research_page:
  research_content = mosic_get_page(research_page.name, {
    content_format: "markdown"
  }).content

context_content = ""
IF context_page:
  context_content = mosic_get_page(context_page.name, {
    content_format: "markdown"
  }).content

# Load task-specific context
task_context_page = task_pages.find(p => p.title.includes("Context"))
task_research_page = task_pages.find(p => p.title.includes("Research"))

task_context_content = ""
IF task_context_page:
  task_context_content = mosic_get_page(task_context_page.name, {
    content_format: "markdown"
  }).content

task_research_content = ""
IF task_research_page:
  task_research_content = mosic_get_page(task_research_page.name, {
    content_format: "markdown"
  }).content
```

## 4. Spawn Executor

Display:
```
-------------------------------------------
 GSD > SPAWNING EXECUTOR
-------------------------------------------

Executing {incomplete_subtasks.length} subtask(s)...
```

```
# Build subtask context
subtask_details = ""
FOR each subtask in incomplete_subtasks:
  st = mosic_get_task(subtask.name, { description_format: "markdown" })
  subtask_details += """

### Subtask: """ + st.identifier + """ - """ + st.title + """
**Status:** """ + st.status + """
**Description:**
""" + st.description + """

---
"""

# Update parent task status
mosic_update_document("MTask", TASK_ID, {
  status: "In Progress"
})

# Add execution started comment
mosic_create_document("M Comment", {
  workspace: workspace_id,
  ref_doc: "MTask",
  ref_name: TASK_ID,
  content: "<p><strong>Execution Started</strong></p>" +
    "<p>Subtasks: " + incomplete_subtasks.length + "</p>"
})

# Mark subtasks as in progress
FOR each subtask in incomplete_subtasks:
  mosic_update_document("MTask", subtask.name, {
    status: "In Progress"
  })

executor_prompt = """
<objective>
Execute task """ + TASK_IDENTIFIER + """: """ + TASK_TITLE + """

Implement all subtasks and then ask for user permission to create commits. Create summary when complete.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
**Parent Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """
**Parent Task ID:** """ + TASK_ID + """
**Phase:** """ + phase.title + """
**Workspace:** """ + workspace_id + """

**Plan Content:**
""" + (plan_content or "No plan page available.") + """

**Subtasks to Execute:**
""" + subtask_details + """

**Phase Research (if available):**
""" + (research_content or "No phase research.") + """

**Phase Context & Decisions (if available):**
""" + (context_content or "No phase context.") + """

**Task-Specific Context (if available):**
""" + (task_context_content or "No task-specific context.") + """

**Task-Specific Research (if available):**
""" + (task_research_content or "No task-specific research.") + """
</context>

<commit_rules>
**Per-Subtask Commits:**
After each subtask completes:
1. Stage only files modified by that subtask
2. Commit with format: `{type}({TASK_IDENTIFIER}): {subtask-name}`
3. Types: feat, fix, test, refactor, perf, chore
4. Record commit hash for summary
5. Always ask for user permission before you commit

**Never use:**
- `git add .`
- `git add -A`
- `git add src/` or any broad directory
- Never auto commit the changes

**Always stage files individually.**
</commit_rules>

<success_criteria>
For each subtask:
- [ ] Implementation matches description
- [ ] Verification criteria pass
- [ ] Commit created with proper format
- [ ] Subtask marked complete in Mosic

Overall:
- [ ] All subtasks executed
- [ ] Commits recorded for summary
- [ ] No regressions introduced
</success_criteria>

<output_format>
After execution, return:

## EXECUTION COMPLETE

**Task:** {TASK_IDENTIFIER}
**Subtasks Completed:** N/N

### Commits
| Hash | Message |
|------|---------|
| abc123 | feat(AUTH-5): implement login form |
| def456 | test(AUTH-5): add login tests |

### Summary
{What was accomplished}

### Files Changed
- path/to/file1.ts
- path/to/file2.ts

### Verification Results
{What was verified and how}
</output_format>
"""

Task(
  prompt="First, read ~/.claude/agents/gsd-executor.md for your role.\n\n" + executor_prompt,
  subagent_type="general-purpose",
  model="{executor_model}",
  description="Execute: " + TASK_TITLE.substring(0, 30)
)
```

## 5. Handle Executor Return and Create Summary

```
# Parse executor output
IF executor_output contains "## EXECUTION COMPLETE":
  # Extract commits
  commits = extract_commits(executor_output)
  summary_text = extract_section(executor_output, "### Summary")
  files_changed = extract_section(executor_output, "### Files Changed")
  verification_results = extract_section(executor_output, "### Verification Results")

  # Mark subtasks complete
  FOR each subtask in incomplete_subtasks:
    mosic_complete_task(subtask.name)

    # Add completion comment to subtask
    subtask_commit = commits.find(c => c.message.includes(subtask.title.substring(0, 20)))
    mosic_create_document("M Comment", {
      workspace: workspace_id,
      ref_doc: "MTask",
      ref_name: subtask.name,
      content: "<p><strong>Completed</strong></p>" +
        (subtask_commit ? "<p>Commit: <code>" + subtask_commit.hash + "</code></p>" : "")
    })

  # Create summary page
  summary_page = mosic_create_entity_page("MTask", TASK_ID, {
    workspace_id: workspace_id,
    title: TASK_IDENTIFIER + " Execution Summary",
    page_type: "Document",
    icon: "lucide:check-circle",
    status: "Published",
    content: {
      blocks: [
        {
          type: "header",
          data: { text: "Task Execution Summary", level: 1 }
        },
        {
          type: "paragraph",
          data: { text: "**Task:** " + TASK_IDENTIFIER + " - " + TASK_TITLE }
        },
        {
          type: "paragraph",
          data: { text: "**Subtasks Completed:** " + subtasks.results.length }
        },
        {
          type: "header",
          data: { text: "Commits", level: 2 }
        },
        {
          type: "table",
          data: {
            content: [
              ["Hash", "Message"],
              ...commits.map(c => [c.hash, c.message])
            ]
          }
        },
        {
          type: "header",
          data: { text: "Summary", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: summary_text }
        },
        {
          type: "header",
          data: { text: "Files Changed", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: files_changed }
        },
        {
          type: "header",
          data: { text: "Verification Results", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: verification_results }
        }
      ]
    },
    relation_type: "Related"
  })

  SUMMARY_PAGE_ID = summary_page.name

  # Tag summary page
  mosic_batch_add_tags_to_document("M Page", SUMMARY_PAGE_ID, [
    config.mosic.tags.gsd_managed,
    config.mosic.tags.summary
  ])

  # Update task checklist if exists
  task_with_checklists = mosic_get_task(TASK_ID, { include_checklists: true })
  IF task_with_checklists.checklists:
    FOR each checklist in task_with_checklists.checklists:
      # Mark as done if subtask with similar name is complete
      matching_subtask = complete_subtasks.concat(incomplete_subtasks).find(s =>
        s.title.toLowerCase().includes(checklist.title.toLowerCase()) or
        checklist.title.toLowerCase().includes(s.title.toLowerCase())
      )
      IF matching_subtask and matching_subtask.done:
        mosic_update_document("MTask CheckList", checklist.name, {
          done: true
        })

  # Mark parent task complete
  mosic_complete_task(TASK_ID)

  # Add completion comment
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    ref_doc: "MTask",
    ref_name: TASK_ID,
    content: "<p><strong>Execution Complete</strong></p>" +
      "<p>Subtasks: " + subtasks.results.length + "</p>" +
      "<p>Commits: " + commits.length + "</p>" +
      "<p><a href=\"https://mosic.pro/app/page/" + SUMMARY_PAGE_ID + "\">View Summary</a></p>"
  })

  # Create relation between plan and summary
  IF plan_page:
    mosic_create_document("M Relation", {
      workspace: workspace_id,
      source_doctype: "M Page",
      source_name: plan_page.name,
      target_doctype: "M Page",
      target_name: SUMMARY_PAGE_ID,
      relation_type: "Related"
    })

ELSE:
  ERROR: "Executor did not return structured completion. Check output."
```

## 6. Update Config

```
config.mosic.pages["task-" + TASK_IDENTIFIER + "-summary"] = SUMMARY_PAGE_ID
config.mosic.session.active_task = null
config.mosic.session.task_workflow_level = null
config.mosic.session.paused_for_task = false
config.mosic.session.last_action = "execute-task"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

## 7. Present Results

```
Display:
"""
-------------------------------------------
 GSD > TASK COMPLETE
-------------------------------------------

**{TASK_IDENTIFIER}:** {TASK_TITLE}

{subtasks.results.length} subtask(s) completed
{commits.length} commit(s) created

### Commits
""" + commits.map(c => "- `" + c.hash + "` " + c.message).join("\n") + """

### Mosic Links
- Task: https://mosic.pro/app/MTask/{TASK_ID}
- Summary: https://mosic.pro/app/page/{SUMMARY_PAGE_ID}

---

## Next Up

Continue phase execution or add another task.

`/gsd:execute-phase` - continue with phase
`/gsd:task` - add another task
`/gsd:verify-task {TASK_IDENTIFIER}` - user acceptance test

<sub>`/clear` first -> fresh context window</sub>

---
"""
```

</process>

<error_handling>
```
IF executor fails mid-execution:
  # Get current state
  current_subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  completed_count = current_subtasks.results.filter(t => t.done).length
  remaining_count = current_subtasks.results.filter(t => not t.done).length

  Display:
  """
  -------------------------------------------
   EXECUTION INTERRUPTED
  -------------------------------------------

  **{TASK_IDENTIFIER}:** {TASK_TITLE}

  Progress: {completed_count}/{current_subtasks.results.length} subtasks complete

  Remaining:
  """ + current_subtasks.results.filter(t => not t.done).map(t =>
    "- " + t.identifier + ": " + t.title
  ).join("\n") + """

  To resume: `/gsd:execute-task {TASK_IDENTIFIER}`
  """

  # Store state for resume
  config.mosic.session.active_task = TASK_ID
  config.mosic.session.last_action = "execute-task-interrupted"
  config.mosic.session.last_updated = new Date().toISOString()

  write config.json

IF mosic operation fails:
  Display: "Mosic operation failed: {error}"
  Display: "Task execution may have completed. Check Mosic and retry summary creation."
```
</error_handling>

<success_criteria>
- [ ] Task loaded from Mosic (by identifier or active task)
- [ ] Subtasks identified and loaded
- [ ] Phase and task context loaded for executor
- [ ] gsd-executor spawned with full context
- [ ] Each subtask executed with atomic commit
- [ ] Subtasks marked complete
- [ ] Summary page created linked to task
- [ ] Parent task marked complete
- [ ] Task checklists updated
- [ ] Relation created between plan and summary
- [ ] config.json updated (cleared task workflow state)
- [ ] User informed with Mosic URLs and next steps
</success_criteria>
