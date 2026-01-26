---
name: gsd:insert-phase
description: Insert urgent work as new phase between existing phases in Mosic
argument-hint: <after-identifier> <description>
allowed-tools:
  - Read
  - Write
  - Bash
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Insert a new phase for urgent work discovered mid-milestone that must be completed between existing phases.

Creates a new MTask List in Mosic with proper dependency relations to maintain execution order.

Purpose: Handle urgent work discovered during execution without disrupting existing phase structure.
</objective>

<context>
**Arguments:**
- First argument: Phase identifier to insert after (e.g., "P01-3")
- Remaining arguments: Phase description

**Config file:** config.json (local file with Mosic entity IDs)
</context>

<process>

## Step 0: Load Configuration and Mosic Tools

```bash
# Load config.json
CONFIG=$(cat config.json 2>/dev/null || echo '{}')
WORKSPACE_ID=$(echo "$CONFIG" | jq -r '.mosic.workspace_id // empty')
PROJECT_ID=$(echo "$CONFIG" | jq -r '.mosic.project_id // empty')
```

Validate:
```
IF WORKSPACE_ID is empty OR PROJECT_ID is empty:
  ERROR: "No Mosic project configured. Run /gsd:new-project first."
  EXIT
```

Load Mosic tools:
```
ToolSearch("mosic task list create document relation")
```

---

## Step 1: Parse Arguments

```
# Parse arguments
IF $ARGUMENTS has less than 2 parts:
  ERROR: "Both phase identifier and description required"
  DISPLAY: "Usage: /gsd:insert-phase <after-identifier> <description>"
  DISPLAY: "Example: /gsd:insert-phase P01-3 Fix critical auth bug"
  EXIT

AFTER_IDENTIFIER = first_argument  # e.g., "P01-3"
DESCRIPTION = remaining_arguments  # e.g., "Fix critical auth bug"
```

---

## Step 2: Resolve Target Phase from Mosic

```
# Get the phase to insert after
after_phase = mosic_get_task_list(AFTER_IDENTIFIER, {
  workspace_id: WORKSPACE_ID
})

IF after_phase is null:
  ERROR: "Phase not found: " + AFTER_IDENTIFIER

  # List available phases
  project = mosic_get_project(PROJECT_ID, { include_task_lists: true })
  DISPLAY: "Available phases:"
  FOR each tl in project.task_lists:
    DISPLAY: "- " + tl.identifier + ": " + tl.title
  EXIT

AFTER_PHASE_ID = after_phase.name
AFTER_PHASE_TITLE = after_phase.title

DISPLAY: "Inserting after: " + AFTER_IDENTIFIER + " - " + AFTER_PHASE_TITLE
```

---

## Step 3: Find Phases That Depend on Target

```
# Get relations where the after_phase is a dependency target
relations = mosic_get_document_relations("MTask List", AFTER_PHASE_ID)

# Find phases that depend on the after_phase (will need updating)
dependent_phases = relations.filter(r =>
  r.relation_type == "Depends" &&
  r.target_name == AFTER_PHASE_ID
).map(r => r.source_name)

# Get next phase (the one immediately after in sequence)
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })

# Sort task lists by identifier to find sequence
sorted_phases = project.task_lists.sort((a, b) =>
  a.identifier.localeCompare(b.identifier)
)

after_index = sorted_phases.findIndex(p => p.name == AFTER_PHASE_ID)
next_phase = sorted_phases[after_index + 1] || null

IF next_phase:
  NEXT_PHASE_ID = next_phase.name
  NEXT_PHASE_IDENTIFIER = next_phase.identifier
  DISPLAY: "Next phase in sequence: " + NEXT_PHASE_IDENTIFIER
ELSE:
  DISPLAY: "Inserting at end of project (no next phase)"
```

---

## Step 4: Generate Identifier for New Phase

```
# New phase gets identifier based on position
# Format: INSERT-{N} where N is sequential for insertions after this phase

# Search for existing inserted phases after this one
existing_inserts = project.task_lists.filter(tl =>
  tl.title.includes("(INSERTED)") &&
  tl.identifier.startsWith("INSERT-")
)

# Find next insert number
insert_numbers = existing_inserts.map(tl => {
  match = tl.identifier.match(/INSERT-(\d+)/)
  return match ? parseInt(match[1]) : 0
})

next_insert = Math.max(...insert_numbers, 0) + 1
NEW_IDENTIFIER = "INSERT-" + next_insert

# Generate slug for display
slug = DESCRIPTION.toLowerCase()
  .replace(/[^a-z0-9]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .substring(0, 40)
```

---

## Step 5: Create New Phase in Mosic

```
# Create MTask List with INSERTED marker
# IMPORTANT: MTask List descriptions use HTML format
new_phase = mosic_create_document("MTask List", {
  workspace_id: WORKSPACE_ID,
  project: PROJECT_ID,
  title: DESCRIPTION + " (INSERTED)",
  description: "<p><strong>Goal:</strong> [Urgent work - to be planned]</p>" +
    "<p><strong>Status:</strong> Not planned yet</p>" +
    "<p><strong>INSERTED:</strong> This phase was inserted after " + AFTER_IDENTIFIER + " for urgent work.</p>" +
    "<p>Run <code>/gsd:plan-phase " + NEW_IDENTIFIER + "</code> to create execution plans.</p>",
  icon: "lucide:alert-triangle",
  color: "orange",
  status: "Backlog",
  prefix: "INS" + next_insert
})

NEW_PHASE_ID = new_phase.name

DISPLAY: "Created phase: " + NEW_IDENTIFIER + " - " + DESCRIPTION
```

---

## Step 6: Tag the New Phase

```
# Tag with gsd-managed
mosic_batch_add_tags_to_document("MTask List", NEW_PHASE_ID, [
  config.mosic.tags.gsd_managed
])

# Create tag for this phase if needed
phase_tag_name = "phase-" + NEW_IDENTIFIER.toLowerCase()
mosic_add_tag_to_document("MTask List", NEW_PHASE_ID, phase_tag_name)

DISPLAY: "Tagged with: gsd-managed, " + phase_tag_name
```

---

## Step 7: Create Dependency Relations

```
# New phase depends on the after phase
mosic_create_document("M Relation", {
  workspace_id: WORKSPACE_ID,
  source_doctype: "MTask List",
  source_name: NEW_PHASE_ID,
  target_doctype: "MTask List",
  target_name: AFTER_PHASE_ID,
  relation_type: "Depends"
})

DISPLAY: "Created: " + NEW_IDENTIFIER + " depends on " + AFTER_IDENTIFIER

# Update next phase to depend on new phase instead of after phase
IF NEXT_PHASE_ID:
  # Find and remove old dependency (next -> after)
  next_relations = mosic_get_document_relations("MTask List", NEXT_PHASE_ID)

  FOR each relation in next_relations:
    IF relation.target_name == AFTER_PHASE_ID AND relation.relation_type == "Depends":
      mosic_delete_document("M Relation", relation.name)
      DISPLAY: "Removed: " + NEXT_PHASE_IDENTIFIER + " depends on " + AFTER_IDENTIFIER

  # Create new dependency (next -> inserted)
  mosic_create_document("M Relation", {
    workspace_id: WORKSPACE_ID,
    source_doctype: "MTask List",
    source_name: NEXT_PHASE_ID,
    target_doctype: "MTask List",
    target_name: NEW_PHASE_ID,
    relation_type: "Depends"
  })

  DISPLAY: "Created: " + NEXT_PHASE_IDENTIFIER + " depends on " + NEW_IDENTIFIER
```

---

## Step 8: Add Comment to Project

```
# Add comment noting the insertion
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  reference_doctype: "MProject",
  reference_name: PROJECT_ID,
  content: "<p><strong>Phase Inserted</strong></p>" +
    "<p><strong>" + NEW_IDENTIFIER + ":</strong> " + DESCRIPTION + "</p>" +
    "<p>Inserted after " + AFTER_IDENTIFIER + " for urgent work.</p>" +
    "<p><a href=\"https://mosic.pro/app/MTask%20List/" + NEW_PHASE_ID + "\">View Phase</a></p>"
})
```

---

## Step 9: Update config.json

```
# Store new phase reference
config.mosic.task_lists[NEW_IDENTIFIER.toLowerCase()] = NEW_PHASE_ID
config.mosic.session = {
  "last_action": "insert-phase",
  "last_phase": NEW_PHASE_ID,
  "last_updated": ISO_TIMESTAMP
}

write config.json
```

---

## Step 10: Display Completion

```
DISPLAY:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > PHASE INSERTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**{NEW_IDENTIFIER}:** {DESCRIPTION}

Inserted after: {AFTER_IDENTIFIER}
Status: Not planned yet
Marker: (INSERTED) - indicates urgent work

Mosic: https://mosic.pro/app/MTask%20List/{NEW_PHASE_ID}

Dependencies:
  {NEW_IDENTIFIER} depends on {AFTER_IDENTIFIER}
  {NEXT_PHASE_IDENTIFIER} depends on {NEW_IDENTIFIER} (updated)

───────────────────────────────────────────────────────────────

## Next Up

**Phase {NEW_IDENTIFIER}: {DESCRIPTION}** - urgent insertion

/gsd:plan-phase {NEW_IDENTIFIER}

<sub>/clear first - fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- Review insertion impact: Check if {NEXT_PHASE_IDENTIFIER} dependencies still make sense
- /gsd:progress - View updated project state

───────────────────────────────────────────────────────────────
"""
```

</process>

<anti_patterns>
- Don't use this for planned work at end of milestone (use /gsd:add-phase)
- Don't insert as first phase (no phase to insert after)
- Don't modify the target phase content
- Don't create plans yet (that's /gsd:plan-phase)
- Don't commit changes locally (state is in Mosic)
</anti_patterns>

<success_criteria>
- [ ] Arguments parsed (after-identifier and description)
- [ ] Target phase found in Mosic
- [ ] Next phase identified (if exists)
- [ ] New MTask List created with (INSERTED) marker
- [ ] Tags applied (gsd-managed, phase tag)
- [ ] Depends relation created (new -> after)
- [ ] Next phase dependency updated (next -> new instead of next -> after)
- [ ] Comment added to project
- [ ] config.json updated with phase reference
- [ ] User informed of next steps and dependency changes
</success_criteria>
