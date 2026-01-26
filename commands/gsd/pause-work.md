---
name: gsd:pause-work
description: Create context handoff when pausing work mid-phase
allowed-tools:
  - Read
  - Write
  - Bash
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Create context handoff to preserve complete work state across sessions.

Enables seamless resumption in fresh session with full context restoration.

**Mosic-only architecture:** Handoff stored as M Comment on current task, session context in config.json.
</objective>

<context>
Load from Mosic MCP:
- config.json → workspace_id, project_id, session.current_task_id
- mosic_get_task(current_task_id, { description_format: "markdown" })
</context>

<process>

<step name="load_session">
**Load current session from config.json:**

```bash
WORKSPACE_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.project_id")
CURRENT_TASK_ID=$(cat config.json 2>/dev/null | jq -r ".session.current_task_id")
CURRENT_PHASE=$(cat config.json 2>/dev/null | jq -r ".session.current_phase")
```

If no current task:
```
No active work session to pause.

Run /gsd:progress to see project status.
```
Exit.
</step>

<step name="gather">
**Collect complete state for handoff:**

```
# Get current task details
current_task = mosic_get_task(CURRENT_TASK_ID, {
  description_format: "markdown",
  include_comments: true
})

# Get phase task list for context
task_list = mosic_get_task_list(current_task.task_list, {
  include_tasks: true
})
```

1. **Current position**: Which phase, which task
2. **Work completed**: What got done this session (from task comments)
3. **Work remaining**: Other tasks in phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed.
</step>

<step name="create_handoff_comment">
**Create handoff comment on current task:**

```
handoff_content = build_handoff_content({
  phase: task_list.title,
  task: current_task.title,
  task_number: get_task_position(current_task, task_list),
  total_tasks: task_list.tasks.length,
  status: "in_progress",
  last_updated: timestamp
})

# Format:
handoff_content = """
## ⏸️ Work Paused

**Phase:** {phase}
**Task:** {task_number} of {total_tasks}
**Status:** In Progress

### Current State
[Where exactly are we? Immediate context]

### Completed Work
- [What's been done this session]

### Remaining Work
- [What's left on this task]
- [Other tasks in phase]

### Decisions Made
- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]

### Blockers
- [Blocker 1]: [status/workaround]

### Context
[Mental state, what were you thinking, the plan]

### Next Action
Start with: [specific first action when resuming]

---
*Paused at: {timestamp}*
"""

# Add handoff as comment on task
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  reference_doctype: "MTask",
  reference_name: CURRENT_TASK_ID,
  content: handoff_content
})
```

Be specific enough for a fresh Claude to understand immediately.
</step>

<step name="update_task_status">
**Update task status in Mosic:**

```
# Determine status based on blockers
IF blockers exist:
  new_status = "Blocked"
ELSE:
  new_status = "On Hold"

# Update task status
mosic_update_document("MTask", CURRENT_TASK_ID, {
  status: new_status
})
```
</step>

<step name="update_phase_status">
**Update phase (task list) status if all tasks paused:**

```
TASK_LIST_ID = current_task.task_list

# Check if any tasks still in progress
active_tasks = mosic_search_tasks({
  workspace_id: WORKSPACE_ID,
  task_list: TASK_LIST_ID,
  status__in: ["In Progress"]
})

IF active_tasks.length == 0:
  # Update task list status to On Hold
  mosic_update_document("MTask List", TASK_LIST_ID, {
    status: "On Hold"
  })
```
</step>

<step name="update_config">
**Update config.json with pause state:**

```json
{
  "session": {
    "status": "paused",
    "paused_at": "[ISO timestamp]",
    "current_task_id": "[CURRENT_TASK_ID]",
    "current_task_title": "[task title]",
    "current_phase": "[phase name]",
    "handoff_comment_id": "[comment_id]"
  }
}
```
</step>

<step name="confirm">
```
✓ Work paused

  Phase: [phase name]
  Task: [task title]
  Status: {Blocked/On Hold}
  Mosic: https://mosic.pro/app/MTask/[CURRENT_TASK_ID]

Handoff context saved as comment on task.

To resume: /gsd:resume-work
```
</step>

</process>

<error_handling>
```
IF mosic update fails:
  - Log warning: "Mosic update failed: [error]. Session context saved locally."
  - Save handoff to config.json as fallback:
    {
      "session": {
        "pending_handoff": { ...handoff_content... }
      }
    }
  - Continue (don't block)
```
</error_handling>

<success_criteria>
- [ ] Current session loaded from config.json
- [ ] Handoff content gathered (position, work done, remaining, context)
- [ ] M Comment created on current task with handoff
- [ ] Task status updated to Blocked/On Hold
- [ ] Task list status updated if no active tasks
- [ ] config.json updated with pause state
- [ ] User knows how to resume (/gsd:resume-work)
</success_criteria>
