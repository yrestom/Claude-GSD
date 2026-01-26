---
name: gsd:resume-work
description: Resume work from previous session with full context restoration from Mosic
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Restore complete project context from Mosic and resume work seamlessly from previous session.

**Mosic-only architecture:** All state is read from Mosic. Session context from config.json (entity IDs only).

Handles:
- Project and phase state loading from Mosic
- Cross-session update detection
- Incomplete work identification (tasks in progress)
- Checkpoint detection (awaiting user response)
- Context-aware next action routing
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/resume-project.md
</execution_context>

<process>

## 0. Load Config and Mosic Tools

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
last_sync = config.mosic.last_sync or config.last_sync
```

Load Mosic tools:
```
ToolSearch("mosic project task search notification")
```

---

## 1. Check for Cross-Session Updates

Display:
```
Checking Mosic for updates since last session...
```

```
# Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

IF not project:
  ERROR: "Project not found in Mosic. Run /gsd:new-project first."
  EXIT

# Check for tasks modified since last sync
IF last_sync:
  modified_tasks = mosic_search_tasks({
    project_id: project_id,
    modified_after: last_sync
  })

  external_updates = []
  FOR each task in modified_tasks:
    IF task.done AND task.completed_date > last_sync:
      external_updates.push({
        type: "completed",
        task: task.identifier + ": " + task.title
      })
    ELIF task.status changed:
      external_updates.push({
        type: "status_change",
        task: task.identifier + ": " + task.title,
        status: task.status
      })

  IF external_updates.length > 0:
    Display:
    """
    -------------------------------------------
     CROSS-SESSION UPDATES DETECTED
    -------------------------------------------

    Changes made in Mosic since last session:

    {FOR each update:}
    - [{update.type}] {update.task}

    These updates have been integrated. Mosic is the source of truth.
    -------------------------------------------
    """
  ELSE:
    Display: "No external updates since last session."
```

---

## 2. Determine Current Position from Mosic

```
# Categorize phases by status
in_progress_phases = project.task_lists.filter(tl => tl.status == "In Progress")
completed_phases = project.task_lists.filter(tl => tl.done or tl.status == "Completed")
pending_phases = project.task_lists.filter(tl =>
  tl.status == "ToDo" or tl.status == "Planned" or tl.status == "Backlog"
)

# Current phase is first in-progress, or first pending
current_phase = in_progress_phases[0] or pending_phases[0]

# Get current phase details with tasks
IF current_phase:
  phase = mosic_get_task_list(current_phase.name, { include_tasks: true })

  in_progress_tasks = phase.tasks.filter(t => !t.done and t.status == "In Progress")
  pending_tasks = phase.tasks.filter(t => !t.done)
  completed_tasks = phase.tasks.filter(t => t.done)

  current_task = in_progress_tasks[0] or pending_tasks[0]

# Calculate progress
total_phases = project.task_lists.length
completed_count = completed_phases.length
progress_pct = Math.round((completed_count / total_phases) * 100)
```

---

## 3. Check for Incomplete Work

```
# Find tasks stuck in progress (started but not finished)
stuck_tasks = []

FOR each task_list in project.task_lists:
  tl = mosic_get_task_list(task_list.name, { include_tasks: true })
  FOR each task in tl.tasks:
    IF !task.done AND task.status == "In Progress":
      stuck_tasks.push({
        identifier: task.identifier,
        title: task.title,
        phase: task_list.title,
        task_id: task.name
      })

# Check for checkpoint comments awaiting response
checkpoint_pending = null
IF current_task:
  task_comments = mosic_list_documents("M Comment", {
    filters: [
      ["reference_doctype", "=", "MTask"],
      ["reference_name", "=", current_task.name]
    ],
    order_by: "creation desc",
    limit: 5
  })

  FOR each comment in task_comments:
    IF comment.content contains "CHECKPOINT" AND comment.content contains "Awaiting":
      checkpoint_pending = {
        task: current_task.identifier,
        comment: comment.content
      }
      BREAK
```

---

## 4. Present Status

```
-------------------------------------------
 GSD > RESUMING WORK
-------------------------------------------

**Project:** {project.title}

**Progress:** [{progress_bar}] {progress_pct}%
  Phases: {completed_count}/{total_phases} complete

**Current Phase:** {current_phase ? current_phase.title : "None in progress"}
**Current Task:** {current_task ? current_task.identifier + " - " + current_task.title : "Ready to plan"}

Mosic: https://mosic.pro/app/MProject/{project_id}

---

{IF stuck_tasks.length > 0:}
**Tasks In Progress** (may need attention):
{FOR each task in stuck_tasks:}
- {task.identifier}: {task.title} ({task.phase})

{IF checkpoint_pending:}
**Pending Checkpoint:**
Task {checkpoint_pending.task} is awaiting your response.

---
```

---

## 5. Determine Next Action

```
# Check phase pages to determine what's available
IF current_phase:
  phase_pages = mosic_get_entity_pages("MTask List", current_phase.name, {
    include_subtree: false
  })
  context_page = phase_pages.find(p => p.title contains "Context" or p.title contains "Decisions")
  research_page = phase_pages.find(p => p.title contains "Research")
  plan_tasks = phase.tasks.filter(t => t.title starts with "Plan")
```

**Route based on state:**

**A. Checkpoint pending:**
→ Primary: Respond to checkpoint
→ Option: Skip checkpoint and continue

**B. Task in progress:**
→ Primary: Continue executing the task
→ Option: Abandon and restart

**C. Phase has plans, none executed:**
→ Primary: Execute phase
→ Option: Review plans

**D. Phase needs planning (no plan tasks):**
→ If no context page: Primary = Discuss phase
→ If context exists: Primary = Plan phase

**E. All phases complete:**
→ Primary: Complete milestone

---

## 6. Offer Options

```
-------------------------------------------

## What's Next?

{Based on route, show primary action:}

**A (checkpoint):**
1. Respond to checkpoint for {task.identifier}
2. Skip and continue execution

**B (task in progress):**
1. Continue {task.identifier}: {task.title}
   `/gsd:execute-phase {phase_num}`
2. Review task status

**C (ready to execute):**
1. Execute Phase {phase_num}
   `/gsd:execute-phase {phase_num}`
2. Review phase plans

**D (needs planning - no context):**
1. Discuss Phase {phase_num} context
   `/gsd:discuss-phase {phase_num}`
2. Plan directly (skip discussion)
   `/gsd:plan-phase {phase_num}`

**D (needs planning - has context):**
1. Plan Phase {phase_num}
   `/gsd:plan-phase {phase_num}`
2. Review/update context
   `/gsd:discuss-phase {phase_num}`

**E (all complete):**
1. Complete milestone
   `/gsd:audit-milestone`
2. Review accomplishments

---

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/gsd:progress` - detailed project status
- View project in Mosic

---
```

Wait for user selection.

---

## 7. Update Session State

```
# Mark current task as In Progress if resuming
IF current_task AND current_task.status != "In Progress":
  mosic_update_document("MTask", current_task.name, {
    status: "In Progress"
  })

# Add session resume comment to project
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MProject",
  reference_name: project_id,
  content: "<p><strong>Session Resumed</strong></p>" +
    "<p>Phase: " + (current_phase ? current_phase.title : "None") + "</p>" +
    "<p>Task: " + (current_task ? current_task.identifier : "None") + "</p>"
})

# Update last sync in config
config.mosic.last_sync = "[ISO timestamp now]"
config.mosic.session = {
  last_action: "resume-work",
  active_phase: current_phase ? current_phase.name : null,
  active_task: current_task ? current_task.name : null,
  last_updated: "[ISO timestamp]"
}

write config.json
```

</process>

<quick_resume>
If user says "continue" or "go" without needing options:
- Load state silently
- Determine primary action
- Show command to run

```
Continuing from Phase {N}, Task {identifier}...

`/gsd:execute-phase {N}`

<sub>`/clear` first -> fresh context window</sub>
```
</quick_resume>

<success_criteria>
- [ ] Config loaded with Mosic IDs
- [ ] Project loaded from Mosic
- [ ] Cross-session updates detected and displayed
- [ ] Current position determined from task list/task status
- [ ] Incomplete/stuck work identified
- [ ] Checkpoint status checked
- [ ] Clear status presented
- [ ] Context-aware next actions offered
- [ ] Session resume comment added to project
- [ ] config.json last_sync updated
</success_criteria>
