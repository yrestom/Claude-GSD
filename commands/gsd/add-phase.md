---
name: gsd:add-phase
description: Add phase to end of current milestone in roadmap
argument-hint: <description>
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

This command appends sequential phases to the current milestone's phase list, automatically calculating the next phase number based on existing phases.

Purpose: Add planned work discovered during execution that belongs at the end of current milestone.
</objective>

<execution_context>
@.planning/ROADMAP.md
@.planning/STATE.md
</execution_context>

<process>

<step name="parse_arguments">
Parse the command arguments:
- All arguments become the phase description
- Example: `/gsd:add-phase Add authentication` → description = "Add authentication"
- Example: `/gsd:add-phase Fix critical performance issues` → description = "Fix critical performance issues"

If no arguments provided:

```
ERROR: Phase description required
Usage: /gsd:add-phase <description>
Example: /gsd:add-phase Add authentication system
```

Exit.
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

<step name="find_current_milestone">
Parse the roadmap to find the current milestone section:

1. Locate the "## Current Milestone:" heading
2. Extract milestone name and version
3. Identify all phases under this milestone (before next "---" separator or next milestone heading)
4. Parse existing phase numbers (including decimals if present)

Example structure:

```
## Current Milestone: v1.0 Foundation

### Phase 4: Focused Command System
### Phase 5: Path Routing & Validation
### Phase 6: Documentation & Distribution
```

</step>

<step name="calculate_next_phase">
Find the highest integer phase number in the current milestone:

1. Extract all phase numbers from phase headings (### Phase N:)
2. Filter to integer phases only (ignore decimals like 4.1, 4.2)
3. Find the maximum integer value
4. Add 1 to get the next phase number

Example: If phases are 4, 5, 5.1, 6 → next is 7

Format as two-digit: `printf "%02d" $next_phase`
</step>

<step name="generate_slug">
Convert the phase description to a kebab-case slug:

```bash
# Example transformation:
# "Add authentication" → "add-authentication"
# "Fix critical performance issues" → "fix-critical-performance-issues"

slug=$(echo "$description" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
```

Phase directory name: `{two-digit-phase}-{slug}`
Example: `07-add-authentication`
</step>

<step name="create_phase_directory">
Create the phase directory structure:

```bash
phase_dir=".planning/phases/${phase_num}-${slug}"
mkdir -p "$phase_dir"
```

Confirm: "Created directory: $phase_dir"
</step>

<step name="update_roadmap">
Add the new phase entry to the roadmap:

1. Find the insertion point (after last phase in current milestone, before "---" separator)
2. Insert new phase heading:

   ```
   ### Phase {N}: {Description}

   **Goal:** [To be planned]
   **Depends on:** Phase {N-1}
   **Plans:** 0 plans

   Plans:
   - [ ] TBD (run /gsd:plan-phase {N} to break down)

   **Details:**
   [To be added during planning]
   ```

3. Write updated roadmap back to file

Preserve all other content exactly (formatting, spacing, other phases).
</step>

<step name="update_project_state">
Update STATE.md to reflect the new phase:

1. Read `.planning/STATE.md`
2. Under "## Current Position" → "**Next Phase:**" add reference to new phase
3. Under "## Accumulated Context" → "### Roadmap Evolution" add entry:
   ```
   - Phase {N} added: {description}
   ```

If "Roadmap Evolution" section doesn't exist, create it.
</step>

<step name="sync_to_mosic">
**Sync new phase to Mosic (Deep Integration):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing new phase to Mosic...
```

### Step 1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
PREV_PHASE_NUM=$((phase_num - 1))
PREV_PHASE_TASK_LIST=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-$(printf '%02d' $PREV_PHASE_NUM)\"]")
```

### Step 2: Create or Find Phase Tag

```
# Search for existing phase tag
existing_tag = mosic_search_tags({
  workspace_id: workspace_id,
  query: "phase-" + phase_num
})

IF existing_tag.length == 0:
  # Create new phase tag
  phase_tag = mosic_create_document("M Tag", {
    workspace_id: workspace_id,
    name: "phase-" + phase_num,
    color: "blue"
  })
  PHASE_TAG_ID = phase_tag.name
ELSE:
  PHASE_TAG_ID = existing_tag[0].name

# Store in config
mosic.tags.phase_tags["phase-" + phase_num] = PHASE_TAG_ID
```

### Step 3: Create MTask List with Rich Metadata

```
task_list = mosic_create_document("MTask List", {
  workspace_id: workspace_id,
  project: project_id,
  title: "Phase " + phase_num + ": " + phase_description,
  description: "**Goal:** [To be planned]\n\n**Status:** Not planned yet\n\nRun `/gsd:plan-phase " + phase_num + "` to create execution plans.",
  icon: "lucide:layers",
  color: "slate",
  status: "Backlog",
  prefix: "P" + phase_num
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

### Step 5: Create Depends Relation to Previous Phase (if exists)

```
IF PREV_PHASE_TASK_LIST is not null:
  mosic_create_document("M Relation", {
    workspace_id: workspace_id,
    source_doctype: "MTask List",
    source_name: task_list_id,
    target_doctype: "MTask List",
    target_name: PREV_PHASE_TASK_LIST,
    relation_type: "Depends"
  })
```

### Step 6: Create Phase Overview Page

```
# Create placeholder overview page
overview_page = mosic_create_entity_page("MTask List", task_list_id, {
  workspace_id: workspace_id,
  title: "Phase " + phase_num + " Overview",
  page_type: "Document",
  icon: "lucide:file-text",
  status: "Draft",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + phase_num + ": " + phase_description, level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "This phase has not been planned yet. Run `/gsd:plan-phase " + phase_num + "` to create execution plans." }
      },
      {
        type: "header",
        data: { text: "Goal", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "[To be defined during planning]" }
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

### Step 7: Update config.json with Mappings

```bash
# Update config.json with:
# mosic.task_lists["phase-NN"] = task_list_id
# mosic.pages["phase-NN-overview"] = overview_page.name
# mosic.tags.phase_tags["phase-NN"] = PHASE_TAG_ID
```

Display:
```
✓ Phase synced to Mosic
  Task List: https://mosic.pro/app/MTask%20List/[task_list_id]
  Overview: https://mosic.pro/app/page/[overview_page.name]
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Phase created locally."
  - Add to mosic.pending_sync array for retry
  - Continue to completion step (don't block)
```

**If mosic.enabled = false:** Skip to completion step.
</step>

<step name="completion">
Present completion summary:

```
Phase {N} added to current milestone:
- Description: {description}
- Directory: .planning/phases/{phase-num}-{slug}/
- Status: Not planned yet
[IF mosic.enabled:]
- Mosic: https://mosic.pro/app/MTask%20List/[task_list_id]
[END IF]

Roadmap updated: {roadmap-path}
Project state updated: .planning/STATE.md

---

## ▶ Next Up

**Phase {N}: {description}**

`/gsd:plan-phase {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:add-phase <description>` — add another phase
- Review roadmap

---
```
</step>

</process>

<anti_patterns>

- Don't modify phases outside current milestone
- Don't renumber existing phases
- Don't use decimal numbering (that's /gsd:insert-phase)
- Don't create plans yet (that's /gsd:plan-phase)
- Don't commit changes (user decides when to commit)
  </anti_patterns>

<success_criteria>
Phase addition is complete when:

- [ ] Phase directory created: `.planning/phases/{NN}-{slug}/`
- [ ] Roadmap updated with new phase entry
- [ ] STATE.md updated with roadmap evolution note
- [ ] New phase appears at end of current milestone
- [ ] Next phase number calculated correctly (ignoring decimals)
- [ ] Mosic sync (if enabled):
  - [ ] MTask List created for new phase
  - [ ] Tags applied (gsd-managed, phase-NN)
  - [ ] config.json updated with task_list_id
- [ ] User informed of next steps
      </success_criteria>
