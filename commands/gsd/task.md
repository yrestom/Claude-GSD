---
name: gsd:task
description: Create a task in current phase with intelligent workflow routing
argument-hint: "[description] [--quick | --standard | --full]"
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
Create a task in the current phase's task list (not Quick Tasks) with workflow routing based on complexity.

**Problem this solves:** Mid-phase task discovery. When working on a phase, users discover tasks that need immediate attention. These tasks:
- Should stay in the current phase (not Quick Tasks list)
- May need varying levels of workflow (quick/standard/full)
- Need proper GSD guarantees (atomic commits, Mosic tracking)

**Workflow Variants:**
- `--quick`: Create -> Brief Plan -> Execute -> Summary (~15-30 min)
- `--standard` (default): Create -> Plan -> Execute -> Summary (~1-2 hours)
- `--full`: Create -> Discuss -> Research -> Plan -> Execute -> Verify (complex tasks)

**Architecture:** Task created as MTask in current phase's task list. All documentation as M Pages linked to task. config.json tracks active task workflow.
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/content-formatting.md
</execution_context>

<context>
**Arguments:**
- Task description (required if not provided interactively)
- `--quick` - Skip research/planning, execute immediately
- `--standard` - Full planning, skip discussion/research (default)
- `--full` - Complete workflow with discussion, research, planning, verification
</context>

<process>

## 0. Load Config and Mosic Tools

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
```

Load Mosic tools:
```
ToolSearch("mosic task create document entity page tag")
```

**Resolve model profile:**
```bash
MODEL_PROFILE=$(cat config.json | jq -r '.model_profile // "balanced"')
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-planner | opus | opus | sonnet |
| gsd-executor | opus | sonnet | sonnet |
| gsd-task-researcher | sonnet | sonnet | haiku |

---

## 1. Parse Arguments

```
# Extract description and flags from $ARGUMENTS
description = extract_description($ARGUMENTS)
workflow_level = "standard"  # default

IF $ARGUMENTS contains "--quick":
  workflow_level = "quick"
ELIF $ARGUMENTS contains "--full":
  workflow_level = "full"
ELIF $ARGUMENTS contains "--standard":
  workflow_level = "standard"
```

**If no description provided:**

```
AskUserQuestion({
  questions: [{
    question: "What task do you need to accomplish?",
    header: "Task",
    options: [
      { label: "Let me describe it", description: "I'll provide details" }
    ],
    multiSelect: false
  }]
})

# User provides description via "Other" option
description = user_response
```

---

## 2. Determine Current Phase

```
# Check config for active phase
active_phase_id = config.mosic.session?.active_phase or config.mosic.current_phase_id

IF not active_phase_id:
  # Find current phase from project
  project = mosic_get_project(project_id, { include_task_lists: true })

  in_progress_phases = project.task_lists.filter(tl =>
    tl.status == "In Progress" and not tl.done
  )

  IF in_progress_phases.length == 0:
    # Find first pending phase
    pending_phases = project.task_lists.filter(tl => not tl.done)
    IF pending_phases.length == 0:
      ERROR: "No active phases. Create a phase first with /gsd:add-phase"
    active_phase_id = pending_phases[0].name
  ELIF in_progress_phases.length == 1:
    active_phase_id = in_progress_phases[0].name
  ELSE:
    # Multiple in-progress phases - ask user
    AskUserQuestion({
      questions: [{
        question: "Which phase should this task belong to?",
        header: "Phase",
        options: in_progress_phases.slice(0, 4).map(p => ({
          label: p.title.substring(0, 30),
          description: p.status
        })),
        multiSelect: false
      }]
    })
    active_phase_id = selected_phase.name

# Load phase details
phase = mosic_get_task_list(active_phase_id, { include_tasks: true })
```

Display:
```
Creating task in Phase: {phase.title}
```

---

## 3. Infer Workflow Level (if not specified)

If workflow level was not explicitly set via flag, infer from description:

```
IF workflow_level == "standard" and not explicitly_set:
  # Analyze description complexity
  complexity_indicators = {
    quick: ["fix", "typo", "update", "add log", "remove", "rename", "tweak"],
    full: ["implement", "integrate", "authentication", "oauth", "architecture",
           "refactor major", "migrate", "security", "performance optimization"]
  }

  description_lower = description.toLowerCase()

  # Check for quick indicators
  is_quick = complexity_indicators.quick.some(i => description_lower.includes(i))
  is_complex = complexity_indicators.full.some(i => description_lower.includes(i))

  IF is_quick and not is_complex:
    # Suggest quick but let user confirm
    Display: "This looks like a quick task."

    AskUserQuestion({
      questions: [{
        question: "How complex is this task?",
        header: "Workflow",
        options: [
          { label: "Quick (Recommended)", description: "Execute immediately with brief plan" },
          { label: "Standard", description: "Full planning before execution" },
          { label: "Full", description: "Discussion, research, planning, verification" }
        ],
        multiSelect: false
      }]
    })

    workflow_level = user_selection.toLowerCase()

  ELIF is_complex:
    Display: "This looks like a complex task."

    AskUserQuestion({
      questions: [{
        question: "How should we approach this task?",
        header: "Workflow",
        options: [
          { label: "Full (Recommended)", description: "Discussion, research, planning, verification" },
          { label: "Standard", description: "Planning and execution" },
          { label: "Quick", description: "Execute immediately (not recommended)" }
        ],
        multiSelect: false
      }]
    })

    workflow_level = user_selection.toLowerCase()
```

---

## 4. Create Task in Mosic

```
# Determine icon based on workflow level
icon_map = {
  "quick": "lucide:zap",
  "standard": "lucide:file-code",
  "full": "lucide:layers"
}

task_icon = icon_map[workflow_level]

# Create the task
# IMPORTANT: Task descriptions must use Editor.js format
task = mosic_create_document("MTask", {
  workspace: workspace_id,
  task_list: active_phase_id,
  title: description,
  description: {
    blocks: [
      {
        type: "paragraph",
        data: { text: "Task created via /gsd:task" }
      },
      {
        type: "paragraph",
        data: { text: "**Workflow:** " + workflow_level }
      },
      {
        type: "paragraph",
        data: { text: "**Status:** Pending planning..." }
      }
    ]
  },
  icon: task_icon,
  status: "In Progress",
  priority: "Normal",
  start_date: new Date().toISOString()
})

TASK_ID = task.name
TASK_IDENTIFIER = task.identifier

# Tag the task
workflow_tag = "task-" + workflow_level
mosic_batch_add_tags_to_document("MTask", TASK_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.task_workflow or "task-workflow",
  workflow_tag
])

Display:
"""
-------------------------------------------
 GSD > TASK CREATED
-------------------------------------------

{TASK_IDENTIFIER}: {description}

Phase: {phase.title}
Workflow: {workflow_level}

Task: https://mosic.pro/app/MTask/{TASK_ID}
"""
```

---

## 5. Update Config with Task Workflow State

```
# Track task workflow state
config.mosic.session.active_task = TASK_ID
config.mosic.session.task_workflow_level = workflow_level
config.mosic.session.paused_for_task = true
config.mosic.session.last_action = "task-create"
config.mosic.session.last_updated = new Date().toISOString()

# Store task reference
config.mosic.tasks = config.mosic.tasks or {}
config.mosic.tasks["task-" + TASK_IDENTIFIER] = TASK_ID

write config.json
```

---

## 6. Route to Workflow

Based on workflow level, route to appropriate next step:

### Route A: Quick Workflow

```
IF workflow_level == "quick":
  Display:
  """
  Quick workflow: Planning and executing immediately...
  """

  # Create brief plan page
  plan_page = mosic_create_entity_page("MTask", TASK_ID, {
    workspace_id: workspace_id,
    title: "Quick Plan",
    page_type: "Spec",
    icon: "lucide:zap",
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

  # Store plan page in config
  config.mosic.pages["task-" + TASK_IDENTIFIER + "-plan"] = PLAN_PAGE_ID
  write config.json

  # Spawn planner in quick mode
  Task(
    prompt="
First, read ~/.claude/agents/gsd-planner.md for your role.

<planning_context>

**Mode:** task-quick
**Task ID:** " + TASK_ID + "
**Task Identifier:** " + TASK_IDENTIFIER + "
**Plan Page ID:** " + PLAN_PAGE_ID + "
**Description:** " + description + "
**Workspace ID:** " + workspace_id + "
**Phase Task List ID:** " + active_phase_id + "

</planning_context>

<constraints>
- Create 1-3 focused subtasks maximum
- Quick tasks should be atomic and self-contained
- No research phase, no checker phase
- Target ~30% context usage (simple, focused)
- Update the plan page with structured execution steps
</constraints>

<mosic_instructions>
1. Update plan page " + PLAN_PAGE_ID + " with:
   - Clear objective
   - 1-3 numbered subtasks with acceptance criteria
   - Success verification steps

2. Create subtasks as MTask documents:
   mosic_create_document('MTask', {
     workspace: '" + workspace_id + "',
     task_list: '" + active_phase_id + "',
     parent_task: '" + TASK_ID + "',
     title: 'Subtask title',
     description: { blocks: [...] },  // Editor.js format
     status: 'ToDo',
     priority: 'Normal'
   })

3. Return: ## PLANNING COMPLETE
   **Subtasks Created:** N
</mosic_instructions>
",
    subagent_type="general-purpose",
    model="{planner_model}",
    description="Quick plan: " + description.substring(0, 30)
  )

  # Verify subtasks were created
  created_subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  IF created_subtasks.results.length == 0:
    Display: "Warning: Planner did not create subtasks. Creating basic subtask..."
    # Create a basic subtask for the task
    mosic_create_document("MTask", {
      workspace: workspace_id,
      task_list: active_phase_id,
      parent_task: TASK_ID,
      title: "Implement: " + description.substring(0, 50),
      description: {
        blocks: [
          { type: "paragraph", data: { text: "Implement the task as described." } }
        ]
      },
      status: "ToDo",
      priority: "Normal"
    })

  # After planning, proceed to execution
  GOTO step 7 (Execute)
```

### Route B: Standard Workflow

```
IF workflow_level == "standard":
  Display:
  """
  -------------------------------------------
   STANDARD WORKFLOW
  -------------------------------------------

  Next: Create execution plan for this task

  `/gsd:plan-task {TASK_IDENTIFIER}`

  <sub>`/clear` first -> fresh context window</sub>

  ---

  **Also available:**
  - `/gsd:discuss-task {TASK_IDENTIFIER}` - gather context first
  - `/gsd:research-task {TASK_IDENTIFIER}` - investigate approach first

  ---
  """

  EXIT
```

### Route C: Full Workflow

```
IF workflow_level == "full":
  Display:
  """
  -------------------------------------------
   FULL WORKFLOW
  -------------------------------------------

  Task: {TASK_IDENTIFIER} - {description}

  This task will follow the complete GSD workflow:

  1. [ ] Discuss - Clarify requirements and decisions
  2. [ ] Research - Investigate implementation approach
  3. [ ] Plan - Create subtasks with acceptance criteria
  4. [ ] Execute - Implement with atomic commits
  5. [ ] Verify - User acceptance testing

  ---

  ## Next Up

  **Discuss task requirements**

  `/gsd:discuss-task {TASK_IDENTIFIER}`

  <sub>`/clear` first -> fresh context window</sub>

  ---

  **Or skip ahead:**
  - `/gsd:research-task {TASK_IDENTIFIER}` - skip discussion
  - `/gsd:plan-task {TASK_IDENTIFIER}` - skip to planning
  - `/gsd:execute-task {TASK_IDENTIFIER}` - skip to execution

  ---
  """

  EXIT
```

---

## 7. Execute Quick Task (Quick workflow only)

For quick workflow, continue directly to execution:

```
# Re-load subtasks to get their IDs
subtasks_for_execution = mosic_search_tasks({
  workspace_id: workspace_id,
  filters: { parent_task: TASK_ID }
})

# Build subtask context for executor
subtask_list = subtasks_for_execution.results.map(s =>
  "- " + s.identifier + ": " + s.title + " (ID: " + s.name + ")"
).join("\n")

# Spawn executor
Task(
  prompt="
First, read ~/.claude/agents/gsd-executor.md for your role.

Execute task " + TASK_IDENTIFIER + ".

**Parent Task ID:** " + TASK_ID + "
**Parent Task Identifier:** " + TASK_IDENTIFIER + "
**Plan Page ID:** " + PLAN_PAGE_ID + "
**Workspace ID:** " + workspace_id + "
**Phase:** " + phase.title + "

**Subtasks to Execute:**
" + subtask_list + "

<instructions>
1. Load each subtask using mosic_get_task(subtask_id, { description_format: 'markdown' })
2. Execute each subtask:
   - Implement the required changes
   - Commit atomically with format: {type}(" + TASK_IDENTIFIER + "): {subtask-name}
   - Mark subtask complete: mosic_complete_task(subtask_id)
3. Track progress via M Comment on parent task
</instructions>

<output>
After all subtasks complete, return:

## EXECUTION COMPLETE

**Task:** " + TASK_IDENTIFIER + "
**Subtasks Completed:** N/N

### Commits
| Hash | Message |
|------|---------|
| abc123 | feat(" + TASK_IDENTIFIER + "): ... |

### Summary
{What was accomplished}
</output>
",
  subagent_type="general-purpose",
  model="{executor_model}",
  description="Execute: " + description.substring(0, 30)
)

# After executor returns, proceed to summary
```

---

## 8. Create Summary and Complete (Quick workflow only)

```
# Get the updated task
task = mosic_get_task(TASK_ID, { description_format: "markdown" })

# Extract commit hash from executor output
commit_hash = extract_commit_hash(executor_output)

# Create summary page linked to task
summary_page = mosic_create_entity_page("MTask", TASK_ID, {
  workspace_id: workspace_id,
  title: TASK_IDENTIFIER + " Summary",
  page_type: "Document",
  icon: "lucide:check-circle",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Task Complete", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Task:** " + description }
      },
      {
        type: "paragraph",
        data: { text: "**Workflow:** Quick" }
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
        data: { text: executor_summary }
      }
    ]
  },
  relation_type: "Related"
})

SUMMARY_PAGE_ID = summary_page.name

# Tag the summary page
mosic_batch_add_tags_to_document("M Page", SUMMARY_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.summary
])

# Mark task complete
mosic_complete_task(TASK_ID)

# Add completion comment
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace: workspace_id,
  reference_doctype: "MTask",
  reference_name: TASK_ID,
  content: "<p><strong>Completed</strong></p>" +
    "<p>Workflow: Quick</p>" +
    "<p>Commit: <code>" + commit_hash + "</code></p>" +
    "<p><a href=\"https://mosic.pro/app/page/" + SUMMARY_PAGE_ID + "\">View Summary</a></p>"
})

# Update config
config.mosic.pages["task-" + TASK_IDENTIFIER + "-summary"] = SUMMARY_PAGE_ID
config.mosic.session.active_task = null
config.mosic.session.task_workflow_level = null
config.mosic.session.paused_for_task = false
config.mosic.session.last_action = "task-complete"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

---

## 9. Display Completion (Quick workflow)

```
Display:
"""
-------------------------------------------
 GSD > QUICK TASK COMPLETE
-------------------------------------------

{TASK_IDENTIFIER}: {description}

Commit: {commit_hash}

Mosic:
  Task: https://mosic.pro/app/MTask/{TASK_ID}
  Summary: https://mosic.pro/app/page/{SUMMARY_PAGE_ID}

---

Ready to continue phase work or add another task.

`/gsd:task` - add another task
`/gsd:execute-phase` - continue phase execution

---
"""
```

</process>

<error_handling>
```
IF mosic operation fails:
  Display: "Mosic operation failed: {error}"

  # Store task details for retry
  config.mosic.pending_task = {
    description: description,
    workflow_level: workflow_level,
    phase_id: active_phase_id,
    error: error_message,
    timestamp: new Date().toISOString()
  }

  write config.json

  Display: "Task details saved. Retry with /gsd:task or check Mosic connection."
```
</error_handling>

<success_criteria>
- [ ] Current phase identified (from config or Mosic)
- [ ] Task description provided (argument or interactive)
- [ ] Workflow level determined (flag or inferred)
- [ ] MTask created in phase task list
- [ ] Task tagged (gsd-managed, task-workflow, task-{level})
- [ ] config.json updated with task workflow state
- [ ] Quick workflow: planning and execution complete
- [ ] Standard/Full workflow: user informed of next steps
- [ ] Mosic URLs provided for task tracking
</success_criteria>
