---
name: gsd:insert-phase
description: Insert urgent work as decimal phase (e.g., 72.1) between existing phases
argument-hint: <after> <description>
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Insert a decimal phase for urgent work discovered mid-milestone that must be completed between existing integer phases.

Uses decimal numbering (72.1, 72.2, etc.) to preserve the logical sequence of planned phases while accommodating urgent insertions.

Purpose: Handle urgent work discovered during execution without renumbering entire roadmap.
</objective>

<execution_context>
@.planning/ROADMAP.md
@.planning/STATE.md
</execution_context>

<process>

<step name="parse_arguments">
Parse the command arguments:
- First argument: integer phase number to insert after
- Remaining arguments: phase description

Example: `/gsd:insert-phase 72 Fix critical auth bug`
→ after = 72
→ description = "Fix critical auth bug"

Validation:

```bash
if [ $# -lt 2 ]; then
  echo "ERROR: Both phase number and description required"
  echo "Usage: /gsd:insert-phase <after> <description>"
  echo "Example: /gsd:insert-phase 72 Fix critical auth bug"
  exit 1
fi
```

Parse first argument as integer:

```bash
after_phase=$1
shift
description="$*"

# Validate after_phase is an integer
if ! [[ "$after_phase" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Phase number must be an integer"
  exit 1
fi
```

</step>

<step name="load_roadmap">
Load the roadmap file:

```bash
if [ -f .planning/ROADMAP.md ]; then
  ROADMAP=".planning/ROADMAP.md"
else
  echo "ERROR: No roadmap found (.planning/ROADMAP.md)"
  exit 1
fi
```

Read roadmap content for parsing.
</step>

<step name="verify_target_phase">
Verify that the target phase exists in the roadmap:

1. Search for "### Phase {after_phase}:" heading
2. If not found:

   ```
   ERROR: Phase {after_phase} not found in roadmap
   Available phases: [list phase numbers]
   ```

   Exit.

3. Verify phase is in current milestone (not completed/archived)
   </step>

<step name="find_existing_decimals">
Find existing decimal phases after the target phase:

1. Search for all "### Phase {after_phase}.N:" headings
2. Extract decimal suffixes (e.g., for Phase 72: find 72.1, 72.2, 72.3)
3. Find the highest decimal suffix
4. Calculate next decimal: max + 1

Examples:

- Phase 72 with no decimals → next is 72.1
- Phase 72 with 72.1 → next is 72.2
- Phase 72 with 72.1, 72.2 → next is 72.3

Store as: `decimal_phase="$(printf "%02d" $after_phase).${next_decimal}"`
</step>

<step name="generate_slug">
Convert the phase description to a kebab-case slug:

```bash
slug=$(echo "$description" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
```

Phase directory name: `{decimal-phase}-{slug}`
Example: `06.1-fix-critical-auth-bug` (phase 6 insertion)
</step>

<step name="create_phase_directory">
Create the phase directory structure:

```bash
phase_dir=".planning/phases/${decimal_phase}-${slug}"
mkdir -p "$phase_dir"
```

Confirm: "Created directory: $phase_dir"
</step>

<step name="update_roadmap">
Insert the new phase entry into the roadmap:

1. Find insertion point: immediately after Phase {after_phase}'s content (before next phase heading or "---")
2. Insert new phase heading with (INSERTED) marker:

   ```
   ### Phase {decimal_phase}: {Description} (INSERTED)

   **Goal:** [Urgent work - to be planned]
   **Depends on:** Phase {after_phase}
   **Plans:** 0 plans

   Plans:
   - [ ] TBD (run /gsd:plan-phase {decimal_phase} to break down)

   **Details:**
   [To be added during planning]
   ```

3. Write updated roadmap back to file

The "(INSERTED)" marker helps identify decimal phases as urgent insertions.

Preserve all other content exactly (formatting, spacing, other phases).
</step>

<step name="update_project_state">
Update STATE.md to reflect the inserted phase:

1. Read `.planning/STATE.md`
2. Under "## Accumulated Context" → "### Roadmap Evolution" add entry:
   ```
   - Phase {decimal_phase} inserted after Phase {after_phase}: {description} (URGENT)
   ```

If "Roadmap Evolution" section doesn't exist, create it.

Add note about insertion reason if appropriate.
</step>

<step name="sync_to_mosic">
**Sync inserted phase to Mosic (Deep Integration):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing inserted phase to Mosic...
```

### Step 1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
AFTER_PHASE_TASK_LIST=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-$(printf '%02d' $after_phase)\"]")
NEXT_PHASE_TASK_LIST=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-$(printf '%02d' $((after_phase + 1)))\"]")
```

### Step 2: Create Phase Tag for Decimal Phase

```
# Create tag for decimal phase (e.g., "phase-06.1")
phase_tag = mosic_create_document("M Tag", {
  workspace_id: workspace_id,
  name: "phase-" + decimal_phase,
  color: "orange"  # Orange to indicate inserted/urgent
})
PHASE_TAG_ID = phase_tag.name

# Store in config
mosic.tags.phase_tags["phase-" + decimal_phase] = PHASE_TAG_ID
```

### Step 3: Create MTask List with INSERTED Marker

```
task_list = mosic_create_document("MTask List", {
  workspace_id: workspace_id,
  project: PROJECT_ID,
  title: "Phase " + decimal_phase + ": " + description + " (INSERTED)",
  description: "**Goal:** [Urgent work - to be planned]\n\n**Status:** Not planned yet\n\n**INSERTED:** This phase was inserted between Phase " + after_phase + " and Phase " + (after_phase + 1) + " for urgent work.\n\nRun `/gsd:plan-phase " + decimal_phase + "` to create execution plans.",
  icon: "lucide:alert-triangle",  # Alert icon for urgent
  color: "orange",
  status: "Backlog",
  prefix: "P" + decimal_phase.replace(".", "")
})

task_list_id = task_list.name
```

### Step 4: Tag the Task List

```
mosic_batch_add_tags_to_document("MTask List", task_list_id, [
  GSD_MANAGED_TAG,
  PHASE_TAG_ID
])
```

### Step 5: Create Depends Relation to After Phase

```
# Inserted phase depends on the phase it comes after
IF AFTER_PHASE_TASK_LIST:
  mosic_create_document("M Relation", {
    workspace_id: workspace_id,
    source_doctype: "MTask List",
    source_name: task_list_id,
    target_doctype: "MTask List",
    target_name: AFTER_PHASE_TASK_LIST,
    relation_type: "Depends"
  })
```

### Step 6: Update Next Phase to Depend on Inserted Phase

```
# The next integer phase now depends on this inserted phase instead of the after phase
IF NEXT_PHASE_TASK_LIST:
  # First, remove old dependency (next → after)
  # Search for existing relation
  existing_relations = mosic_get_document_relations("MTask List", NEXT_PHASE_TASK_LIST)
  FOR each relation in existing_relations:
    IF relation.target_name == AFTER_PHASE_TASK_LIST AND relation.relation_type == "Depends":
      mosic_delete_document("M Relation", relation.name)

  # Create new dependency (next → inserted)
  mosic_create_document("M Relation", {
    workspace_id: workspace_id,
    source_doctype: "MTask List",
    source_name: NEXT_PHASE_TASK_LIST,
    target_doctype: "MTask List",
    target_name: task_list_id,
    relation_type: "Depends"
  })
```

### Step 7: Update config.json with Mappings

```bash
# Update config.json with:
# mosic.task_lists["phase-NN.M"] = task_list_id
# mosic.tags.phase_tags["phase-NN.M"] = PHASE_TAG_ID
```

Display:
```
✓ Phase synced to Mosic
  Task List: https://mosic.pro/app/MTask%20List/[task_list_id]
  Depends on: Phase {after_phase}
  Next phase updated: Phase {next_integer} now depends on {decimal_phase}
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Phase inserted locally."
  - Add to mosic.pending_sync array for retry
  - Continue to completion step (don't block)
```

**If mosic.enabled = false:** Skip to completion step.
</step>

<step name="completion">
Present completion summary:

```
Phase {decimal_phase} inserted after Phase {after_phase}:
- Description: {description}
- Directory: .planning/phases/{decimal-phase}-{slug}/
- Status: Not planned yet
- Marker: (INSERTED) - indicates urgent work
[IF mosic.enabled:]
- Mosic: https://mosic.pro/app/MTask%20List/[task_list_id]
[END IF]

Roadmap updated: {roadmap-path}
Project state updated: .planning/STATE.md

---

## ▶ Next Up

**Phase {decimal_phase}: {description}** — urgent insertion

`/gsd:plan-phase {decimal_phase}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Review insertion impact: Check if Phase {next_integer} dependencies still make sense
- Review roadmap

---
```
</step>

</process>

<anti_patterns>

- Don't use this for planned work at end of milestone (use /gsd:add-phase)
- Don't insert before Phase 1 (decimal 0.1 makes no sense)
- Don't renumber existing phases
- Don't modify the target phase content
- Don't create plans yet (that's /gsd:plan-phase)
- Don't commit changes (user decides when to commit)
  </anti_patterns>

<success_criteria>
Phase insertion is complete when:

- [ ] Phase directory created: `.planning/phases/{N.M}-{slug}/`
- [ ] Roadmap updated with new phase entry (includes "(INSERTED)" marker)
- [ ] Phase inserted in correct position (after target phase, before next integer phase)
- [ ] STATE.md updated with roadmap evolution note
- [ ] Decimal number calculated correctly (based on existing decimals)
- [ ] Mosic sync (if enabled):
  - [ ] MTask List created with (INSERTED) marker
  - [ ] Phase tag created for decimal phase
  - [ ] Depends relation created (inserted → after phase)
  - [ ] Next phase dependency updated (next → inserted instead of next → after)
  - [ ] Tags applied (gsd-managed, phase-NN.M)
  - [ ] config.json updated with task_list_id
- [ ] User informed of next steps and dependency implications
      </success_criteria>
