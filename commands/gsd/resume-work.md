---
name: gsd:resume-work
description: Resume work with full context restoration, validation, and user clarification
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Restore complete project context from Mosic, validate against local config, clarify with user when ambiguous, and provide clear actionable next steps.

**Key principle:** Mosic is the source of truth. Config.json may be stale. When in doubt, ask the user.

Handles:
- Config vs Mosic validation (detect stale/wrong config)
- Workflow state inference from task status, comments, and pages
- User clarification when state is ambiguous
- Full task context loading (description, comments, pages, checklists)
- Clear next action recommendation with loaded context
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
```

Load Mosic tools:
```
ToolSearch("mosic project task page comment search")
```

---

## 1. Load Mosic Reality (Source of Truth)

Display:
```
-------------------------------------------
 GSD > ANALYZING PROJECT STATE
-------------------------------------------

Loading from Mosic...
```

```
# Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

IF not project:
  ERROR: "Project not found in Mosic. Run /gsd:new-project first."
  EXIT

# Categorize phases by actual Mosic status
mosic_in_progress_phases = project.task_lists.filter(tl => tl.status == "In Progress")
mosic_completed_phases = project.task_lists.filter(tl => tl.done or tl.status == "Completed")
mosic_pending_phases = project.task_lists.filter(tl =>
  tl.status in ["ToDo", "Planned", "Backlog"] and not tl.done
)

# Load all in-progress tasks across all phases
all_in_progress_tasks = []
FOR each task_list in project.task_lists:
  tl = mosic_get_task_list(task_list.name, { include_tasks: true })
  FOR each task in tl.tasks:
    IF task.status == "In Progress" and not task.done:
      all_in_progress_tasks.push({
        task: task,
        phase: task_list
      })

# Determine actual current phase (from Mosic)
mosic_current_phase = mosic_in_progress_phases[0] or mosic_pending_phases[0]
mosic_current_task = all_in_progress_tasks[0]?.task or null
```

---

## 2. Load Config Claims and Detect Staleness

```
# What config claims
config_phase_id = config.mosic.session?.active_phase
config_task_id = config.mosic.session?.active_task
config_last_action = config.mosic.session?.last_action
config_last_updated = config.mosic.session?.last_updated

# Calculate staleness
hours_since_update = 0
IF config_last_updated:
  hours_since_update = (now - parse(config_last_updated)) / 3600000

config_is_stale = hours_since_update > 24 or not config_last_updated

# Check for mismatches
phase_mismatch = false
task_mismatch = false

IF config_phase_id and mosic_current_phase:
  phase_mismatch = config_phase_id != mosic_current_phase.name

IF config_task_id and mosic_current_task:
  task_mismatch = config_task_id != mosic_current_task.name

# Also check if config claims a task that's now completed
config_task_completed = false
IF config_task_id:
  config_task = mosic_get_task(config_task_id, { description_format: "plain" })
  IF config_task and config_task.done:
    config_task_completed = true
```

---

## 3. Infer Workflow State from Mosic Activity

```
# Get recent comments on project entities to understand what was happening
recent_project_comments = mosic_list_documents("M Comment", {
  filters: [
    ["reference_doctype", "=", "MProject"],
    ["reference_name", "=", project_id]
  ],
  order_by: "creation desc",
  limit: 5
})

# Get recent task comments if we have an active task
recent_task_comments = []
IF mosic_current_task:
  recent_task_comments = mosic_list_documents("M Comment", {
    filters: [
      ["reference_doctype", "=", "MTask"],
      ["reference_name", "=", mosic_current_task.name]
    ],
    order_by: "creation desc",
    limit: 10
  })

# Infer workflow from comment content and task state
inferred_workflow = "unknown"
workflow_confidence = "low"

# PRIORITY 1: Check for task workflow state first (mid-task discovery)
# This is checked first because it's stored in config and is most reliable
IF config.mosic.session?.task_workflow_level:
  task_workflow_level = config.mosic.session.task_workflow_level
  active_task_id = config.mosic.session.active_task

  IF active_task_id:
    active_task = mosic_get_task(active_task_id, { description_format: "plain" })

    IF active_task and not active_task.done:
      # Task workflow is active
      inferred_workflow = "task_workflow_" + task_workflow_level
      workflow_confidence = "high"

      # Check task state to determine where in workflow
      task_pages = mosic_get_entity_pages("MTask", active_task_id)
      task_plan_page = task_pages.find(p => p.title.includes("Plan"))
      task_research_page = task_pages.find(p => p.title.includes("Research"))
      task_context_page = task_pages.find(p => p.title.includes("Context"))

      task_subtasks = mosic_search_tasks({
        workspace_id: workspace_id,
        filters: { parent_task: active_task_id }
      })

      IF task_subtasks.results.length > 0:
        # Has subtasks - either planned or executing
        incomplete_subtasks = task_subtasks.results.filter(t => not t.done)
        IF incomplete_subtasks.length > 0:
          inferred_workflow = "task_executing"
        ELSE:
          inferred_workflow = "task_needs_verification"
      ELIF task_plan_page:
        inferred_workflow = "task_ready_to_execute"
      ELIF task_research_page:
        inferred_workflow = "task_needs_planning"
      ELIF task_context_page:
        inferred_workflow = "task_needs_research"
      ELSE:
        # Just created, workflow level determines next step
        IF task_workflow_level == "quick":
          inferred_workflow = "task_quick_pending"
        ELIF task_workflow_level == "full":
          inferred_workflow = "task_needs_discussion"
        ELSE:
          inferred_workflow = "task_needs_planning"

    ELIF active_task and active_task.done:
      # Task completed but workflow state not cleared
      inferred_workflow = "task_complete"
      workflow_confidence = "medium"

# PRIORITY 2: Check comment patterns for workflow hints
IF inferred_workflow == "unknown":
  all_recent_comments = [...recent_project_comments, ...recent_task_comments]
  FOR each comment in all_recent_comments:
    content = comment.content.toLowerCase()

    IF content contains "execution started" or content contains "executing":
      inferred_workflow = "executing"
      workflow_confidence = "high"
      BREAK
    ELIF content contains "planning" or content contains "plan created":
      inferred_workflow = "planning"
      workflow_confidence = "high"
      BREAK
    ELIF content contains "research" or content contains "investigating":
      inferred_workflow = "researching"
      workflow_confidence = "medium"
      BREAK
    ELIF content contains "verification" or content contains "verifying":
      inferred_workflow = "verifying"
      workflow_confidence = "high"
      BREAK
    ELIF content contains "checkpoint" and content contains "awaiting":
      inferred_workflow = "checkpoint_pending"
      workflow_confidence = "high"
      BREAK
    ELIF content contains "session resumed":
      inferred_workflow = "resumed_previously"
      workflow_confidence = "low"  # Need to dig deeper

# PRIORITY 3: If still unknown, infer from task/phase state
IF inferred_workflow == "unknown" or workflow_confidence == "low":
  IF mosic_current_phase:
    phase = mosic_get_task_list(mosic_current_phase.name, { include_tasks: true })
    plan_tasks = phase.tasks.filter(t => t.title starts with "Plan")

    IF plan_tasks.length == 0:
      # No plans exist - needs planning or discussion
      phase_pages = mosic_get_entity_pages("MTask List", mosic_current_phase.name)
      context_page = phase_pages.find(p => p.title contains "Context")
      research_page = phase_pages.find(p => p.title contains "Research")

      IF not context_page and not research_page:
        inferred_workflow = "needs_discussion"
      ELSE:
        inferred_workflow = "needs_planning"
      workflow_confidence = "medium"

    ELIF all_in_progress_tasks.length > 0:
      inferred_workflow = "executing"
      workflow_confidence = "medium"

    ELIF plan_tasks.every(t => t.done):
      # All plans done - check for verification
      verification_page = phase_pages.find(p => p.title contains "Verification")
      IF verification_page:
        inferred_workflow = "phase_complete"
      ELSE:
        inferred_workflow = "needs_verification"
      workflow_confidence = "medium"

    ELSE:
      # Plans exist but not started
      inferred_workflow = "ready_to_execute"
      workflow_confidence = "medium"
```

---

## 4. Determine if User Clarification is Needed

```
needs_clarification = false
clarification_reason = ""

# Reasons to ask user:
IF config_is_stale and hours_since_update > 48:
  needs_clarification = true
  clarification_reason = "Config hasn't been updated in " + Math.round(hours_since_update) + " hours"

ELIF phase_mismatch:
  needs_clarification = true
  clarification_reason = "Config says Phase '" + config_phase_title + "' but Mosic shows '" + mosic_current_phase.title + "' is active"

ELIF task_mismatch and not config_task_completed:
  needs_clarification = true
  clarification_reason = "Config says task '" + config_task_id + "' but Mosic shows different task in progress"

ELIF config_task_completed:
  needs_clarification = true
  clarification_reason = "Task '" + config_task_id + "' from config is now completed in Mosic"

ELIF workflow_confidence == "low" and all_in_progress_tasks.length > 1:
  needs_clarification = true
  clarification_reason = "Multiple tasks in progress, unclear which to continue"

ELIF inferred_workflow == "unknown":
  needs_clarification = true
  clarification_reason = "Unable to determine what workflow was active"
```

---

## 5. Ask User for Clarification (if needed)

```
IF needs_clarification:
  Display:
  """
  -------------------------------------------
   CLARIFICATION NEEDED
  -------------------------------------------

  {clarification_reason}

  Let me help you get back on track.
  """

  # Build contextual options based on what we found
  options = []

  IF mosic_in_progress_phases.length > 0:
    FOR each phase in mosic_in_progress_phases:
      options.push({
        label: "Phase: " + phase.title,
        description: "Continue work on " + phase.title
      })

  IF all_in_progress_tasks.length > 0:
    FOR each item in all_in_progress_tasks.slice(0, 2):
      options.push({
        label: item.task.identifier + ": " + item.task.title.substring(0, 30),
        description: "Continue this specific task"
      })

  IF mosic_pending_phases.length > 0:
    options.push({
      label: "Start next phase",
      description: mosic_pending_phases[0].title
    })

  # Always offer "let me explain"
  # Note: "Other" is automatically added by AskUserQuestion

  AskUserQuestion({
    questions: [{
      question: "What were you working on?",
      header: "Resume",
      options: options.slice(0, 4),  # Max 4 options
      multiSelect: false
    }]
  })

  # Process user response
  user_selection = await response

  IF user_selection is phase:
    mosic_current_phase = selected_phase
    # Re-analyze this phase
    phase = mosic_get_task_list(mosic_current_phase.name, { include_tasks: true })
    mosic_current_task = phase.tasks.find(t => t.status == "In Progress") or phase.tasks.find(t => not t.done)

  ELIF user_selection is task:
    mosic_current_task = selected_task
    mosic_current_phase = task's parent phase

  ELIF user_selection is "Other" (custom input):
    # Parse user's explanation
    # Try to match to Mosic entities
    # If still unclear, ask follow-up

    AskUserQuestion({
      questions: [{
        question: "Which phase number were you on? (e.g., 1, 2, 3)",
        header: "Phase",
        options: project.task_lists.map(tl => ({
          label: "Phase " + extract_phase_num(tl.title),
          description: tl.title
        })).slice(0, 4)
      }]
    })
```

---

## 6. Load Full Task Context

Once we have the confirmed current task/phase:

```
# Load comprehensive task context
task_context = null

IF mosic_current_task:
  # Get task with full details
  task_context = {
    task: mosic_get_task(mosic_current_task.name, {
      description_format: "markdown"
    }),
    comments: [],
    pages: [],
    checklists: [],
    dependencies: []
  }

  # Load task comments (progress notes, checkpoints)
  task_context.comments = mosic_list_documents("M Comment", {
    filters: [
      ["reference_doctype", "=", "MTask"],
      ["reference_name", "=", mosic_current_task.name]
    ],
    order_by: "creation desc",
    limit: 10
  })

  # Load task pages (plan page, summary page if exists)
  task_context.pages = mosic_get_entity_pages("MTask", mosic_current_task.name, {
    include_subtree: false
  })

  # Load plan page content if exists
  plan_page = task_context.pages.find(p => p.title contains "Plan" or p.page_type == "Spec")
  IF plan_page:
    task_context.plan_content = mosic_get_page(plan_page.name, {
      content_format: "markdown"
    }).content

  # Load checklists (acceptance criteria)
  task_with_checklists = mosic_get_task(mosic_current_task.name, {
    include_checklists: true
  })
  task_context.checklists = task_with_checklists.checklists or []

  # Load dependencies
  task_context.dependencies = mosic_get_document_relations("MTask", mosic_current_task.name, {
    relation_type: "Depends"
  })

  # Check for blocking tasks
  blocking_tasks = task_context.dependencies.filter(d =>
    d.relation_type == "Depends" and not d.target_done
  )

# Load phase context
phase_context = null

IF mosic_current_phase:
  phase = mosic_get_task_list(mosic_current_phase.name, { include_tasks: true })

  phase_context = {
    phase: phase,
    pages: mosic_get_entity_pages("MTask List", mosic_current_phase.name),
    total_tasks: phase.tasks.length,
    completed_tasks: phase.tasks.filter(t => t.done).length,
    in_progress_tasks: phase.tasks.filter(t => t.status == "In Progress" and not t.done),
    pending_tasks: phase.tasks.filter(t => not t.done and t.status != "In Progress")
  }

  # Load key phase pages
  phase_context.research_page = phase_context.pages.find(p => p.title contains "Research")
  phase_context.context_page = phase_context.pages.find(p => p.title contains "Context")
  phase_context.verification_page = phase_context.pages.find(p => p.title contains "Verification")

  # Calculate phase progress
  phase_context.progress_pct = Math.round(
    (phase_context.completed_tasks / phase_context.total_tasks) * 100
  ) or 0
```

---

## 7. Check for Pending Checkpoints or Blockers

```
checkpoint_pending = null
blockers = []

# Check recent comments for checkpoint
IF task_context:
  FOR each comment in task_context.comments:
    IF comment.content contains "CHECKPOINT" and comment.content contains "Awaiting":
      checkpoint_pending = {
        task: mosic_current_task.identifier,
        comment: comment.content,
        created: comment.creation
      }
      BREAK

# Check for blocking dependencies
IF task_context and task_context.dependencies:
  FOR each dep in task_context.dependencies:
    IF dep.relation_type == "Depends":
      dep_task = mosic_get_task(dep.target_name, { description_format: "plain" })
      IF dep_task and not dep_task.done:
        blockers.push({
          identifier: dep_task.identifier,
          title: dep_task.title,
          status: dep_task.status
        })

# Check for stuck tasks (in progress too long)
stuck_tasks = []
IF phase_context:
  FOR each task in phase_context.in_progress_tasks:
    # If task has been in progress for a while with no recent comments
    task_comments = mosic_list_documents("M Comment", {
      filters: [
        ["reference_doctype", "=", "MTask"],
        ["reference_name", "=", task.name]
      ],
      order_by: "creation desc",
      limit: 1
    })

    last_activity = task_comments[0]?.creation or task.modified
    hours_inactive = (now - parse(last_activity)) / 3600000

    IF hours_inactive > 4:
      stuck_tasks.push({
        identifier: task.identifier,
        title: task.title,
        hours_inactive: Math.round(hours_inactive)
      })
```

---

## 8. Present Comprehensive Status

```
# Calculate overall progress
total_phases = project.task_lists.length
completed_phases = mosic_completed_phases.length
progress_pct = Math.round((completed_phases / total_phases) * 100)
progress_bar = "█".repeat(Math.floor(progress_pct/10)) + "░".repeat(10 - Math.floor(progress_pct/10))

Display:
"""
-------------------------------------------
 GSD > PROJECT STATUS
-------------------------------------------

**Project:** {project.title}
**Progress:** [{progress_bar}] {progress_pct}%
  Phases: {completed_phases}/{total_phases} complete

---

**Current Phase:** {mosic_current_phase ? mosic_current_phase.title : "None active"}
{IF phase_context:}
  Progress: {phase_context.completed_tasks}/{phase_context.total_tasks} tasks ({phase_context.progress_pct}%)
  In Progress: {phase_context.in_progress_tasks.length}
  Pending: {phase_context.pending_tasks.length}

{IF mosic_current_task:}
**Current Task:** {mosic_current_task.identifier} - {mosic_current_task.title}
  Status: {mosic_current_task.status}
  {IF task_context.checklists.length > 0:}
  Checklist: {task_context.checklists.filter(c => c.done).length}/{task_context.checklists.length} complete
  {ENDIF}

---

**Workflow State:** {inferred_workflow} (confidence: {workflow_confidence})
**Last Activity:** {format_relative_time(config_last_updated or "Unknown")}

{IF checkpoint_pending:}
-------------------------------------------
 ⏸️  CHECKPOINT PENDING
-------------------------------------------
Task {checkpoint_pending.task} is awaiting your response.

{ENDIF}

{IF blockers.length > 0:}
-------------------------------------------
 🚫 BLOCKED BY
-------------------------------------------
{FOR each blocker in blockers:}
- {blocker.identifier}: {blocker.title} ({blocker.status})
{ENDFOR}

{ENDIF}

{IF stuck_tasks.length > 0:}
-------------------------------------------
 ⚠️  TASKS MAY NEED ATTENTION
-------------------------------------------
{FOR each task in stuck_tasks:}
- {task.identifier}: {task.title} (inactive {task.hours_inactive}h)
{ENDFOR}

{ENDIF}

Mosic: https://mosic.pro/app/MProject/{project_id}

---
"""
```

---

## 9. Determine Clear Next Action

```
# Determine the single best next action based on all context
next_action = null
next_command = null
action_context = ""

# Priority order:
# 0. Task workflow in progress → continue task workflow
# 1. Checkpoint pending → respond to checkpoint
# 2. Blockers → resolve blockers
# 3. Task in progress → continue task
# 4. Phase ready to execute → execute phase
# 5. Phase needs planning → plan phase
# 6. Phase needs discussion → discuss phase
# 7. All phases complete → audit milestone

# Handle task workflow states first (highest priority)
IF inferred_workflow.startsWith("task_"):
  active_task_id = config.mosic.session?.active_task
  active_task = mosic_get_task(active_task_id, { description_format: "plain" })
  task_identifier = active_task?.identifier or "task"

  IF inferred_workflow == "task_executing":
    next_action = "Continue executing " + task_identifier
    action_context = "Task has subtasks in progress."
    next_command = "/gsd:execute-task " + task_identifier

  ELIF inferred_workflow == "task_ready_to_execute":
    next_action = "Execute task " + task_identifier
    action_context = "Task is planned. Ready to execute subtasks."
    next_command = "/gsd:execute-task " + task_identifier

  ELIF inferred_workflow == "task_needs_planning":
    next_action = "Plan task " + task_identifier
    action_context = "Task has research. Create execution plan."
    next_command = "/gsd:plan-task " + task_identifier

  ELIF inferred_workflow == "task_needs_research":
    next_action = "Research task " + task_identifier
    action_context = "Task has context. Research implementation approach."
    next_command = "/gsd:research-task " + task_identifier

  ELIF inferred_workflow == "task_needs_discussion":
    next_action = "Discuss task " + task_identifier
    action_context = "Full workflow task. Gather context first."
    next_command = "/gsd:discuss-task " + task_identifier

  ELIF inferred_workflow == "task_quick_pending":
    next_action = "Execute quick task " + task_identifier
    action_context = "Quick workflow task ready to execute."
    next_command = "/gsd:execute-task " + task_identifier

  ELIF inferred_workflow == "task_needs_verification":
    next_action = "Verify task " + task_identifier
    action_context = "All subtasks complete. Verify task achieved goal."
    next_command = "/gsd:verify-task " + task_identifier

  ELIF inferred_workflow == "task_complete":
    next_action = "Task complete - continue phase"
    action_context = "Task " + task_identifier + " completed. Resume phase work."
    phase_num = extract_phase_number(mosic_current_phase)
    next_command = "/gsd:execute-phase " + phase_num

    # Clear stale task workflow state
    config.mosic.session.active_task = null
    config.mosic.session.task_workflow_level = null
    config.mosic.session.paused_for_task = false

ELIF checkpoint_pending:
  next_action = "Respond to checkpoint"
  action_context = "Task " + checkpoint_pending.task + " paused at checkpoint. Review and respond."
  # No specific command - just continue conversation

ELIF blockers.length > 0:
  next_action = "Resolve blockers"
  action_context = blockers.length + " task(s) blocking progress. Complete them first."
  blocker_phase = find_phase_for_task(blockers[0].identifier)
  next_command = "/gsd:execute-phase " + blocker_phase

ELIF inferred_workflow == "executing" and mosic_current_task:
  next_action = "Continue executing " + mosic_current_task.identifier
  action_context = "Task is in progress. Continue from where you left off."
  phase_num = extract_phase_number(mosic_current_phase)
  next_command = "/gsd:execute-phase " + phase_num

ELIF inferred_workflow == "ready_to_execute":
  next_action = "Execute phase " + mosic_current_phase.title
  action_context = "Plans are ready. Start execution."
  phase_num = extract_phase_number(mosic_current_phase)
  next_command = "/gsd:execute-phase " + phase_num

ELIF inferred_workflow == "needs_planning":
  next_action = "Plan phase " + mosic_current_phase.title
  action_context = "Research complete. Create execution plans."
  phase_num = extract_phase_number(mosic_current_phase)
  next_command = "/gsd:plan-phase " + phase_num

ELIF inferred_workflow == "needs_discussion":
  next_action = "Discuss phase " + mosic_current_phase.title
  action_context = "New phase. Gather context and clarify approach first."
  phase_num = extract_phase_number(mosic_current_phase)
  next_command = "/gsd:discuss-phase " + phase_num

ELIF inferred_workflow == "needs_verification":
  next_action = "Verify phase " + mosic_current_phase.title
  action_context = "All tasks complete. Verify phase goal is met."
  phase_num = extract_phase_number(mosic_current_phase)
  next_command = "/gsd:execute-phase " + phase_num  # Triggers verification

ELIF inferred_workflow == "phase_complete" and mosic_pending_phases.length > 0:
  next_phase = mosic_pending_phases[0]
  next_action = "Start next phase: " + next_phase.title
  action_context = "Current phase complete. Move to next phase."
  phase_num = extract_phase_number(next_phase)
  next_command = "/gsd:discuss-phase " + phase_num

ELIF mosic_completed_phases.length == total_phases:
  next_action = "Audit milestone"
  action_context = "All phases complete! Verify overall requirements."
  next_command = "/gsd:audit-milestone"

ELSE:
  next_action = "Review project status"
  action_context = "Unclear state. Review in Mosic and decide next steps."
  next_command = "/gsd:progress"
```

---

## 10. Present Recommended Next Step

```
Display:
"""
-------------------------------------------
 RECOMMENDED NEXT STEP
-------------------------------------------

**{next_action}**

{action_context}

{IF task_context and task_context.plan_content:}
---

**Task Plan Summary:**
{extract_summary(task_context.plan_content, 500)}

{IF task_context.checklists.length > 0:}
**Remaining Checklist Items:**
{FOR each item in task_context.checklists.filter(c => not c.done):}
- [ ] {item.title}
{ENDFOR}
{ENDIF}

{ENDIF}

---

{IF next_command:}
## ▶ Next Up

`{next_command}`

<sub>`/clear` first → fresh context window</sub>

---
{ENDIF}

**Also available:**
- `/gsd:progress` - detailed project status
- `/gsd:quick` - handle unrelated quick task
- View project in Mosic: https://mosic.pro/app/MProject/{project_id}

---
"""

# Offer choice if user wants different action
AskUserQuestion({
  questions: [{
    question: "Proceed with recommended action, or choose different?",
    header: "Action",
    options: [
      { label: "Proceed (Recommended)", description: next_action },
      { label: "Different phase", description: "Work on a different phase" },
      { label: "Quick task", description: "Handle something unrelated first" },
      { label: "Just show status", description: "Don't take action yet" }
    ],
    multiSelect: false
  }]
})
```

---

## 11. Update Config and Session State

```
# Update config with validated state
config.mosic.session = {
  active_phase: mosic_current_phase?.name or null,
  active_task: mosic_current_task?.name or null,
  last_action: "resume-work",
  last_updated: new Date().toISOString(),
  inferred_workflow: inferred_workflow,
  workflow_confidence: workflow_confidence
}

# If we did clarification, note it
IF needs_clarification:
  config.mosic.session.recovery_note = "User clarified on " + new Date().toISOString()

# Update current phase/task IDs at top level for quick access
config.mosic.current_phase_id = mosic_current_phase?.name or null
config.mosic.current_task_id = mosic_current_task?.name or null

write config.json

# Add session resume comment to project
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace: workspace_id,
  reference_doctype: "MProject",
  reference_name: project_id,
  content: "<p><strong>Session Resumed</strong></p>" +
    "<p><strong>Phase:</strong> " + (mosic_current_phase?.title or "None") + "</p>" +
    "<p><strong>Task:</strong> " + (mosic_current_task?.identifier or "None") + "</p>" +
    "<p><strong>Workflow:</strong> " + inferred_workflow + "</p>" +
    (needs_clarification ? "<p><em>User provided clarification</em></p>" : "")
})
```

</process>

<quick_resume>
If user says "continue" or "go" without needing detailed status:

```
# Load state silently
# Validate quickly
# If no issues, show brief status and command

IF no clarification needed and high confidence:
  Display:
  """
  Continuing from Phase {N}: {phase.title}
  Task: {task.identifier} - {task.title}

  `{next_command}`

  <sub>`/clear` first → fresh context window</sub>
  """
ELSE:
  # Fall back to full resume flow
  Run full process
```
</quick_resume>

<success_criteria>
- [ ] Mosic state loaded (source of truth)
- [ ] Config validated against Mosic reality
- [ ] Staleness and mismatches detected
- [ ] User clarification requested when ambiguous
- [ ] Workflow state inferred from comments, task status, pages
- [ ] Full task context loaded (description, comments, pages, checklists)
- [ ] Checkpoints and blockers identified
- [ ] Clear single next action determined
- [ ] Next action presented with relevant context
- [ ] Config updated with validated state
- [ ] Session resume comment added to Mosic
</success_criteria>
