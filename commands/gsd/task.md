---
name: gsd:task
description: Create a task in current phase with intelligent workflow routing
argument-hint: "[task-title] [--quick | --standard | --full]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<critical_constraint>
**THIS COMMAND CREATES A TASK ENTRY - IT DOES NOT IMPLEMENT ANYTHING**

You are a TASK CREATION orchestrator. Your ONLY job is to:
1. Create an MTask entry in Mosic with the user's description as the TITLE
2. Route to the appropriate workflow command

**The `$ARGUMENTS` is a TASK TITLE, NOT an instruction to implement.**

Example:
- User types: `/gsd:task Fix the login button`
- You create: MTask with title "Fix the login button"
- You DO NOT: Start fixing any login button

**DO NOT:**
- Read code to understand the task
- Implement any changes
- Write any code
- Make any commits
- Spawn executor agents
- Do anything except create the Mosic task and show next steps

**After creating the task, EXIT with instructions for the next command.**
All workflows (quick, standard, full) END with EXIT and next steps.
</critical_constraint>

<objective>
Create a Mosic task entry in the current phase's task list and route to the appropriate workflow.

**This is a TASK CREATION command, not a task execution command.**

The user provides a task title/description. You:
1. Create an MTask in Mosic
2. Determine workflow level (quick/standard/full)
3. EXIT with instructions for the next command

**Workflow Routing:**
- `--quick`: EXIT → `/gsd:plan-task --quick` → `/gsd:execute-task`
- `--standard` (default): EXIT → `/gsd:plan-task` → `/gsd:execute-task`
- `--full`: EXIT → `/gsd:discuss-task` → `/gsd:research-task` → `/gsd:plan-task` → `/gsd:execute-task` → `/gsd:verify-task`

**TDD Mode:** Read `config.workflow.tdd` — if `true` (prefer TDD for eligible tasks) or `"auto"` (planner decides per task), display hint in workflow routing output.

**Architecture:** Task created as MTask in current phase's task list. All documentation as M Pages linked to task. config.json tracks active task workflow.
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/content-formatting.md
</execution_context>

<context>
**Arguments parsing:**
- Everything before flags becomes the TASK TITLE (stored in Mosic, not executed)
- `--quick` - Quick workflow: planning and execution in fresh context
- `--standard` - Standard workflow: full planning before execution (default)
- `--full` - Full workflow: discussion, research, planning, execution, verification
</context>

<process>

<step name="load_config">
Load config.json for Mosic entity IDs:

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing:
```
ERROR: No project initialized. Run /gsd:new-project first.
```

Extract Mosic configuration:
```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id

IF not project_id:
  ERROR: No project found in config.json. Run /gsd:new-project first.
```

Load Mosic tools:
```
ToolSearch("mosic task create document entity page tag")
```
</step>

<step name="parse_arguments">
Parse the command arguments:
- Everything before flags becomes the TASK TITLE
- The title is stored in Mosic, NOT treated as an instruction to implement

```
# Extract task title and flags from $ARGUMENTS
task_title = extract_text_before_flags($ARGUMENTS)
workflow_level = "standard"  # default
explicitly_set = false

IF $ARGUMENTS contains "--quick":
  workflow_level = "quick"
  explicitly_set = true
ELIF $ARGUMENTS contains "--full":
  workflow_level = "full"
  explicitly_set = true
ELIF $ARGUMENTS contains "--standard":
  workflow_level = "standard"
  explicitly_set = true
```

If no task title provided, ask for it:

```
IF task_title is empty:
  AskUserQuestion({
    questions: [{
      question: "What should this task be called?",
      header: "Task Title",
      options: [
        { label: "Let me describe it", description: "I'll provide the task title" }
      ],
      multiSelect: false
    }]
  })

  # User provides title via "Other" option
  task_title = user_response
```
</step>

<step name="determine_phase">
Determine which phase this task belongs to:

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
</step>

<step name="infer_workflow">
If workflow level was not explicitly set via flag, infer from task title:

```
IF not explicitly_set:
  # Analyze title complexity
  complexity_indicators = {
    quick: ["fix", "typo", "update", "add log", "remove", "rename", "tweak"],
    full: ["implement", "integrate", "authentication", "oauth", "architecture",
           "refactor major", "migrate", "security", "performance optimization"]
  }

  title_lower = task_title.toLowerCase()

  # Check for quick indicators
  is_quick = complexity_indicators.quick.some(i => title_lower.includes(i))
  is_complex = complexity_indicators.full.some(i => title_lower.includes(i))

  IF is_quick and not is_complex:
    # Suggest quick but let user confirm
    Display: "This looks like a quick task."

    AskUserQuestion({
      questions: [{
        question: "How complex is this task?",
        header: "Workflow",
        options: [
          { label: "Quick (Recommended)", description: "Brief planning then execution" },
          { label: "Standard", description: "Full planning before execution" },
          { label: "Full", description: "Discussion, research, planning, verification" }
        ],
        multiSelect: false
      }]
    })

    workflow_level = user_selection.toLowerCase().split(" ")[0]

  ELIF is_complex:
    Display: "This looks like a complex task."

    AskUserQuestion({
      questions: [{
        question: "How should we approach this task?",
        header: "Workflow",
        options: [
          { label: "Full (Recommended)", description: "Discussion, research, planning, verification" },
          { label: "Standard", description: "Planning and execution" },
          { label: "Quick", description: "Brief planning (not recommended for complex tasks)" }
        ],
        multiSelect: false
      }]
    })

    workflow_level = user_selection.toLowerCase().split(" ")[0]
```
</step>

<step name="create_task">
Create the MTask in Mosic (this is the ONLY action this command takes):

```
# Determine icon based on workflow level
icon_map = {
  "quick": "lucide:zap",
  "standard": "lucide:file-code",
  "full": "lucide:layers"
}

task_icon = icon_map[workflow_level]

# Create the task entry
# IMPORTANT: Task descriptions must use Editor.js format
task = mosic_create_document("MTask", {
  workspace: workspace_id,
  task_list: active_phase_id,
  title: task_title,
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
        data: { text: "**Status:** Awaiting next workflow step..." }
      }
    ]
  },
  icon: task_icon,
  status: "ToDo",
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

{TASK_IDENTIFIER}: {task_title}

Phase: {phase.title}
Workflow: {workflow_level}

Task: https://mosic.pro/app/MTask/{TASK_ID}
"""
```
</step>

<step name="update_config">
Update config.json with task workflow state:

```
# Track task workflow state
config.mosic.session.active_task = TASK_ID
config.mosic.session.active_task_identifier = TASK_IDENTIFIER
config.mosic.session.task_workflow_level = workflow_level
config.mosic.session.last_action = "task-create"
config.mosic.session.last_updated = new Date().toISOString()

# Store task reference
config.mosic.tasks = config.mosic.tasks or {}
config.mosic.tasks["task-" + TASK_IDENTIFIER] = TASK_ID

write config.json
```
</step>

<step name="route_to_workflow">
Based on workflow level, display next steps and EXIT.

**ALL workflows EXIT here. This command does NOT execute any work.**

```
# TDD hint for display
tdd_config = config.workflow?.tdd ?? "auto"
tdd_hint = ""
IF tdd_config == true:
  tdd_hint = "\n  TDD: Preferred — tests first for eligible tasks"
ELIF tdd_config == "auto":
  tdd_hint = "\n  TDD: Auto — planner decides per task"
```

### Route A: Quick Workflow

```
IF workflow_level == "quick":
  Display:
  """
  -------------------------------------------
   QUICK WORKFLOW
  -------------------------------------------

  Task: {TASK_IDENTIFIER} - {task_title}

  Quick workflow creates a brief plan then executes.

  ---

  ## Next Up

  **Create quick plan and execute**

  `/gsd:plan-task {TASK_IDENTIFIER} --quick`

  <sub>`/clear` first -> fresh context window</sub>

  ---

  **Or use standard planning:**
  - `/gsd:plan-task {TASK_IDENTIFIER}` - full planning

  ---
  """

  EXIT
```

### Route B: Standard Workflow

```
IF workflow_level == "standard":
  Display:
  """
  -------------------------------------------
   STANDARD WORKFLOW
  -------------------------------------------

  Task: {TASK_IDENTIFIER} - {task_title}
  """ + tdd_hint + """

  ---

  ## Next Up

  **Create execution plan**

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

  Task: {TASK_IDENTIFIER} - {task_title}
  """ + tdd_hint + """

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

  ---
  """

  EXIT
```
</step>

</process>

<error_handling>
```
IF mosic operation fails:
  Display: "Mosic operation failed: {error}"

  # Store task details for retry
  config.mosic.pending_task = {
    title: task_title,
    workflow_level: workflow_level,
    phase_id: active_phase_id,
    error: error_message,
    timestamp: new Date().toISOString()
  }

  write config.json

  Display: "Task details saved. Retry with /gsd:task or check Mosic connection."
```
</error_handling>

<anti_patterns>
**DON'T:**
- Implement or execute any code (that's `/gsd:execute-task`)
- Create plan pages (that's `/gsd:plan-task`)
- Spawn planner or executor agents
- Read codebase to understand the task
- Make any git commits
- Create subtasks (that's `/gsd:plan-task`)
- Research the task (that's `/gsd:research-task`)
- Do anything except create the MTask and show next steps

**DO:**
- Create ONE MTask entry in Mosic
- Tag the task appropriately
- Update config.json with task reference
- Display next steps based on workflow level
- EXIT immediately after showing next steps
</anti_patterns>

<success_criteria>
Task creation is complete when:

- [ ] Current phase identified (from config or Mosic)
- [ ] Task title provided (argument or interactive)
- [ ] Workflow level determined (flag or inferred)
- [ ] MTask created in phase's task list (status: ToDo)
- [ ] Task tagged (gsd-managed, task-workflow, task-{level})
- [ ] config.json updated with task reference and workflow state
- [ ] Next steps displayed with task identifier
- [ ] Command EXITS (no further action taken)
- [ ] Mosic URL provided for task tracking
</success_criteria>
