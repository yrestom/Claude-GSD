---
name: gsd:resume-work
description: Resume work from previous session with full context restoration
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - SlashCommand
  - ToolSearch
---

<objective>
Restore complete project context and resume work seamlessly from previous session.

Routes to the resume-project workflow which handles:

- State loading from Mosic (MProject, MTasks)
- Session context restoration from config.json
- Incomplete work detection (PLAN without SUMMARY)
- Mosic cross-session updates check
- Status presentation
- Context-aware next action routing
  </objective>

<execution_context>
@~/.claude/get-shit-done/workflows/resume-project.md
</execution_context>

<process>

## 0. Check Mosic for Cross-Session Updates

**Before loading local state, check Mosic for updates made outside this session:**

```bash
MOSIC_ENABLED=$(cat config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Checking Mosic for cross-session updates...
```

### Load Mosic Config

```bash
WORKSPACE_ID=$(cat config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json | jq -r ".mosic.project_id")
LAST_SYNC=$(cat config.json | jq -r ".mosic.last_sync")
```

### Check for External Updates

```
# Load Mosic tools
ToolSearch("mosic task search")

IF PROJECT_ID is not null:
  # Get tasks modified since last sync
  modified_tasks = mosic_search_tasks({
    project_id: PROJECT_ID,
    modified_after: LAST_SYNC
  })

  # Get comments added since last sync
  recent_comments = mosic_search({
    workspace_id: WORKSPACE_ID,
    doctypes: ["M Comment"],
    filters: {
      modified: [">", LAST_SYNC]
    }
  })

  # Check for status changes, new assignments, blockers
  external_updates = []

  FOR each task in modified_tasks:
    IF task.status changed OR task.assignees changed:
      external_updates.push({
        type: "task_update",
        task: task.title,
        field: changed_field,
        old_value: local_value,
        new_value: task[field]
      })

  FOR each comment in recent_comments:
    IF comment.ref_doc == "MTask" AND comment.owner != "GSD Bot":
      external_updates.push({
        type: "new_comment",
        task: comment.ref_name,
        content: comment.content,
        author: comment.owner
      })
```

### Present External Updates (if any)

```
IF external_updates.length > 0:
  ───────────────────────────────────────────────────────────────
  CROSS-SESSION UPDATES DETECTED
  ───────────────────────────────────────────────────────────────

  The following changes were made in Mosic since your last session:

  [FOR each update:]
  - {task}: {field} changed to "{new_value}"
  - {task}: New comment from {author}

  ───────────────────────────────────────────────────────────────

  These updates have been integrated. Mosic is the source of truth.

ELSE:
  ✓ No external updates since last session
```

### Update Task Status to In Progress

```
# Find current task from .continue-here.md or incomplete plans
IF .continue-here.md exists:
  PHASE_DIR = extract_phase_from_continue_here()
  CURRENT_PLAN = extract_plan_from_continue_here()
  TASK_ID = config.mosic.tasks["phase-{PHASE_NUM}-plan-{CURRENT_PLAN}"]

  IF TASK_ID:
    # Update status back to In Progress
    mosic_update_document("MTask", TASK_ID, {
      status: "In Progress"
    })

    # Add resume comment
    # IMPORTANT: Comments must use HTML format
    mosic_create_document("M Comment", {
      workspace_id: WORKSPACE_ID,
      ref_doc: "MTask",
      ref_name: TASK_ID,
      content: "<p><strong>Work Resumed</strong></p><p><strong>Resumed at:</strong> " + timestamp + "</p>"
    })

# Update task list status if needed
TASK_LIST_ID = config.mosic.task_lists["phase-{PHASE_NUM}"]
IF TASK_LIST_ID:
  mosic_update_document("MTask List", TASK_LIST_ID, {
    status: "In Progress"
  })
```

### Update Last Sync Timestamp

```bash
# Update config.json with current timestamp
# mosic.last_sync = ISO timestamp now
```

**If mosic.enabled = false:** Skip to standard workflow.

---

## 1. Follow Standard Resume Workflow

**Follow the resume-project workflow** from `@~/.claude/get-shit-done/workflows/resume-project.md`.

The workflow handles all resumption logic including:

1. Project existence verification
2. STATE.md loading or reconstruction
3. Checkpoint and incomplete work detection
4. Visual status presentation
5. Context-aware option offering (checks CONTEXT.md before suggesting plan vs discuss)
6. Routing to appropriate next command
7. Session continuity updates

---

## 2. Enhanced Status Display (with Mosic)

When presenting status, include Mosic information if enabled:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESUMING WORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Project:** {project_name}
**Phase:** {phase_num} - {phase_name}
**Status:** {status}

[IF .continue-here.md exists:]
**Checkpoint:** Task {X} of {Y}
**Last Updated:** {timestamp}

[IF mosic.enabled:]
**Mosic:** https://mosic.pro/app/MTask/{task_id}
**External Updates:** {count} since last session
[END IF]

───────────────────────────────────────────────────────────────
```

</process>

<success_criteria>
- [ ] Project context restored
- [ ] Checkpoint detected if exists
- [ ] Mosic sync (if enabled):
  - [ ] Cross-session updates checked and displayed
  - [ ] Task status updated to "In Progress"
  - [ ] Resume comment added
  - [ ] last_sync timestamp updated
- [ ] Status presented clearly
- [ ] Next actions offered
</success_criteria>
