---
name: gsd:add-phase
description: Add phase to end of current milestone in roadmap (Mosic-native)
argument-hint: <description>
allowed-tools:
  - Read
  - Write
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Add a new phase to the project by creating an MTask List in Mosic with linked overview page.

This command:
1. Creates MTask List in Mosic for the new phase
2. Creates phase overview page linked to the task list
3. Updates the project roadmap page in Mosic
4. Updates config.json with new phase IDs

Purpose: Add planned work discovered during execution that belongs at the end of current milestone.

**Architecture:** Mosic is the source of truth. Local config.json stores session context and entity IDs only.
</objective>

<execution_context>
Load from Mosic via MCP tools - no local file dependencies.
</execution_context>

<process>

<step name="parse_arguments">
Parse the command arguments:
- All arguments become the phase description
- Example: `/gsd:add-phase Add authentication` -> description = "Add authentication"

If no arguments provided:

```
ERROR: Phase description required
Usage: /gsd:add-phase <description>
Example: /gsd:add-phase Add authentication system
```

Exit.
</step>

<step name="load_config">
Load config.json for Mosic entity IDs:

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If config.json missing:
```
ERROR: No project initialized. Run /gsd:new-project first.
```

Extract Mosic configuration:
```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id

IF not project_id:
  ERROR: No project found in config.json. Run /gsd:new-project first.
```
</step>

<step name="load_project_from_mosic">
Load project context from Mosic:

```
project = mosic_get_project(project_id, {
  include_task_lists: true
})

# Get existing phases (task lists)
existing_phases = project.task_lists or []

# Find highest integer phase number
highest_phase = 0
FOR each task_list in existing_phases:
  IF task_list.title matches "Phase N:":
    phase_num = extract_phase_number(task_list.title)
    IF phase_num > highest_phase:
      highest_phase = phase_num

next_phase = highest_phase + 1
PHASE = printf("%02d", next_phase)
```
</step>

<step name="find_or_create_phase_tag">
Find or create phase tag:

```
# Search for existing phase tag
existing_tags = mosic_search_tags({
  workspace_id: workspace_id,
  query: "phase-" + PHASE
})

IF existing_tags.length == 0:
  # Create new phase tag
  phase_tag = mosic_create_document("M Tag", {
    workspace: workspace_id,
    tag_name: "phase-" + PHASE,
    color: "blue"
  })
  PHASE_TAG_ID = phase_tag.name
ELSE:
  PHASE_TAG_ID = existing_tags[0].name
```
</step>

<step name="get_previous_phase">
Get previous phase for dependency:

```
PREV_PHASE_NUM = next_phase - 1
IF PREV_PHASE_NUM > 0:
  PREV_PHASE_KEY = "phase-" + printf("%02d", PREV_PHASE_NUM)
  PREV_PHASE_ID = config.mosic.task_lists[PREV_PHASE_KEY]
ELSE:
  PREV_PHASE_ID = null
```
</step>

<step name="create_task_list">
Create MTask List in Mosic:

```
task_list = mosic_create_document("MTask List", {
  workspace: workspace_id,
  project: project_id,
  title: "Phase " + PHASE + ": " + phase_description,
  description: "**Goal:** [To be planned]\n\n**Status:** Not planned yet\n\nRun `/gsd:plan-phase " + PHASE + "` to create execution plans.",
  icon: "lucide:layers",
  color: "slate",
  status: "Backlog",
  prefix: "P" + PHASE
})

TASK_LIST_ID = task_list.name
```

Display:
```
Created phase task list: Phase {PHASE}: {description}
```
</step>

<step name="tag_task_list">
Tag the task list:

```
GSD_MANAGED_TAG = config.mosic.tags.gsd_managed

mosic_batch_add_tags_to_document("MTask List", TASK_LIST_ID, [
  GSD_MANAGED_TAG,
  PHASE_TAG_ID
])
```
</step>

<step name="create_dependency">
Create Depends relation to previous phase (if exists):

```
IF PREV_PHASE_ID:
  mosic_create_document("M Relation", {
    workspace: workspace_id,
    source_doctype: "MTask List",
    source_name: TASK_LIST_ID,
    target_doctype: "MTask List",
    target_name: PREV_PHASE_ID,
    relation_type: "Depends"
  })
```
</step>

<step name="create_overview_page">
Create phase overview page linked to task list:

```
overview_page = mosic_create_entity_page("MTask List", TASK_LIST_ID, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE + " Overview",
  page_type: "Document",
  icon: "lucide:file-text",
  status: "Draft",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + PHASE + ": " + phase_description, level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "This phase has not been planned yet." }
      },
      {
        type: "header",
        data: { text: "Goal", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "[To be defined during planning]" }
      },
      {
        type: "header",
        data: { text: "Next Steps", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "ordered",
          items: [
            "Run `/gsd:discuss-phase " + PHASE + "` to gather context",
            "Run `/gsd:plan-phase " + PHASE + "` to create execution plans",
            "Run `/gsd:execute-phase " + PHASE + "` to implement"
          ]
        }
      }
    ]
  },
  relation_type: "Related"
})

# Tag the overview page
mosic_batch_add_tags_to_document("M Page", overview_page.name, [
  GSD_MANAGED_TAG,
  PHASE_TAG_ID
])
```
</step>

<step name="update_roadmap_page">
Update roadmap page in Mosic to include new phase:

```
# Get roadmap page ID from config
roadmap_page_id = config.mosic.pages.roadmap

IF roadmap_page_id:
  # Get current roadmap content
  roadmap_page = mosic_get_page(roadmap_page_id, {
    content_format: "full"
  })

  # Add new phase entry to content blocks
  new_phase_blocks = [
    {
      type: "header",
      data: { text: "Phase " + PHASE + ": " + phase_description, level: 3 }
    },
    {
      type: "paragraph",
      data: { text: "**Goal:** [To be planned]" }
    },
    {
      type: "paragraph",
      data: { text: "**Depends on:** Phase " + (next_phase - 1) }
    },
    {
      type: "paragraph",
      data: { text: "**Plans:** 0 plans (run /gsd:plan-phase " + PHASE + " to break down)" }
    }
  ]

  # Append to existing content
  mosic_update_content_blocks(roadmap_page_id, {
    operation: "append",
    blocks: new_phase_blocks
  })
```
</step>

<step name="update_config">
Update config.json with new mappings:

```json
{
  "mosic": {
    "task_lists": {
      "phase-{PHASE}": "{TASK_LIST_ID}"
    },
    "pages": {
      "phase-{PHASE}-overview": "{overview_page.name}"
    },
    "tags": {
      "phase_tags": {
        "phase-{PHASE}": "{PHASE_TAG_ID}"
      }
    },
    "session": {
      "last_action": "add-phase",
      "last_updated": "[ISO timestamp]"
    }
  }
}
```

Write updated config.json.
</step>

<step name="completion">
Present completion summary:

```
Phase {PHASE} added to project:

- Description: {description}
- Task List: https://mosic.pro/app/MTask%20List/{TASK_LIST_ID}
- Overview: https://mosic.pro/app/page/{overview_page.name}
- Status: Not planned yet

---

## Next Up

**Phase {PHASE}: {description}**

`/gsd:discuss-phase {PHASE}` - gather context and clarify approach

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase {PHASE}` - skip discussion, plan directly
- `/gsd:add-phase <description>` - add another phase

---
```
</step>

</process>

<error_handling>
**Mosic API errors:**
```
IF mosic operation fails:
  - Display: "ERROR: Mosic operation failed: [error_message]"
  - IF task_list already created:
    - Store partial state in config.json with pending_sync flag
    - Display: "Partial state saved. Retry with /gsd:sync-mosic"
  - ELSE:
    - Clean exit with error message
```

**Config validation:**
```
IF config.mosic.enabled != true:
  ERROR: Mosic integration is not enabled. Check config.json.
```
</error_handling>

<anti_patterns>
- Don't create local phase directories (use Mosic only)
- Don't modify local ROADMAP.md or STATE.md files (use Mosic pages)
- Don't renumber existing phases
- Don't use decimal numbering (that's /gsd:insert-phase)
- Don't create plans yet (that's /gsd:plan-phase)
- Don't commit changes (no local files to commit)
</anti_patterns>

<success_criteria>
Phase addition is complete when:

- [ ] MTask List created in Mosic for new phase
- [ ] Phase overview page created and linked to task list
- [ ] Tags applied (gsd-managed, phase-NN)
- [ ] Depends relation created to previous phase (if exists)
- [ ] Roadmap page updated with new phase entry
- [ ] config.json updated with task_list_id, page_id, tag_id
- [ ] User informed of next steps with Mosic URLs
</success_criteria>
