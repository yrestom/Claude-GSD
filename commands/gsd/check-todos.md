---
name: gsd:check-todos
description: List pending todos and select one to work on
argument-hint: [area filter]
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
  - mcp__mosic_pro__*
---

<objective>
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.

Enables reviewing captured ideas and deciding what to work on next.

**Mosic-only architecture:** Todos are MTasks with "lucide:lightbulb" icon in Mosic, not local files.
</objective>

<context>
Load from Mosic MCP:
- config.json → workspace_id, project_id
- mosic_get_project(project_id, { include_task_lists: true })
- mosic_search_tasks({ workspace_id, project_id, status__in: ["Backlog", "ToDo"], icon: "lucide:lightbulb" })
</context>

<process>

<step name="load_config">
**Load session context from config.json:**

```bash
WORKSPACE_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.project_id")
```

If config.json missing or IDs not set:
```
No active GSD session. Run /gsd:new-project first.
```
Exit.
</step>

<step name="fetch_todos">
**Fetch todo tasks from Mosic:**

```
# Search for todo tasks (icon: lucide:lightbulb marks todos)
mosic_todos = mosic_search_tasks({
  workspace_id: WORKSPACE_ID,
  project_id: PROJECT_ID,
  status__in: ["Backlog", "ToDo"],
  icon: "lucide:lightbulb"
})

# Also get gsd-managed tag for filtering
GSD_MANAGED_TAG = config.mosic.tags.gsd_managed
```

If no todos found:
```
No pending todos.

Todos are captured during work sessions with /gsd:add-todo.

---

Would you like to:

1. Continue with current phase (/gsd:progress)
2. Add a todo now (/gsd:add-todo)
```

Exit.
</step>

<step name="parse_filter">
Check for area filter in arguments:
- `/gsd:check-todos` → show all
- `/gsd:check-todos api` → filter to area:api tag only

```
IF area_filter:
  # Filter todos by area tag
  mosic_todos = mosic_todos.filter(t =>
    t.tags.includes("area-" + area_filter)
  )
```
</step>

<step name="list_todos">
Display todos as numbered list:

```
Pending Todos:

1. Add auth token refresh (api, 2d ago)
   https://mosic.pro/app/MTask/[task_id]
2. Fix modal z-index issue (ui, 1d ago)
   https://mosic.pro/app/MTask/[task_id]
3. Refactor database connection pool (database, 5h ago)
   https://mosic.pro/app/MTask/[task_id]

---

Reply with a number to view details, or:
- `/gsd:check-todos [area]` to filter by area
- `q` to exit
```

Format age as relative time from task.creation_date.
Extract area from tags (area-* pattern).
</step>

<step name="handle_selection">
Wait for user to reply with a number.

If valid: load selected todo, proceed.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."
</step>

<step name="load_context">
**Load full todo context from Mosic:**

```
selected_task = mosic_get_task(selected_task_id, {
  description_format: "markdown",
  include_comments: true
})

# Get related pages if any
related_pages = mosic_get_entity_pages("MTask", selected_task_id)
```

Display:

```
## [title]

**Area:** [area from tags]
**Created:** [date] ([relative time] ago)
**Mosic:** https://mosic.pro/app/MTask/[task_id]

### Description
[task description in markdown]

[IF comments exist:]
### Comments
[list recent comments]
[END IF]

[IF related_pages exist:]
### Related Documentation
[list page titles with URLs]
[END IF]
```
</step>

<step name="check_roadmap">
**Check if todo maps to a phase:**

```
# Get project phases from Mosic
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })
phases = project.task_lists

# Check if todo's area tag matches a phase
# Or if todo has a task_list assignment
```

Note any phase match for action options.
</step>

<step name="offer_actions">
**If todo maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This todo relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — update status, start working
  - "Add to phase plan" — move to phase task list
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — update status, start working
  - "Create a phase" — /gsd:add-phase with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Work on it now:**

```
# Update task status in Mosic
mosic_update_document("MTask", selected_task_id, {
  status: "In Progress",
  start_date: "[today's date]"
})

# Add progress comment
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  reference_doctype: "MTask",
  reference_name: selected_task_id,
  content: "Work started via /gsd:check-todos"
})
```

Display:
```
✓ Todo started: [title]
  Status: In Progress
  Mosic: https://mosic.pro/app/MTask/[task_id]
```

Present description context. Begin work or ask how to proceed.

**Add to phase plan:**

```
# Move task to phase task list
mosic_update_document("MTask", selected_task_id, {
  task_list: PHASE_TASK_LIST_ID
})

# Add comment noting phase assignment
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  reference_doctype: "MTask",
  reference_name: selected_task_id,
  content: "Assigned to Phase [N] planning"
})
```

Return to list or exit.

**Create a phase:**
Display: `/gsd:add-phase [description from todo]`
Keep as Backlog. User runs command in fresh context.

**Brainstorm approach:**
Keep as Backlog. Start discussion about problem and approaches.

**Put it back:**
Return to list_todos step.
</step>

<step name="update_session">
After any action, update config.json with current task if working:

```json
{
  "session": {
    "current_task_id": "[selected_task_id]",
    "current_task_title": "[title]",
    "last_activity": "[timestamp]"
  }
}
```
</step>

</process>

<output>
- MTask status updated in Mosic (if "Work on it now")
- Session context updated in config.json
- M Comment added for tracking
</output>

<anti_patterns>
- Don't delete todos — update status to "In Progress" when work begins
- Don't start work without updating Mosic status first
- Don't create plans from this command — route to /gsd:plan-phase or /gsd:add-phase
- Don't reference local .planning/ files — all data lives in Mosic
</anti_patterns>

<success_criteria>
- [ ] Todos fetched from Mosic via mosic_search_tasks
- [ ] Todos filtered by "lucide:lightbulb" icon
- [ ] Area filter applied via tags if specified
- [ ] Selected todo's full context loaded (description, comments, related pages)
- [ ] Phase context checked via project task lists
- [ ] Appropriate actions offered
- [ ] Selected action executed in Mosic
- [ ] Session context updated in config.json
</success_criteria>
