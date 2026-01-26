---
name: gsd:remove-phase
description: Remove a future phase from roadmap and renumber subsequent phases
argument-hint: <phase-number>
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - mcp__mosic_pro__*
---

<objective>
Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

Purpose: Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.
Output: MTask List archived/cancelled in Mosic, subsequent phases renumbered.

**Mosic-only architecture:** Phases are MTask Lists in Mosic. Removal archives/cancels the task list.
</objective>

<context>
Load from Mosic MCP:
- config.json → workspace_id, project_id, task_lists mappings
- mosic_get_project(project_id, { include_task_lists: true }) → current phases
- mosic_get_task_list(task_list_id, { include_tasks: true }) → phase details
</context>

<process>

<step name="parse_arguments">
Parse the command arguments:
- Argument is the phase number to remove (integer or decimal)
- Example: `/gsd:remove-phase 17` → phase = 17
- Example: `/gsd:remove-phase 16.1` → phase = 16.1

If no argument provided:

```
ERROR: Phase number required
Usage: /gsd:remove-phase <phase-number>
Example: /gsd:remove-phase 17
```

Exit.
</step>

<step name="load_project">
**Load project and phases from Mosic:**

```bash
WORKSPACE_ID=$(cat config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json | jq -r ".mosic.project_id")
```

```
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })
phases = project.task_lists

# Find target phase
target_phase = phases.find(tl =>
  tl.title.includes("Phase " + target_number)
)
```
</step>

<step name="validate_phase_exists">
Verify the target phase exists:

```
IF !target_phase:
  ERROR: Phase {target} not found in project
  Available phases: [list phase numbers from task lists]
  Exit.
```
</step>

<step name="validate_future_phase">
Verify the phase is a future phase (not started):

```
# Get current phase from config
current_phase = config.session.current_phase_number || 1

IF target_number <= current_phase:
  ERROR: Cannot remove Phase {target}

  Only future phases can be removed:
  - Current phase: {current}
  - Phase {target} is current or completed

  To abandon current work, use /gsd:pause-work instead.
  Exit.

# Check if phase has completed tasks
phase_details = mosic_get_task_list(target_phase.name, { include_tasks: true })
completed_tasks = phase_details.tasks.filter(t => t.done)

IF completed_tasks.length > 0:
  ERROR: Phase {target} has completed work

  Found completed tasks:
  [list completed task titles]

  Cannot remove phases with completed work.
  Exit.
```
</step>

<step name="gather_phase_info">
Collect information about the phase being removed:

```
# Get phase details
target_task_list_id = target_phase.name
target_title = target_phase.title

# Find all subsequent phases that need renumbering
subsequent_phases = phases.filter(tl =>
  extract_phase_number(tl.title) > target_number
).sort_by(tl => extract_phase_number(tl.title))
```
</step>

<step name="confirm_removal">
Present removal summary and confirm:

```
Removing Phase {target}: {Name}

This will:
- Archive: MTask List for Phase {target}
- Renumber {N} subsequent phases:
  - Phase 18 → Phase 17
  - Phase 19 → Phase 18
  [etc.]

Proceed? (y/n)
```

Wait for confirmation.
</step>

<step name="archive_phase">
**Archive the target phase in Mosic:**

```
# Update task list to Cancelled/Archived status
mosic_update_document("MTask List", target_task_list_id, {
  status: "Cancelled",
  title: "[REMOVED] " + target_title,
  description: target_phase.description + "\n\n---\n**REMOVED:** This phase was removed from the roadmap. Historical record preserved."
})

# Remove from config mappings
delete config.mosic.task_lists["phase-" + target_number]
```
</step>

<step name="update_dependencies">
**Update dependency relations:**

```
# Find phases that depended on removed phase
next_phase_num = target_number + 1
prev_phase_num = target_number - 1

PREV_TASK_LIST = config.mosic.task_lists["phase-" + prev_phase_num]
NEXT_TASK_LIST = config.mosic.task_lists["phase-" + next_phase_num]

IF NEXT_TASK_LIST AND PREV_TASK_LIST:
  # Get existing relations for next phase
  existing_relations = mosic_get_document_relations("MTask List", NEXT_TASK_LIST)

  # Remove dependency on removed phase
  FOR each relation in existing_relations:
    IF relation.target_name == target_task_list_id AND relation.relation_type == "Depends":
      mosic_delete_document("M Relation", relation.name)

  # Create new dependency (next → prev, skipping removed)
  mosic_create_document("M Relation", {
    workspace_id: WORKSPACE_ID,
    source_doctype: "MTask List",
    source_name: NEXT_TASK_LIST,
    target_doctype: "MTask List",
    target_name: PREV_TASK_LIST,
    relation_type: "Depends"
  })
```
</step>

<step name="renumber_phases">
**Renumber subsequent phases in Mosic:**

```
FOR each phase in subsequent_phases (in order):
  old_num = extract_phase_number(phase.title)
  new_num = old_num - 1
  old_task_list_id = phase.name

  # Extract phase name without number
  phase_name = phase.title.replace(/Phase \d+(\.\d+)?:\s*/, "")

  # Update task list title and prefix
  mosic_update_document("MTask List", old_task_list_id, {
    title: "Phase " + new_num + ": " + phase_name,
    prefix: "P" + new_num
  })

  # Update config mapping
  delete config.mosic.task_lists["phase-" + old_num]
  config.mosic.task_lists["phase-" + new_num] = old_task_list_id

  # Update phase tag reference
  old_tag = config.mosic.tags.phase_tags["phase-" + old_num]
  delete config.mosic.tags.phase_tags["phase-" + old_num]
  config.mosic.tags.phase_tags["phase-" + new_num] = old_tag
```
</step>

<step name="archive_related_pages">
**Archive pages linked to removed phase:**

```
# Get pages linked to removed phase
removed_pages = mosic_get_entity_pages("MTask List", target_task_list_id)

FOR each page in removed_pages:
  mosic_update_document("M Page", page.name, {
    status: "Archived",
    title: "[REMOVED] " + page.title
  })
```
</step>

<step name="update_config">
**Update config.json:**

```json
{
  "mosic": {
    "task_lists": {
      // Removed phase deleted, subsequent phases renumbered
    },
    "tags": {
      "phase_tags": {
        // Updated mappings
      }
    },
    "last_sync": "[timestamp]"
  }
}
```
</step>

<step name="completion">
Present completion summary:

```
✓ Phase {target} ({original-name}) removed

Changes:
- Archived: MTask List for Phase {target}
- Renumbered: Phases {first-renumbered}-{last-old} → {first-renumbered-1}-{last-new}
- Dependencies: Phase {next} now depends on Phase {prev}
- Pages: {N} pages archived

Current roadmap: {total-remaining} phases
Mosic: https://mosic.pro/app/MProject/{PROJECT_ID}

---

## What's Next

Would you like to:
- `/gsd:progress` — see updated roadmap status
- Continue with current phase
- Review project in Mosic

---
```
</step>

</process>

<anti_patterns>
- Don't remove completed phases (have done tasks)
- Don't remove current or past phases
- Don't leave gaps in numbering - always renumber
- Don't hard delete task lists - archive/cancel for history
- Don't ask about each decimal phase - just renumber them
</anti_patterns>

<edge_cases>

**Removing a decimal phase (e.g., 17.1):**
- Only affects other decimals in same series (17.2 → 17.1, 17.3 → 17.2)
- Integer phases unchanged
- Simpler operation

**No subsequent phases to renumber:**
- Removing the last phase (e.g., Phase 20 when that's the end)
- Just archive, no renumbering needed

**Decimal phases under removed integer:**
- Removing Phase 17 when 17.1, 17.2 exist
- 17.1 → 16.1, 17.2 → 16.2
- They maintain their position in execution order

</edge_cases>

<error_handling>
```
IF mosic operation fails:
  - Log warning: "Mosic operation failed: [error]. Continuing..."
  - Add to config.mosic.pending_sync for retry
  - Continue (don't block)
```
</error_handling>

<success_criteria>
- [ ] Target phase validated as future/unstarted
- [ ] Phase has no completed tasks
- [ ] User confirmed removal
- [ ] MTask List archived/cancelled with [REMOVED] prefix
- [ ] Dependency relations updated (next phase now depends on prev)
- [ ] Subsequent phase task lists renumbered
- [ ] Related pages archived
- [ ] config.json mappings updated
- [ ] No gaps in phase numbering
- [ ] User informed of changes
</success_criteria>
