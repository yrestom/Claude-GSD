---
name: gsd:pause-work
description: Create context handoff when pausing work mid-phase
allowed-tools:
  - Read
  - Write
  - Bash
  - ToolSearch
---

<objective>
Create `.continue-here.md` handoff file to preserve complete work state across sessions.

Enables seamless resumption in fresh session with full context restoration.
Also updates Mosic task status to "Blocked" or "On Hold" if integration enabled.
</objective>

<context>
@.planning/STATE.md
</context>

<process>

<step name="detect">
Find current phase directory from most recently modified files.
</step>

<step name="gather">
**Collect complete state for handoff:**

1. **Current position**: Which phase, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current plan/phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed.
</step>

<step name="write">
**Write handoff to `.planning/phases/XX-name/.continue-here.md`:**

```markdown
---
phase: XX-name
task: 3
total_tasks: 7
status: in_progress
last_updated: [timestamp]
---

<current_state>
[Where exactly are we? Immediate context]
</current_state>

<completed_work>

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]
  </completed_work>

<remaining_work>

- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started
  </remaining_work>

<decisions_made>

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]
  </decisions_made>

<blockers>
- [Blocker 1]: [status/workaround]
</blockers>

<context>
[Mental state, what were you thinking, the plan]
</context>

<next_action>
Start with: [specific first action when resuming]
</next_action>
```

Be specific enough for a fresh Claude to understand immediately.
</step>

<step name="commit">
**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/phases/*/.continue-here.md
git commit -m "wip: [phase-name] paused at task [X]/[Y]"
```
</step>

<step name="sync_to_mosic">
**Sync pause status to Mosic:**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing pause status to Mosic...
```

### Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
CURRENT_PLAN=$(grep "plan:" .planning/phases/${PHASE_DIR}/.continue-here.md | cut -d: -f2 | tr -d ' ')
TASK_ID=$(cat .planning/config.json | jq -r ".mosic.tasks[\"phase-${PHASE_NUM}-plan-${CURRENT_PLAN}\"]")
```

### Update Task Status to Blocked/On Hold

```
# Load Mosic tools
ToolSearch("mosic task update")

IF TASK_ID is not null:
  # Determine status based on blockers
  IF blockers exist in .continue-here.md:
    new_status = "Blocked"
  ELSE:
    new_status = "On Hold"

  # Update task status
  mosic_update_document("MTask", TASK_ID, {
    status: new_status
  })

  # Add pause comment with context
  pause_reason = extract_context_from_continue_here()
  next_action = extract_next_action_from_continue_here()

  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MTask",
    ref_name: TASK_ID,
    content: "⏸️ **Work Paused**\n\n**Status:** " + new_status + "\n**Progress:** Task " + task_num + "/" + total_tasks + "\n\n**Context:**\n" + pause_reason + "\n\n**Next Action:**\n" + next_action + "\n\n**Paused at:** " + timestamp
  })
```

### Update Phase (Task List) Status if All Tasks Paused

```
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE_NUM}\"]")

IF TASK_LIST_ID is not null:
  # Check if any tasks still in progress
  active_tasks = mosic_search_tasks({
    task_list: TASK_LIST_ID,
    status__in: ["In Progress"]
  })

  IF active_tasks.length == 0:
    # Update task list status to On Hold
    mosic_update_document("MTask List", TASK_LIST_ID, {
      status: "On Hold"
    })
```

Display:
```
✓ Mosic updated
  Task status: {Blocked/On Hold}
  Pause comment added
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Local handoff created."
  - Add to mosic.pending_sync array for retry
  - Continue to confirmation (don't block)
```

**If mosic.enabled = false:** Skip to confirmation step.
</step>

<step name="confirm">
```
✓ Handoff created: .planning/phases/[XX-name]/.continue-here.md

Current state:

- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP
[IF mosic.enabled:]
- Mosic: Task marked as {Blocked/On Hold}
[END IF]

To resume: /gsd:resume-work

```
</step>

</process>

<success_criteria>
- [ ] .continue-here.md created in correct phase directory
- [ ] All sections filled with specific content
- [ ] Committed as WIP
- [ ] Mosic sync (if enabled):
  - [ ] Task status updated to Blocked/On Hold
  - [ ] Pause comment added with context
  - [ ] Task list status updated if no active tasks
- [ ] User knows location and how to resume
</success_criteria>
