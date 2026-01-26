---
name: gsd:quick
description: Execute a quick task with GSD guarantees using Mosic for state management
argument-hint: ""
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

<objective>
Execute small, ad-hoc tasks with GSD guarantees (atomic commits, state tracking) while skipping optional agents (research, plan-checker, verifier).

Quick mode is the same system with a shorter path:
- Spawns gsd-planner (quick mode) + gsd-executor(s)
- Skips gsd-phase-researcher, gsd-plan-checker, gsd-verifier
- Quick tasks live in Mosic as MTask entries in a "Quick Tasks" task list
- All state tracked in Mosic, config.json stores entity IDs

Use when: You know exactly what to do and the task is small enough to not need research or verification.
</objective>

<execution_context>
Orchestration is inline - no separate workflow file. Quick mode is deliberately simpler than full GSD.
</execution_context>

<context>
**Config file:** config.json (minimal - just workspace_id required)
</context>

<process>

## Step 0: Load Configuration and Mosic Tools

```bash
# Load config.json
CONFIG=$(cat config.json 2>/dev/null || echo '{}')
WORKSPACE_ID=$(echo "$CONFIG" | jq -r '.mosic.workspace_id // empty')
```

Load Mosic tools:
```
ToolSearch("mosic task create document entity page")
```

**Minimal config validation:**
```
IF WORKSPACE_ID is empty:
  # Quick mode only requires workspace_id - no full project needed
  PROMPT: "Enter your Mosic workspace ID (or run /gsd:new-project for full setup):"
  WORKSPACE_ID = user_response

  # Create minimal config.json
  config = {
    "mosic": {
      "enabled": true,
      "workspace_id": WORKSPACE_ID,
      "tags": {
        "gsd_managed": "gsd-managed",
        "quick": "quick",
        "summary": "summary"
      },
      "task_lists": {},
      "tasks": {},
      "pages": {}
    }
  }
  write config.json
```

Resolve model profile:
```bash
MODEL_PROFILE=$(echo "$CONFIG" | jq -r '.model_profile // "balanced"')
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-planner | opus | opus | sonnet |
| gsd-executor | opus | sonnet | sonnet |

---

## Step 1: Get Task Description

Prompt user interactively for the task description:

```
AskUserQuestion(
  header: "Quick Task",
  question: "What do you want to do?",
  followUp: null
)
```

Store response as `$DESCRIPTION`.

If empty, re-prompt: "Please provide a task description."

Generate slug from description:
```bash
slug=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
```

---

## Step 2: Find or Create Quick Tasks List in Mosic

```
# Check if Quick Tasks list exists in config
QUICK_LIST_ID = config.mosic.task_lists["quick"]

IF QUICK_LIST_ID is null or empty:
  # Search for existing Quick Tasks list
  existing_lists = mosic_search({
    workspace_id: WORKSPACE_ID,
    query: "Quick Tasks",
    doctypes: ["MTask List"]
  })

  IF existing_lists.results.length > 0:
    # Use existing list
    QUICK_LIST_ID = existing_lists.results[0].name
    DISPLAY: "Found existing Quick Tasks list"
  ELSE:
    # Create Quick Tasks list
    # IMPORTANT: MTask List descriptions use HTML format
    quick_list = mosic_create_document("MTask List", {
      workspace_id: WORKSPACE_ID,
      title: "Quick Tasks",
      description: "<p>Ad-hoc tasks completed via <code>/gsd:quick</code>.</p>" +
        "<p>These are small, atomic tasks that don't require full planning cycles.</p>",
      icon: "lucide:zap",
      color: "amber",
      status: "In Progress",
      prefix: "QT"
    })
    QUICK_LIST_ID = quick_list.name

    # Tag the list
    mosic_batch_add_tags_to_document("MTask List", QUICK_LIST_ID, [
      config.mosic.tags.gsd_managed,
      config.mosic.tags.quick
    ])

    DISPLAY: "Created Quick Tasks list: https://mosic.pro/app/MTask%20List/" + QUICK_LIST_ID

  # Store in config
  config.mosic.task_lists["quick"] = QUICK_LIST_ID
  write config.json
```

---

## Step 3: Calculate Next Quick Task Number

```
# Get existing tasks in Quick Tasks list to determine next number
quick_list = mosic_get_task_list(QUICK_LIST_ID, { include_tasks: true })

IF quick_list.tasks && quick_list.tasks.length > 0:
  # Find highest QT-N number
  highest = 0
  FOR each task in quick_list.tasks:
    match = task.identifier.match(/QT-(\d+)/)
    IF match && parseInt(match[1]) > highest:
      highest = parseInt(match[1])
  next_num = highest + 1
ELSE:
  next_num = 1

TASK_NUMBER = String(next_num).padStart(3, '0')
TASK_IDENTIFIER = "QT-" + next_num

DISPLAY: "Creating quick task " + TASK_IDENTIFIER + ": " + DESCRIPTION
```

---

## Step 4: Create Quick Task in Mosic

```
# Create the task (not yet done - will be marked done after execution)
# IMPORTANT: Task descriptions must use Editor.js format
quick_task = mosic_create_document("MTask", {
  workspace_id: WORKSPACE_ID,
  task_list: QUICK_LIST_ID,
  title: DESCRIPTION,
  description: {
    blocks: [
      {
        type: "paragraph",
        data: { text: "Quick task initiated via /gsd:quick" }
      },
      {
        type: "paragraph",
        data: { text: "**Status:** Planning..." }
      }
    ]
  },
  icon: "lucide:zap",
  status: "In Progress",
  priority: "Normal",
  start_date: ISO_TIMESTAMP
})

TASK_ID = quick_task.name

# Tag the task
mosic_batch_add_tags_to_document("MTask", TASK_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.quick
])

DISPLAY: "Task created: https://mosic.pro/app/MTask/" + TASK_ID
```

---

## Step 5: Spawn Planner (Quick Mode)

Create plan page linked to task, then spawn planner:

```
# Create plan page
plan_page = mosic_create_entity_page("MTask", TASK_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Execution Plan",
  page_type: "Spec",
  icon: "lucide:file-code",
  status: "Draft",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Quick Task Plan", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "Planning in progress..." }
      }
    ]
  },
  relation_type: "Related"
})

PLAN_PAGE_ID = plan_page.name

mosic_add_tag_to_document("M Page", PLAN_PAGE_ID, config.mosic.tags.plan)
```

Spawn planner:

```
Task(
  prompt="
<planning_context>

**Mode:** quick
**Task ID:** " + TASK_ID + "
**Plan Page:** " + PLAN_PAGE_ID + "
**Description:** " + DESCRIPTION + "
**Workspace ID:** " + WORKSPACE_ID + "

</planning_context>

<constraints>
- Create a SINGLE plan with 1-3 focused tasks
- Quick tasks should be atomic and self-contained
- No research phase, no checker phase
- Target ~30% context usage (simple, focused)
- Update the plan page with structured execution steps
</constraints>

<output>
Update plan page " + PLAN_PAGE_ID + " with:
1. Clear objective
2. 1-3 numbered tasks with acceptance criteria
3. Success verification steps

Return: ## PLANNING COMPLETE with task count
</output>
",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Quick plan: " + DESCRIPTION
)
```

After planner returns:
1. Verify plan page was updated
2. Extract plan count from return message
3. Report: "Plan ready"

---

## Step 6: Spawn Executor

```
Task(
  prompt="
Execute quick task " + TASK_IDENTIFIER + ".

**Task ID:** " + TASK_ID + "
**Plan Page:** " + PLAN_PAGE_ID + "
**Workspace ID:** " + WORKSPACE_ID + "

<constraints>
- Execute all tasks in the plan
- Commit each task atomically
- Create summary by updating the task description
- Track progress via M Comment on the task
</constraints>

<output>
After completion:
1. Update task status to Completed
2. Add summary to task description
3. Return: ## EXECUTION COMPLETE with commit hash
</output>
",
  subagent_type="gsd-executor",
  model="{executor_model}",
  description="Execute: " + DESCRIPTION
)
```

After executor returns:
1. Extract commit hash from output
2. Verify task status is updated

---

## Step 7: Create Summary Page and Mark Complete

```
# Get the updated task to extract summary
task = mosic_get_task(TASK_ID, { description_format: "markdown" })

# Create summary page linked to task
summary_page = mosic_create_entity_page("MTask", TASK_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Execution Summary",
  page_type: "Document",
  icon: "lucide:check-circle",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Quick Task Complete", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Task:** " + DESCRIPTION }
      },
      {
        type: "paragraph",
        data: { text: "**Commit:** `" + commit_hash + "`" }
      },
      {
        type: "header",
        data: { text: "Summary", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: task.description }
      }
    ]
  },
  relation_type: "Related"
})

SUMMARY_PAGE_ID = summary_page.name

# Tag the summary page
mosic_batch_add_tags_to_document("M Page", SUMMARY_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.summary,
  config.mosic.tags.quick
])

# Mark task as completed
mosic_complete_task(TASK_ID)

# Add completion comment
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  reference_doctype: "MTask",
  reference_name: TASK_ID,
  content: "<p><strong>Completed</strong></p>" +
    "<p>Commit: <code>" + commit_hash + "</code></p>" +
    "<p><a href=\"https://mosic.pro/app/page/" + SUMMARY_PAGE_ID + "\">View Summary</a></p>"
})

DISPLAY: "Summary created: https://mosic.pro/app/page/" + SUMMARY_PAGE_ID
```

---

## Step 8: Update config.json

```
# Store task and page references
config.mosic.tasks["quick-" + TASK_NUMBER] = TASK_ID
config.mosic.pages["quick-" + TASK_NUMBER + "-plan"] = PLAN_PAGE_ID
config.mosic.pages["quick-" + TASK_NUMBER + "-summary"] = SUMMARY_PAGE_ID
config.mosic.session = {
  "last_action": "quick",
  "last_task": TASK_ID,
  "last_updated": ISO_TIMESTAMP
}

write config.json
```

---

## Step 9: Display Completion

```
DISPLAY:
"""
───────────────────────────────────────────────────────────────

GSD > QUICK TASK COMPLETE

{TASK_IDENTIFIER}: {DESCRIPTION}

Commit: {commit_hash}

Mosic:
  Task: https://mosic.pro/app/MTask/{TASK_ID}
  Summary: https://mosic.pro/app/page/{SUMMARY_PAGE_ID}

───────────────────────────────────────────────────────────────

Ready for next task: /gsd:quick
"""
```

</process>

<success_criteria>
- [ ] Workspace ID available (from config or user input)
- [ ] User provides task description
- [ ] Quick Tasks list found or created in Mosic
- [ ] MTask created with quick tag
- [ ] Plan page created and updated by planner
- [ ] Executor completes work with atomic commits
- [ ] Summary page created linked to task
- [ ] Task marked completed in Mosic
- [ ] config.json updated with entity references
- [ ] Completion displayed with Mosic links
</success_criteria>
