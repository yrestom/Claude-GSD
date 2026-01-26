<trigger>
Use this workflow when:
- Starting a new session on an existing project
- User says "continue", "what's next", "where were we", "resume"
- Any planning operation when project already exists in Mosic
- User returns after time away from project
</trigger>

<purpose>
Instantly restore full project context from Mosic so "Where were we?" has an immediate, complete answer.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, tasks, pages)
- Session continuity tracked via Mosic comments
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic:**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- task_lists (phase mappings)
- pages (page IDs)
- tags (tag IDs)
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

<step name="determine_current_position">
**Find current position from Mosic state:**

```javascript
// Find in-progress phase
in_progress_phases = project.task_lists.filter(tl => tl.status === "In Progress")
completed_phases = project.task_lists.filter(tl => tl.status === "Completed")
pending_phases = project.task_lists.filter(tl => tl.status === "ToDo" || tl.status === "Planned")

current_phase = in_progress_phases[0] || pending_phases[0]

if (current_phase) {
  // Get phase with tasks
  phase = mosic_get_task_list(current_phase.name, { include_tasks: true })

  // Find in-progress or next task
  in_progress_tasks = phase.tasks.filter(t => !t.done && t.status === "In Progress")
  pending_tasks = phase.tasks.filter(t => !t.done)
  completed_tasks = phase.tasks.filter(t => t.done)

  current_task = in_progress_tasks[0] || pending_tasks[0]
}

// Calculate progress
total_phases = project.task_lists.length
completed_phase_count = completed_phases.length
progress_percent = Math.round((completed_phase_count / total_phases) * 100)
```

</step>

<step name="check_for_changes">
**Check for cross-session changes:**

```javascript
last_sync = config.last_sync

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

<step name="check_incomplete_work">
**Look for incomplete work that needs attention:**

```javascript
// Check for tasks stuck in progress
stuck_tasks = []
for (task_list of project.task_lists) {
  phase = mosic_get_task_list(task_list.name, { include_tasks: true })
  for (task of phase.tasks) {
    if (!task.done && task.status === "In Progress") {
      // Task started but not finished
      stuck_tasks.push({
        identifier: task.identifier,
        title: task.title,
        phase: task_list.title
      })
    }
  }
}

// Check for checkpoint comments awaiting response
checkpoint_comments = []
if (current_task) {
  task_comments = mosic_list_documents("M Comment", {
    filters: [
      ["reference_doctype", "=", "MTask"],
      ["reference_name", "=", current_task.name]
    ]
  })

  for (comment of task_comments) {
    if (comment.content.includes("CHECKPOINT") && comment.content.includes("Awaiting")) {
      checkpoint_comments.push(comment)
    }
  }
}
```

</step>

<step name="present_status">
Present complete project status to user:

```
╔══════════════════════════════════════════════════════════════╗
║  PROJECT STATUS                                               ║
╠══════════════════════════════════════════════════════════════╣
║  Project: ${project.title}                                    ║
║                                                               ║
║  Phase: ${completed_phase_count + 1} of ${total_phases} - ${current_phase?.title || "None in progress"}
║  Task:  ${current_task?.identifier || "None"} - ${current_task?.title || "Ready to plan"}
║  Progress: [${"█".repeat(progress_percent/10)}${"░".repeat(10 - progress_percent/10)}] ${progress_percent}%
║                                                               ║
║  Mosic: https://mosic.pro/app/Project/${project_id}           ║
╚══════════════════════════════════════════════════════════════╝

[If external_changes.length > 0:]
☁️  Changes detected since last session:
    ${external_changes.map(c => "- " + c.type + ": " + c.task).join("\n    ")}

[If stuck_tasks.length > 0:]
⚠️  Tasks in progress (may need attention):
    ${stuck_tasks.map(t => "- " + t.identifier + ": " + t.title).join("\n    ")}

[If checkpoint_comments.length > 0:]
⏸️  Pending checkpoint:
    Task ${current_task.identifier} awaiting response

[If unread_notifications.length > 0:]
🔔 ${unread_notifications.length} unread notification(s)
```

</step>

<step name="determine_next_action">
Based on project state, determine the most logical next action:

**If checkpoint awaiting response:**
→ Primary: Respond to checkpoint
→ Option: Skip and continue

**If task in progress:**
→ Primary: Complete the in-progress task
→ Option: Abandon and start fresh

**If phase in progress, no tasks started:**
→ Primary: Execute next task
→ Option: Review phase plan

**If phase ready to plan:**
→ Check if context/research pages exist for this phase:

```javascript
phase_pages = mosic_get_entity_pages("MTask List", current_phase.name)
context_page = phase_pages.find(p => p.title.includes("Context"))
research_page = phase_pages.find(p => p.title.includes("Research") || p.title.includes("Discovery"))
```

- If no context page:
  → Primary: Discuss phase vision
  → Secondary: Plan directly
- If context exists:
  → Primary: Plan the phase
  → Option: Review context

**If all phases complete:**
→ Primary: Complete milestone
→ Option: Review accomplishments
</step>

<step name="offer_options">
Present contextual options based on project state:

```
What would you like to do?

[Primary action based on state - e.g.:]
1. Execute phase (/gsd:execute-phase ${current_phase_num})
   OR
1. Discuss Phase ${next_phase} context (/gsd:discuss-phase ${next_phase})
   OR
1. Plan Phase ${next_phase} (/gsd:plan-phase ${next_phase})

[Secondary options:]
2. View project in Mosic
3. Review current phase status
4. Something else
```

Wait for user selection.
</step>

<step name="route_to_workflow">
Based on user selection, route to appropriate workflow:

- **Execute phase** → Show command for user to run after clearing:
  ```
  ---

  ## ▶ Next Up

  **Phase ${PHASE}: ${phase.title}** — execute tasks

  `/gsd:execute-phase ${PHASE}`

  <sub>`/clear` first → fresh context window</sub>

  ---
  ```

- **Plan phase** → Show command:
  ```
  ---

  ## ▶ Next Up

  **Phase ${PHASE}: ${phase.title}** — create execution plan

  `/gsd:plan-phase ${PHASE}`

  <sub>`/clear` first → fresh context window</sub>

  ---

  **Also available:**
  - `/gsd:discuss-phase ${PHASE}` — gather context first
  - `/gsd:research-phase ${PHASE}` — investigate unknowns

  ---
  ```

- **View in Mosic** → Provide direct link
- **Something else** → Ask what they need
</step>

<step name="update_session">
Before proceeding, update session tracking:

```javascript
// Add session resume comment to project
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MProject",
  reference_name: project_id,
  content: "<p><strong>Session Resumed</strong></p>" +
    "<p>Position: Phase " + (completed_phase_count + 1) + " of " + total_phases + "</p>" +
    "<p>Action: " + selected_action + "</p>"
})

// Update last sync in config
config.last_sync = new Date().toISOString()
```

This ensures if session ends unexpectedly, next resume knows the state.
</step>

</process>

<quick_resume>
If user says "continue" or "go":
- Load state silently
- Determine primary action
- Execute immediately without presenting options

"Continuing from [state]... [action]"
</quick_resume>

<success_criteria>
Resume is complete when:

- [ ] Mosic context loaded (project, task lists, tasks, pages)
- [ ] Current position determined from task list status
- [ ] Cross-session changes detected and flagged
- [ ] Incomplete/stuck work identified
- [ ] Clear status presented to user
- [ ] Contextual next actions offered
- [ ] User knows exactly where project stands
- [ ] Session resume comment added to project
- [ ] config.json last_sync updated
</success_criteria>
