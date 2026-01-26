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
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>

<step name="check_mosic_enabled">
**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

Store for later use in listing and syncing steps.
</step>

<step name="check_exist">
```bash
TODO_COUNT=$(ls .planning/todos/pending/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Pending todos: $TODO_COUNT"
```

**If Mosic enabled, also fetch from Mosic:**

```
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")

# Search for todo tasks in Mosic that may not be local
mosic_todos = mosic_search_tasks({
  workspace_id: WORKSPACE_ID,
  project_id: PROJECT_ID,
  status__in: ["Backlog", "ToDo"],
  tag_ids: [GSD_MANAGED_TAG]
})

# Filter to tasks with "lucide:lightbulb" icon (todo marker) or in Backlog
mosic_only_todos = mosic_todos.filter(t =>
  t.icon == "lucide:lightbulb" &&
  !local_todos.find(lt => lt.mosic_task_id == t.name)
)
```

If local count is 0 AND no Mosic-only todos:
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
- `/gsd:check-todos api` → filter to area:api only
</step>

<step name="list_todos">
```bash
for file in .planning/todos/pending/*.md; do
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  mosic_id=$(grep "^mosic_task_id:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file|$mosic_id"
done | sort
```

Apply area filter if specified. Display as numbered list:

**If Mosic enabled, show sync status:**

```
Pending Todos:

1. Add auth token refresh (api, 2d ago) [synced]
2. Fix modal z-index issue (ui, 1d ago) [synced]
3. Refactor database connection pool (database, 5h ago) [local only]
4. [Mosic] Review performance metrics (ops, 3d ago) [Mosic only]

---

Sync Status: 2/3 local todos synced to Mosic | 1 Mosic-only todo

Reply with a number to view details, or:
- `/gsd:check-todos [area]` to filter by area
- `q` to exit
```

**If Mosic not enabled:**

```
Pending Todos:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
3. Refactor database connection pool (database, 5h ago)

---

Reply with a number to view details, or:
- `/gsd:check-todos [area]` to filter by area
- `q` to exit
```

Format age as relative time.
</step>

<step name="handle_selection">
Wait for user to reply with a number.

If valid: load selected todo, proceed.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."
</step>

<step name="load_context">
Read the todo file completely. Display:

```
## [title]

**Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]
[IF mosic_task_id:] **Mosic:** https://mosic.pro/app/MTask/[mosic_task_id]

### Problem
[problem section content]

### Solution
[solution section content]
```

**If Mosic enabled and todo has mosic_task_id, fetch additional context:**

```
mosic_task = mosic_get_task(mosic_task_id, {
  description_format: "markdown",
  include_comments: true
})

# Show any comments/updates made in Mosic
IF mosic_task.comments.length > 0:
  Display:
  ### Mosic Updates
  [list recent comments]
```

If `files` field has entries, read and briefly summarize each.
</step>

<step name="check_roadmap">
```bash
ls .planning/ROADMAP.md 2>/dev/null && echo "Roadmap exists"
```

If roadmap exists:
1. Check if todo's area matches an upcoming phase
2. Check if todo's files overlap with a phase's scope
3. Note any match for action options
</step>

<step name="offer_actions">
**If todo maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This todo relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — move to done, start working
  - "Add to phase plan" — include when planning Phase [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — move to done, start working
  - "Create a phase" — /gsd:add-phase with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Work on it now:**
```bash
mv ".planning/todos/pending/[filename]" ".planning/todos/done/"
```
Update STATE.md todo count. Present problem/solution context. Begin work or ask how to proceed.

**If Mosic enabled and todo has mosic_task_id:**
```
# Update task status in Mosic
mosic_update_document("MTask", mosic_task_id, {
  status: "In Progress"
})
```

**Add to phase plan:**
Note todo reference in phase planning notes. Keep in pending. Return to list or exit.

**If Mosic enabled:**
```
# Add comment to Mosic task noting phase assignment
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: mosic_task_id,
  content: "Assigned to Phase [N] planning"
})
```

**Create a phase:**
Display: `/gsd:add-phase [description from todo]`
Keep in pending. User runs command in fresh context.

**Brainstorm approach:**
Keep in pending. Start discussion about problem and approaches.

**Put it back:**
Return to list_todos step.
</step>

<step name="update_state">
After any action that changes todo count:

```bash
ls .planning/todos/pending/*.md 2>/dev/null | wc -l
```

Update STATE.md "### Pending Todos" section if exists.
</step>

<step name="git_commit">
If todo was moved to done/, commit the change:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations, log "Todo moved (not committed - commit_docs: false)"

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/todos/done/[filename]
git rm --cached .planning/todos/pending/[filename] 2>/dev/null || true
[ -f .planning/STATE.md ] && git add .planning/STATE.md
git commit -m "$(cat <<'EOF'
docs: start work on todo - [title]

Moved to done/, beginning implementation.
EOF
)"
```

Confirm: "Committed: docs: start work on todo - [title]"
</step>

<step name="sync_completion_to_mosic">
**If Mosic enabled and todo has mosic_task_id:**

When todo is moved to done/ (work starting):

```
# Update task status in Mosic
mosic_update_document("MTask", mosic_task_id, {
  status: "In Progress",
  start_date: "[today's date]"
})

# Add progress comment
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: mosic_task_id,
  content: "Work started via /gsd:check-todos"
})
```

Display:
```
✓ Mosic task updated to "In Progress"
```

**Error handling:**

```
IF mosic sync fails:
  - Display warning: "Mosic status update failed: [error]. Continuing locally."
  - Add to mosic.pending_sync array:
    { type: "todo_status", task_id: mosic_task_id, status: "In Progress" }
  - Continue (don't block)
```
</step>

</process>

<output>
- Moved todo to `.planning/todos/done/` (if "Work on it now")
- Updated `.planning/STATE.md` (if todo count changed)
- Mosic MTask status updated (if enabled and todo synced)
</output>

<anti_patterns>
- Don't delete todos — move to done/ when work begins
- Don't start work without moving to done/ first
- Don't create plans from this command — route to /gsd:plan-phase or /gsd:add-phase
</anti_patterns>

<success_criteria>
- [ ] All pending todos listed with title, area, age
- [ ] Mosic sync status shown (if enabled)
- [ ] Mosic-only todos included in list (if any)
- [ ] Area filter applied if specified
- [ ] Selected todo's full context loaded (including Mosic comments)
- [ ] Roadmap context checked for phase match
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] STATE.md updated if todo count changed
- [ ] Changes committed to git (if todo moved to done/)
- [ ] Mosic sync (if enabled):
  - [ ] Task status updated when work starts
  - [ ] Comments added for phase assignments
  - [ ] Sync failures handled gracefully (added to pending_sync)
</success_criteria>
