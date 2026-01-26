<purpose>
Mark current phase complete and advance to next. This is the natural point where progress tracking and project page evolution happen.

"Planning next phase" = "current phase is done"
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, tasks, pages)
- All documentation is stored in Mosic pages
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

// Get project pages
project_pages = mosic_get_entity_pages("MProject", project_id)
requirements_page = project_pages.find(p => p.title.includes("Requirements"))
roadmap_page = project_pages.find(p => p.title.includes("Roadmap"))

// Find current phase (in progress)
current_phase_list = project.task_lists.find(tl => tl.status === "In Progress")

if (!current_phase_list) {
  console.log("No phase in progress to transition from.")
  exit()
}

// Get phase with tasks
current_phase = mosic_get_task_list(current_phase_list.name, { include_tasks: true })
```

</step>

<step name="verify_completion">
Check current phase has all tasks complete:

```javascript
total_tasks = current_phase.tasks.length
completed_tasks = current_phase.tasks.filter(t => t.done).length
incomplete_tasks = current_phase.tasks.filter(t => !t.done)
```

**Verification logic:**

- Count total tasks
- Count completed tasks
- If counts match: all tasks complete

**If all tasks complete:**

<if mode="yolo">

```
⚡ Auto-approved: Transition Phase ${CURRENT} → Phase ${NEXT}
Phase ${CURRENT} complete — all ${total_tasks} tasks finished.

Proceeding to mark done and advance...
```

Proceed directly to mark_phase_complete step.

</if>

<if mode="interactive">

Ask: "Phase ${CURRENT} complete — all ${total_tasks} tasks finished. Ready to mark done and move to Phase ${NEXT}?"

Wait for confirmation before proceeding.

</if>

**If tasks incomplete:**

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete tasks is destructive — ALWAYS prompt regardless of mode.

Present:

```
Phase ${CURRENT} has incomplete tasks:
${incomplete_tasks.map(t => "- " + t.identifier + ": " + t.title + " ✗ Incomplete").join("\n")}

⚠️ Safety rail: Skipping tasks requires confirmation (destructive action)

Options:
1. Continue current phase (complete remaining tasks)
2. Mark complete anyway (skip remaining tasks)
3. Review what's left
```

Wait for user decision.

</step>

<step name="mark_phase_complete">
**Mark phase complete in Mosic:**

```javascript
// Update phase task list status
mosic_update_document("MTask List", current_phase_list.name, {
  status: "Completed",
  description: current_phase.description + "\n\n---\n\n✅ **Phase Complete**\n" +
    "- Tasks: " + completed_tasks + "/" + total_tasks + "\n" +
    "- Completed: " + format_date(now)
})

// Add completion comment
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask List",
  reference_name: current_phase_list.name,
  content: "✅ **Phase Complete**\n\n" +
    "All " + completed_tasks + " tasks finished.\n" +
    "Transitioning to next phase."
})
```

</step>

<step name="find_next_phase">
**Identify next phase:**

```javascript
// Sort task lists by creation order or identifier
sorted_phases = project.task_lists.sort((a, b) => {
  // Extract phase number from identifier or title
  numA = extract_phase_number(a)
  numB = extract_phase_number(b)
  return numA - numB
})

// Find index of current phase
current_index = sorted_phases.findIndex(tl => tl.name === current_phase_list.name)

// Get next phase
next_phase_list = sorted_phases[current_index + 1]

if (!next_phase_list) {
  // No more phases - milestone complete
  MILESTONE_COMPLETE = true
} else {
  MILESTONE_COMPLETE = false
  next_phase = mosic_get_task_list(next_phase_list.name)
}
```

</step>

<step name="update_next_phase_status">
**If next phase exists, mark it in progress:**

```javascript
if (!MILESTONE_COMPLETE) {
  mosic_update_document("MTask List", next_phase_list.name, {
    status: "In Progress"
  })

  // Add transition comment
  mosic_create_document("M Comment", {
    workspace_id: workspace_id,
    reference_doctype: "MTask List",
    reference_name: next_phase_list.name,
    content: "🚀 **Phase Started**\n\n" +
      "Transitioned from Phase " + extract_phase_number(current_phase_list) + ".\n" +
      "Ready for planning."
  })
}
```

</step>

<step name="evolve_requirements">
**Evolve requirements page to reflect learnings from completed phase:**

Read phase summary pages:

```javascript
phase_pages = mosic_get_entity_pages("MTask List", current_phase_list.name)
summary_page = phase_pages.find(p => p.title.includes("Summary"))

if (summary_page) {
  summary_content = mosic_get_page(summary_page.name, { content_format: "markdown" })
}
```

**Assess requirement changes:**

1. **Requirements validated?**
   - Any requirements shipped in this phase?
   - Move to Validated section

2. **Requirements invalidated?**
   - Any requirements discovered to be unnecessary or wrong?
   - Note why in Out of Scope section

3. **Requirements emerged?**
   - Any new requirements discovered during building?
   - Add to Active section

4. **Decisions to log?**
   - Extract decisions from summary pages
   - Add to Key Decisions section

**Update requirements page:**

```javascript
if (requirements_page && has_requirement_changes) {
  current_content = mosic_get_page(requirements_page.name, { content_format: "full" })

  mosic_update_content_blocks(requirements_page.name, {
    // Update validated section, active section, etc.
    // Based on analysis above
  })

  // Add evolution comment
  mosic_create_document("M Comment", {
    workspace_id: workspace_id,
    reference_doctype: "M Page",
    reference_name: requirements_page.name,
    content: "📝 **Requirements Evolved**\n\n" +
      "After Phase " + extract_phase_number(current_phase_list) + ":\n" +
      "- Validated: " + validated_count + "\n" +
      "- Emerged: " + emerged_count + "\n" +
      "- Invalidated: " + invalidated_count
  })
}
```

</step>

<step name="update_roadmap">
**Update roadmap page:**

```javascript
if (roadmap_page) {
  mosic_update_content_blocks(roadmap_page.name, {
    // Mark completed phase as done
    // Update progress table
    // Highlight next phase
  })
}
```

</step>

<step name="add_transition_comment">
**Add transition comment to project:**

```javascript
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MProject",
  reference_name: project_id,
  content: "🔄 **Phase Transition**\n\n" +
    "- Completed: Phase " + extract_phase_number(current_phase_list) + " (" + current_phase.title + ")\n" +
    (MILESTONE_COMPLETE ? "- Status: All phases complete!" :
     "- Starting: Phase " + extract_phase_number(next_phase_list) + " (" + next_phase.title + ")") + "\n\n" +
    "Requirements validated: " + validated_count + "\n" +
    "Requirements emerged: " + emerged_count
})
```

</step>

<step name="update_config">
**Update config.json:**

```javascript
config.last_sync = new Date().toISOString()

// Write config.json
```

```bash
git add config.json
git commit -m "chore: transition from phase ${CURRENT} to phase ${NEXT}"
```

</step>

<step name="offer_next_phase">
**Present next steps:**

**If more phases remain:**

```
## ✓ Phase ${CURRENT}: ${current_phase.title} Complete

---

## ▶ Next Up

**Phase ${NEXT}: ${next_phase.title}** — ${next_phase.description}

`/gsd:plan-phase ${NEXT}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:discuss-phase ${NEXT}` — gather context first
- `/gsd:research-phase ${NEXT}` — investigate unknowns
- Review phase in Mosic

---
```

**If milestone complete:**

```
## ✓ Phase ${CURRENT}: ${current_phase.title} Complete

🎉 Milestone is 100% complete — all ${total_phases} phases finished!

---

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

`/gsd:complete-milestone`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Review accomplishments in Mosic
- `/gsd:add-phase` — add another phase before completing

---
```

</step>

</process>

<implicit_tracking>
Progress tracking is IMPLICIT: planning phase N implies phases 1-(N-1) complete. No separate progress step—forward motion IS progress.
</implicit_tracking>

<partial_completion>
If user wants to move on but phase isn't fully complete:

```
Phase ${CURRENT} has incomplete tasks:
${incomplete_tasks.map(t => "- " + t.identifier + ": " + t.title).join("\n")}

Options:
1. Mark complete anyway (tasks weren't needed)
2. Defer work to later phase
3. Stay and finish current phase
```

Respect user judgment — they know if work matters.

**If marking complete with incomplete tasks:**
- Update task list description noting skipped tasks
- Add comment explaining partial completion
</partial_completion>

<success_criteria>
Transition is complete when:

- [ ] Mosic context loaded (project, task lists, pages)
- [ ] Current phase tasks verified (all complete or user chose to skip)
- [ ] Current phase task list marked "Completed"
- [ ] Completion comment added to current phase
- [ ] Next phase task list marked "In Progress" (if exists)
- [ ] Transition comment added to next phase
- [ ] Requirements page evolved (validated, emerged, invalidated)
- [ ] Roadmap page updated
- [ ] Transition comment added to project
- [ ] config.json updated with last_sync
- [ ] User knows next steps
</success_criteria>
