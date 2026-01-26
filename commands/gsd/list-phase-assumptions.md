---
name: gsd:list-phase-assumptions
description: Surface Claude's assumptions about a phase approach before planning
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Analyze a phase and present Claude's assumptions about technical approach, implementation order, scope boundaries, risk areas, and dependencies.

Purpose: Help users see what Claude thinks BEFORE planning begins - enabling course correction early when assumptions are wrong.
Output: Conversational output only (no file creation) - ends with "What do you think?" prompt

Optionally syncs assumptions as M Page content to Mosic for team visibility.

**Mosic-only architecture:** Phase context loaded from MTask List, assumptions optionally saved as M Page.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/list-phase-assumptions.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)

Load from Mosic MCP:
- config.json → workspace_id, project_id
- mosic_get_project(project_id, { include_task_lists: true }) → phases
- mosic_get_task_list(task_list_id) → phase details
- mosic_get_entity_pages("MTask List", task_list_id) → phase documentation
</context>

<process>

## 1. Load Session Context

```bash
WORKSPACE_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.project_id")
```

If config.json missing:
```
No active GSD session. Run /gsd:new-project first.
```
Exit.

## 2. Validate Phase Argument

```
IF $ARGUMENTS is empty:
  ERROR: Phase number required.
  Usage: /gsd:list-phase-assumptions <phase-number>
  Example: /gsd:list-phase-assumptions 3
  Exit.
```

## 3. Load Phase from Mosic

```
# Get project with task lists
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })

# Find the specified phase
phase_task_list = project.task_lists.find(tl =>
  tl.title.includes("Phase " + phase_number)
)

IF !phase_task_list:
  ERROR: Phase {phase_number} not found in project.
  Available phases: [list phase titles]
  Exit.

# Get phase details
phase = mosic_get_task_list(phase_task_list.name, {
  include_tasks: true
})

# Get any existing phase documentation
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name, {
  content_format: "markdown"
})
```

## 4. Analyze Phase and Surface Assumptions

Follow list-phase-assumptions.md workflow:
- Analyze phase description from task list
- Surface assumptions about: technical approach, implementation order, scope, risks, dependencies
- Present assumptions clearly
- Prompt "What do you think?"

## 5. Gather Feedback

Wait for user feedback on assumptions.

## 6. Offer Next Steps

```
Based on your feedback, what would you like to do?

1. Proceed to planning (/gsd:plan-phase {phase_number})
2. Save assumptions to Mosic for reference
3. Discuss further
4. Update phase description with clarifications
```

</process>

<mosic_sync>
**Save assumptions to Mosic (optional, after feedback gathered):**

**If user chooses to save:**

```
assumptions_content = build_assumptions_content({
  phase: phase.title,
  phase_number: phase_number,
  technical_approach: [assumptions list],
  implementation_order: [ordered list],
  scope_boundaries: [in/out scope],
  risk_areas: [risks list],
  dependencies: [dependencies list],
  user_feedback: [feedback notes]
})

# Create assumptions page linked to phase task list
assumptions_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: WORKSPACE_ID,
  title: "Phase " + phase_number + " Assumptions",
  page_type: "Document",
  icon: "lucide:lightbulb",
  status: "Draft",
  content: assumptions_content,
  relation_type: "Related"
})

# Tag the page
GSD_MANAGED_TAG = config.mosic.tags.gsd_managed
PHASE_TAG = config.mosic.tags.phase_tags["phase-" + phase_number]

mosic_batch_add_tags_to_document("M Page", assumptions_page.name, [
  GSD_MANAGED_TAG,
  PHASE_TAG
])
```

Display:
```
✓ Assumptions saved to Mosic
  Page: https://mosic.pro/app/page/{assumptions_page.name}
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Assumptions displayed locally only."
  - Continue (don't block)
```
</mosic_sync>

<success_criteria>
- [ ] Config loaded from config.json
- [ ] Phase validated against project task lists in Mosic
- [ ] Phase details and documentation loaded from Mosic
- [ ] Assumptions surfaced across five areas
- [ ] User prompted for feedback
- [ ] User knows next steps (discuss context, plan phase, or correct assumptions)
- [ ] Mosic sync (if user opts in):
  - [ ] Assumptions page created and linked to phase task list
  - [ ] Page tagged appropriately
  - [ ] Page URL provided to user
</success_criteria>
