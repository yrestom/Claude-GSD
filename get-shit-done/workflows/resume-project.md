<trigger>
Use this workflow when:
- Starting a new session on an existing project
- User says "continue", "what's next", "where were we", "resume"
- LLM lost track of current workflow mid-conversation
- Any planning operation when project already exists in Mosic
- User returns after time away from project
- Config.json may be stale or incorrect
</trigger>

<purpose>
Restore full project context from Mosic, validate against local config, clarify with user when state is ambiguous, and provide clear actionable next steps.

**Key principle:** Mosic is the source of truth. Config.json may be stale. When in doubt, ask the user.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, tasks, pages, comments)
- Config.json is validated against Mosic, not trusted blindly
- Session continuity tracked via Mosic comments
- User clarification requested when state is ambiguous
- Config.json updated with validated state after clarification
- No `.planning/` directory operations
</mosic_only>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic (source of truth):**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- task_lists (phase mappings)
- pages (page IDs)
- tags (tag IDs)
- session (active_phase, active_task, last_action, last_updated)
```

```javascript
// Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

if (!project) {
  console.log("Project not found in Mosic. Use /gsd:new-project to create.")
  exit()
}

// Get project pages (overview, requirements, roadmap)
project_pages = mosic_get_entity_pages("MProject", project_id)
overview_page = project_pages.find(p => p.title.includes("Overview"))
roadmap_page = project_pages.find(p => p.title.includes("Roadmap"))
```

</step>

<step name="validate_config_against_mosic">

**Compare config claims against Mosic reality:**

```javascript
// What config claims
config_phase_id = config.mosic?.session?.active_phase
config_task_id = config.mosic?.session?.active_task
config_last_action = config.mosic?.session?.last_action
config_last_updated = config.mosic?.session?.last_updated

// Calculate staleness
hours_since_update = config_last_updated
  ? (Date.now() - new Date(config_last_updated)) / 3600000
  : Infinity

config_is_stale = hours_since_update > 24 || !config_last_updated

// Detect mismatches (will be checked after determining Mosic position)
phase_mismatch = false
task_mismatch = false
config_task_completed = false

// If config claims a task, check if it's now completed
if (config_task_id) {
  config_task = mosic_get_task(config_task_id, { description_format: "plain" })
  if (config_task?.done) config_task_completed = true
}
```

</step>

<step name="determine_current_position">
**Find current position from Mosic state:**

```javascript
// Find in-progress phase
in_progress_phases = project.task_lists.filter(tl => tl.status === "In Progress")
completed_phases = project.task_lists.filter(tl => tl.done || tl.status === "Completed")
pending_phases = project.task_lists.filter(tl =>
  ["ToDo", "Planned", "Backlog"].includes(tl.status) && !tl.done
)

// Load all in-progress tasks across all phases
all_in_progress_tasks = []
for (task_list of project.task_lists) {
  tl = mosic_get_task_list(task_list.name, { include_tasks: true })
  for (task of tl.tasks) {
    if (task.status === "In Progress" && !task.done) {
      all_in_progress_tasks.push({ task, phase: task_list })
    }
  }
}

// Determine actual current phase/task from Mosic
current_phase = in_progress_phases[0] || pending_phases[0]
current_task = all_in_progress_tasks[0]?.task || null

if (current_phase && !current_task) {
  // Get phase with tasks to find next pending task
  phase = mosic_get_task_list(current_phase.name, { include_tasks: true })
  pending_tasks = phase.tasks.filter(t => !t.done)
  current_task = pending_tasks[0]
}

// Calculate progress
total_phases = project.task_lists.length
completed_phase_count = completed_phases.length
progress_percent = Math.round((completed_phase_count / total_phases) * 100)

// Now check for config mismatches
if (config_phase_id && current_phase) {
  phase_mismatch = config_phase_id !== current_phase.name
}
if (config_task_id && current_task) {
  task_mismatch = config_task_id !== current_task.name
}
```

</step>

<step name="infer_workflow_state">
**Determine workflow state from Mosic activity:**

```javascript
// Get recent comments on project to understand what was happening
recent_project_comments = mosic_list_documents("M Comment", {
  filters: [
    ["reference_doctype", "=", "MProject"],
    ["reference_name", "=", project_id]
  ],
  order_by: "creation desc",
  limit: 5
})

// Get recent task comments if we have an active task
recent_task_comments = []
if (current_task) {
  recent_task_comments = mosic_list_documents("M Comment", {
    filters: [
      ["reference_doctype", "=", "MTask"],
      ["reference_name", "=", current_task.name]
    ],
    order_by: "creation desc",
    limit: 10
  })
}

// Infer workflow from comment content
inferred_workflow = "unknown"
workflow_confidence = "low"

all_comments = [...recent_project_comments, ...recent_task_comments]
for (comment of all_comments) {
  content = comment.content.toLowerCase()

  if (content.includes("execution started") || content.includes("executing")) {
    inferred_workflow = "executing"
    workflow_confidence = "high"
    break
  } else if (content.includes("planning") || content.includes("plan created")) {
    inferred_workflow = "planning"
    workflow_confidence = "high"
    break
  } else if (content.includes("research") || content.includes("investigating")) {
    inferred_workflow = "researching"
    workflow_confidence = "medium"
    break
  } else if (content.includes("verification") || content.includes("verifying")) {
    inferred_workflow = "verifying"
    workflow_confidence = "high"
    break
  } else if (content.includes("checkpoint") && content.includes("awaiting")) {
    inferred_workflow = "checkpoint_pending"
    workflow_confidence = "high"
    break
  } else if (content.includes("session resumed")) {
    inferred_workflow = "resumed_previously"
    workflow_confidence = "low"  // Need to dig deeper
  }
}

// If still unknown, infer from task/phase state
if (inferred_workflow === "unknown" || workflow_confidence === "low") {
  if (current_phase) {
    phase = mosic_get_task_list(current_phase.name, { include_tasks: true })
    plan_tasks = phase.tasks.filter(t => t.title.startsWith("Plan"))

    if (plan_tasks.length === 0) {
      // No plans exist - needs planning or discussion
      phase_pages = mosic_get_entity_pages("MTask List", current_phase.name)
      context_page = phase_pages.find(p => p.title.includes("Context"))
      research_page = phase_pages.find(p => p.title.includes("Research"))

      if (!context_page && !research_page) {
        inferred_workflow = "needs_discussion"
      } else {
        inferred_workflow = "needs_planning"
      }
      workflow_confidence = "medium"
    } else if (all_in_progress_tasks.length > 0) {
      inferred_workflow = "executing"
      workflow_confidence = "medium"
    } else if (plan_tasks.every(t => t.done)) {
      // All plans done - check for verification
      phase_pages = mosic_get_entity_pages("MTask List", current_phase.name)
      verification_page = phase_pages.find(p => p.title.includes("Verification"))
      if (verification_page) {
        inferred_workflow = "phase_complete"
      } else {
        inferred_workflow = "needs_verification"
      }
      workflow_confidence = "medium"
    } else {
      // Plans exist but not started
      inferred_workflow = "ready_to_execute"
      workflow_confidence = "medium"
    }
  }
}
```

</step>

<step name="determine_clarification_needed">
**Check if user clarification is required:**

```javascript
needs_clarification = false
clarification_reason = ""

// Reasons to ask user:
if (config_is_stale && hours_since_update > 48) {
  needs_clarification = true
  clarification_reason = "Config hasn't been updated in " + Math.round(hours_since_update) + " hours"
} else if (phase_mismatch) {
  needs_clarification = true
  clarification_reason = "Config says different phase than Mosic shows active"
} else if (task_mismatch && !config_task_completed) {
  needs_clarification = true
  clarification_reason = "Config says different task than Mosic shows in progress"
} else if (config_task_completed) {
  needs_clarification = true
  clarification_reason = "Task from config is now completed in Mosic"
} else if (workflow_confidence === "low" && all_in_progress_tasks.length > 1) {
  needs_clarification = true
  clarification_reason = "Multiple tasks in progress, unclear which to continue"
} else if (inferred_workflow === "unknown") {
  needs_clarification = true
  clarification_reason = "Unable to determine what workflow was active"
}
```

</step>

<step name="ask_user_clarification">
**If clarification needed, ask the user:**

```javascript
if (needs_clarification) {
  // Display clarification reason
  console.log("-------------------------------------------")
  console.log(" CLARIFICATION NEEDED")
  console.log("-------------------------------------------")
  console.log(clarification_reason)
  console.log("Let me help you get back on track.")

  // Build contextual options based on what we found
  options = []

  if (in_progress_phases.length > 0) {
    for (phase of in_progress_phases) {
      options.push({
        label: "Phase: " + phase.title,
        description: "Continue work on " + phase.title
      })
    }
  }

  if (all_in_progress_tasks.length > 0) {
    for (item of all_in_progress_tasks.slice(0, 2)) {
      options.push({
        label: item.task.identifier + ": " + item.task.title.substring(0, 30),
        description: "Continue this specific task"
      })
    }
  }

  if (pending_phases.length > 0) {
    options.push({
      label: "Start next phase",
      description: pending_phases[0].title
    })
  }

  // Ask user (Other option is automatically added)
  AskUserQuestion({
    questions: [{
      question: "What were you working on?",
      header: "Resume",
      options: options.slice(0, 4),
      multiSelect: false
    }]
  })

  // Process user response and update current_phase/current_task accordingly
  // If user selects phase: re-analyze that phase
  // If user selects task: set that as current_task
  // If user selects "Other": ask follow-up about phase number
}
```

</step>

<step name="check_for_changes">
**Check for cross-session changes:**

```javascript
last_sync = config.mosic?.session?.last_updated || config.last_sync

// Check notifications for this project
notifications = mosic_get_document_notifications("MProject", project_id)
unread_notifications = notifications.filter(n => !n.is_read && n.created > last_sync)

// Check for tasks completed outside GSD
external_changes = []
for (task_list of project.task_lists) {
  tasks = mosic_get_task_list(task_list.name, { include_tasks: true })
  for (task of tasks.tasks) {
    if (task.modified > last_sync && task.done) {
      // Task was completed since last sync
      external_changes.push({
        type: "task_completed",
        task: task.title,
        phase: task_list.title
      })
    }
  }
}
```

</step>

<step name="load_full_task_context">
**Load comprehensive context for current task:**

```javascript
task_context = null

if (current_task) {
  task_context = {
    task: mosic_get_task(current_task.name, { description_format: "markdown" }),
    comments: [],
    pages: [],
    checklists: [],
    plan_content: null
  }

  // Load task comments (progress notes, checkpoints)
  task_context.comments = mosic_list_documents("M Comment", {
    filters: [
      ["reference_doctype", "=", "MTask"],
      ["reference_name", "=", current_task.name]
    ],
    order_by: "creation desc",
    limit: 10
  })

  // Load task pages (plan page, summary page if exists)
  task_context.pages = mosic_get_entity_pages("MTask", current_task.name, {
    include_subtree: false
  })

  // Load plan page content if exists
  plan_page = task_context.pages.find(p => p.title.includes("Plan") || p.page_type === "Spec")
  if (plan_page) {
    task_context.plan_content = mosic_get_page(plan_page.name, {
      content_format: "markdown"
    }).content
  }

  // Load checklists (acceptance criteria)
  task_with_checklists = mosic_get_task(current_task.name, { include_checklists: true })
  task_context.checklists = task_with_checklists.checklists || []

  // Load dependencies
  task_context.dependencies = mosic_get_document_relations("MTask", current_task.name)
}

// Load phase context
phase_context = null
if (current_phase) {
  phase = mosic_get_task_list(current_phase.name, { include_tasks: true })
  phase_context = {
    phase: phase,
    pages: mosic_get_entity_pages("MTask List", current_phase.name),
    total_tasks: phase.tasks.length,
    completed_tasks: phase.tasks.filter(t => t.done).length,
    in_progress_tasks: phase.tasks.filter(t => t.status === "In Progress" && !t.done),
    pending_tasks: phase.tasks.filter(t => !t.done && t.status !== "In Progress")
  }

  // Calculate phase progress
  phase_context.progress_pct = Math.round(
    (phase_context.completed_tasks / phase_context.total_tasks) * 100
  ) || 0
}
```

</step>

<step name="check_incomplete_work">
**Look for incomplete work that needs attention:**

```javascript
// Check for tasks stuck in progress (inactive for a while)
stuck_tasks = []
if (phase_context) {
  for (task of phase_context.in_progress_tasks) {
    task_comments = mosic_list_documents("M Comment", {
      filters: [
        ["reference_doctype", "=", "MTask"],
        ["reference_name", "=", task.name]
      ],
      order_by: "creation desc",
      limit: 1
    })

    last_activity = task_comments[0]?.creation || task.modified
    hours_inactive = (Date.now() - new Date(last_activity)) / 3600000

    if (hours_inactive > 4) {
      stuck_tasks.push({
        identifier: task.identifier,
        title: task.title,
        phase: current_phase.title,
        hours_inactive: Math.round(hours_inactive)
      })
    }
  }
}

// Check for checkpoint comments awaiting response
checkpoint_pending = null
if (task_context) {
  for (comment of task_context.comments) {
    if (comment.content.includes("CHECKPOINT") && comment.content.includes("Awaiting")) {
      checkpoint_pending = {
        task: current_task.identifier,
        comment: comment.content,
        created: comment.creation
      }
      break
    }
  }
}

// Check for blocking dependencies
blockers = []
if (task_context && task_context.dependencies) {
  for (dep of task_context.dependencies) {
    if (dep.relation_type === "Depends") {
      dep_task = mosic_get_task(dep.target_name, { description_format: "plain" })
      if (dep_task && !dep_task.done) {
        blockers.push({
          identifier: dep_task.identifier,
          title: dep_task.title,
          status: dep_task.status
        })
      }
    }
  }
}
```

</step>

<step name="present_status">
Present complete project status to user:

```
-------------------------------------------
 GSD > PROJECT STATUS
-------------------------------------------

**Project:** ${project.title}
**Progress:** [${"█".repeat(progress_percent/10)}${"░".repeat(10 - progress_percent/10)}] ${progress_percent}%
  Phases: ${completed_phase_count}/${total_phases} complete

---

**Current Phase:** ${current_phase?.title || "None active"}
[If phase_context:]
  Progress: ${phase_context.completed_tasks}/${phase_context.total_tasks} tasks (${phase_context.progress_pct}%)
  In Progress: ${phase_context.in_progress_tasks.length}
  Pending: ${phase_context.pending_tasks.length}

[If current_task:]
**Current Task:** ${current_task.identifier} - ${current_task.title}
  Status: ${current_task.status}
  [If task_context.checklists.length > 0:]
  Checklist: ${task_context.checklists.filter(c => c.done).length}/${task_context.checklists.length} complete

---

**Workflow State:** ${inferred_workflow} (confidence: ${workflow_confidence})
**Last Activity:** ${format_relative_time(config_last_updated || "Unknown")}

Mosic: https://mosic.pro/app/MProject/${project_id}

---

[If checkpoint_pending:]
-------------------------------------------
 ⏸️  CHECKPOINT PENDING
-------------------------------------------
Task ${checkpoint_pending.task} is awaiting your response.

[If blockers.length > 0:]
-------------------------------------------
 🚫 BLOCKED BY
-------------------------------------------
${blockers.map(b => "- " + b.identifier + ": " + b.title + " (" + b.status + ")").join("\n")}

[If stuck_tasks.length > 0:]
-------------------------------------------
 ⚠️  TASKS MAY NEED ATTENTION
-------------------------------------------
${stuck_tasks.map(t => "- " + t.identifier + ": " + t.title + " (inactive " + t.hours_inactive + "h)").join("\n")}

[If external_changes.length > 0:]
☁️  Changes detected since last session:
${external_changes.map(c => "- " + c.type + ": " + c.task).join("\n")}

[If unread_notifications.length > 0:]
🔔 ${unread_notifications.length} unread notification(s)
```

</step>

<step name="determine_next_action">
**Determine single best next action based on priority:**

```javascript
// Priority order:
// 1. Checkpoint pending → respond to checkpoint
// 2. Blockers → resolve blockers
// 3. Task in progress → continue task
// 4. Phase ready to execute → execute phase
// 5. Phase needs planning → plan phase
// 6. Phase needs discussion → discuss phase
// 7. All phases complete → audit milestone

next_action = null
next_command = null
action_context = ""

if (checkpoint_pending) {
  next_action = "Respond to checkpoint"
  action_context = "Task " + checkpoint_pending.task + " paused at checkpoint. Review and respond."
  // No specific command - just continue conversation
} else if (blockers.length > 0) {
  next_action = "Resolve blockers"
  action_context = blockers.length + " task(s) blocking progress. Complete them first."
  blocker_phase = find_phase_for_task(blockers[0].identifier)
  next_command = "/gsd:execute-phase " + blocker_phase
} else if (inferred_workflow === "executing" && current_task) {
  next_action = "Continue executing " + current_task.identifier
  action_context = "Task is in progress. Continue from where you left off."
  phase_num = extract_phase_number(current_phase)
  next_command = "/gsd:execute-phase " + phase_num
} else if (inferred_workflow === "ready_to_execute") {
  next_action = "Execute phase " + current_phase.title
  action_context = "Plans are ready. Start execution."
  phase_num = extract_phase_number(current_phase)
  next_command = "/gsd:execute-phase " + phase_num
} else if (inferred_workflow === "needs_planning") {
  next_action = "Plan phase " + current_phase.title
  action_context = "Research complete. Create execution plans."
  phase_num = extract_phase_number(current_phase)
  next_command = "/gsd:plan-phase " + phase_num
} else if (inferred_workflow === "needs_discussion") {
  next_action = "Discuss phase " + current_phase.title
  action_context = "New phase. Gather context and clarify approach first."
  phase_num = extract_phase_number(current_phase)
  next_command = "/gsd:discuss-phase " + phase_num
} else if (inferred_workflow === "needs_verification") {
  next_action = "Verify phase " + current_phase.title
  action_context = "All tasks complete. Verify phase goal is met."
  phase_num = extract_phase_number(current_phase)
  next_command = "/gsd:execute-phase " + phase_num  // Triggers verification
} else if (inferred_workflow === "phase_complete" && pending_phases.length > 0) {
  next_phase = pending_phases[0]
  next_action = "Start next phase: " + next_phase.title
  action_context = "Current phase complete. Move to next phase."
  phase_num = extract_phase_number(next_phase)
  next_command = "/gsd:discuss-phase " + phase_num
} else if (completed_phases.length === total_phases) {
  next_action = "Audit milestone"
  action_context = "All phases complete! Verify overall requirements."
  next_command = "/gsd:audit-milestone"
} else {
  next_action = "Review project status"
  action_context = "Unclear state. Review in Mosic and decide next steps."
  next_command = "/gsd:progress"
}
```

</step>

<step name="offer_options">
Present recommended next step with task context:

```
-------------------------------------------
 RECOMMENDED NEXT STEP
-------------------------------------------

**${next_action}**

${action_context}

[If task_context && task_context.plan_content:]
---

**Task Plan Summary:**
${extract_summary(task_context.plan_content, 500)}

[If task_context.checklists.length > 0:]
**Remaining Checklist Items:**
${task_context.checklists.filter(c => !c.done).map(item => "- [ ] " + item.title).join("\n")}

---

[If next_command:]
## ▶ Next Up

`${next_command}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:progress` - detailed project status
- `/gsd:quick` - handle unrelated quick task
- View project in Mosic: https://mosic.pro/app/MProject/${project_id}

---
```

Offer choice if user wants different action:

```javascript
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

Wait for user selection.
</step>

<step name="update_session">
Before proceeding, update session tracking:

```javascript
// Update config with validated state
config.mosic.session = {
  active_phase: current_phase?.name || null,
  active_task: current_task?.name || null,
  last_action: "resume-work",
  last_updated: new Date().toISOString(),
  inferred_workflow: inferred_workflow,
  workflow_confidence: workflow_confidence
}

// If we did clarification, note it
if (needs_clarification) {
  config.mosic.session.recovery_note = "User clarified on " + new Date().toISOString()
}

// Update current phase/task IDs at top level for quick access
config.mosic.current_phase_id = current_phase?.name || null
config.mosic.current_task_id = current_task?.name || null

// Write config
write config.json

// Add session resume comment to project
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace: workspace_id,
  reference_doctype: "MProject",
  reference_name: project_id,
  content: "<p><strong>Session Resumed</strong></p>" +
    "<p><strong>Phase:</strong> " + (current_phase?.title || "None") + "</p>" +
    "<p><strong>Task:</strong> " + (current_task?.identifier || "None") + "</p>" +
    "<p><strong>Workflow:</strong> " + inferred_workflow + "</p>" +
    (needs_clarification ? "<p><em>User provided clarification</em></p>" : "")
})
```

This ensures if session ends unexpectedly, next resume knows the validated state.
</step>

</process>

<quick_resume>
If user says "continue" or "go":
- Load state silently
- Validate quickly
- If no clarification needed and workflow_confidence is high:

```
Continuing from Phase ${phase_num}: ${phase.title}
Task: ${task.identifier} - ${task.title}

`${next_command}`

<sub>`/clear` first → fresh context window</sub>
```

- If clarification needed or low confidence: Fall back to full resume flow
</quick_resume>

<success_criteria>
Resume is complete when:

- [ ] Mosic state loaded (source of truth)
- [ ] Config validated against Mosic reality
- [ ] Staleness and mismatches detected
- [ ] User clarification requested when ambiguous
- [ ] Workflow state inferred from comments, task status, pages
- [ ] Full task context loaded (description, comments, pages, checklists)
- [ ] Checkpoints and blockers identified
- [ ] Clear single next action determined
- [ ] Next action presented with relevant context (plan summary, checklist)
- [ ] Config updated with validated state
- [ ] Session resume comment added to Mosic
- [ ] User knows exactly where project stands and what to do next
</success_criteria>
