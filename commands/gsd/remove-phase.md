---
name: gsd:remove-phase
description: Remove a future phase from roadmap and renumber subsequent phases
argument-hint: <phase-number>
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

Purpose: Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.
Output: Phase deleted, all subsequent phases renumbered, git commit as historical record.
</objective>

<execution_context>
@.planning/ROADMAP.md
@.planning/STATE.md
</execution_context>

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

<step name="load_state">
Load project state:

```bash
cat .planning/STATE.md 2>/dev/null
cat .planning/ROADMAP.md 2>/dev/null
```

Parse current phase number from STATE.md "Current Position" section.
</step>

<step name="validate_phase_exists">
Verify the target phase exists in ROADMAP.md:

1. Search for `### Phase {target}:` heading
2. If not found:

   ```
   ERROR: Phase {target} not found in roadmap
   Available phases: [list phase numbers]
   ```

   Exit.
</step>

<step name="validate_future_phase">
Verify the phase is a future phase (not started):

1. Compare target phase to current phase from STATE.md
2. Target must be > current phase number

If target <= current phase:

```
ERROR: Cannot remove Phase {target}

Only future phases can be removed:
- Current phase: {current}
- Phase {target} is current or completed

To abandon current work, use /gsd:pause-work instead.
```

Exit.

3. Check for SUMMARY.md files in phase directory:

```bash
ls .planning/phases/{target}-*/*-SUMMARY.md 2>/dev/null
```

If any SUMMARY.md files exist:

```
ERROR: Phase {target} has completed work

Found executed plans:
- {list of SUMMARY.md files}

Cannot remove phases with completed work.
```

Exit.
</step>

<step name="gather_phase_info">
Collect information about the phase being removed:

1. Extract phase name from ROADMAP.md heading: `### Phase {target}: {Name}`
2. Find phase directory: `.planning/phases/{target}-{slug}/`
3. Find all subsequent phases (integer and decimal) that need renumbering

**Subsequent phase detection:**

For integer phase removal (e.g., 17):
- Find all phases > 17 (integers: 18, 19, 20...)
- Find all decimal phases >= 17.0 and < 18.0 (17.1, 17.2...) → these become 16.x
- Find all decimal phases for subsequent integers (18.1, 19.1...) → renumber with their parent

For decimal phase removal (e.g., 17.1):
- Find all decimal phases > 17.1 and < 18 (17.2, 17.3...) → renumber down
- Integer phases unchanged

List all phases that will be renumbered.
</step>

<step name="confirm_removal">
Present removal summary and confirm:

```
Removing Phase {target}: {Name}

This will:
- Delete: .planning/phases/{target}-{slug}/
- Renumber {N} subsequent phases:
  - Phase 18 → Phase 17
  - Phase 18.1 → Phase 17.1
  - Phase 19 → Phase 18
  [etc.]

Proceed? (y/n)
```

Wait for confirmation.
</step>

<step name="delete_phase_directory">
Delete the target phase directory if it exists:

```bash
if [ -d ".planning/phases/{target}-{slug}" ]; then
  rm -rf ".planning/phases/{target}-{slug}"
  echo "Deleted: .planning/phases/{target}-{slug}/"
fi
```

If directory doesn't exist, note: "No directory to delete (phase not yet created)"
</step>

<step name="renumber_directories">
Rename all subsequent phase directories:

For each phase directory that needs renumbering (in reverse order to avoid conflicts):

```bash
# Example: renaming 18-dashboard to 17-dashboard
mv ".planning/phases/18-dashboard" ".planning/phases/17-dashboard"
```

Process in descending order (20→19, then 19→18, then 18→17) to avoid overwriting.

Also rename decimal phase directories:
- `17.1-fix-bug` → `16.1-fix-bug` (if removing integer 17)
- `17.2-hotfix` → `17.1-hotfix` (if removing decimal 17.1)
</step>

<step name="rename_files_in_directories">
Rename plan files inside renumbered directories:

For each renumbered directory, rename files that contain the phase number:

```bash
# Inside 17-dashboard (was 18-dashboard):
mv "18-01-PLAN.md" "17-01-PLAN.md"
mv "18-02-PLAN.md" "17-02-PLAN.md"
mv "18-01-SUMMARY.md" "17-01-SUMMARY.md"  # if exists
# etc.
```

Also handle CONTEXT.md and DISCOVERY.md (these don't have phase prefixes, so no rename needed).
</step>

<step name="update_roadmap">
Update ROADMAP.md:

1. **Remove the phase section entirely:**
   - Delete from `### Phase {target}:` to the next phase heading (or section end)

2. **Remove from phase list:**
   - Delete line `- [ ] **Phase {target}: {Name}**` or similar

3. **Remove from Progress table:**
   - Delete the row for Phase {target}

4. **Renumber all subsequent phases:**
   - `### Phase 18:` → `### Phase 17:`
   - `- [ ] **Phase 18:` → `- [ ] **Phase 17:`
   - Table rows: `| 18. Dashboard |` → `| 17. Dashboard |`
   - Plan references: `18-01:` → `17-01:`

5. **Update dependency references:**
   - `**Depends on:** Phase 18` → `**Depends on:** Phase 17`
   - For the phase that depended on the removed phase:
     - `**Depends on:** Phase 17` (removed) → `**Depends on:** Phase 16`

6. **Renumber decimal phases:**
   - `### Phase 17.1:` → `### Phase 16.1:` (if integer 17 removed)
   - Update all references consistently

Write updated ROADMAP.md.
</step>

<step name="update_state">
Update STATE.md:

1. **Update total phase count:**
   - `Phase: 16 of 20` → `Phase: 16 of 19`

2. **Recalculate progress percentage:**
   - New percentage based on completed plans / new total plans

Do NOT add a "Roadmap Evolution" note - the git commit is the record.

Write updated STATE.md.
</step>

<step name="update_file_contents">
Search for and update phase references inside plan files:

```bash
# Find files that reference the old phase numbers
grep -r "Phase 18" .planning/phases/17-*/ 2>/dev/null
grep -r "Phase 19" .planning/phases/18-*/ 2>/dev/null
# etc.
```

Update any internal references to reflect new numbering.
</step>

<step name="sync_removal_to_mosic">
**Sync phase removal to Mosic (Deep Integration):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing phase removal to Mosic...
```

### Step 1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
TARGET_TASK_LIST=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${target}\"]")
```

### Step 2: Archive or Delete the MTask List

```
IF TARGET_TASK_LIST:
  # Option 1: Archive (soft delete - preserves history)
  mosic_update_document("MTask List", TARGET_TASK_LIST, {
    status: "Cancelled",
    title: "[REMOVED] " + original_title,
    description: original_description + "\n\n---\n**REMOVED:** This phase was removed from the roadmap. Historical record preserved."
  })

  # Option 2: Delete (hard delete - if user prefers clean state)
  # mosic_delete_document("MTask List", TARGET_TASK_LIST)

  # Remove from config
  delete mosic.task_lists["phase-" + target]
```

### Step 3: Update Dependency Relations

```
# Find the phases that depended on the removed phase
next_phase_num = target + 1  # For integer removal
prev_phase_num = target - 1

# Get task list IDs
PREV_TASK_LIST = mosic.task_lists["phase-" + prev_phase_num]
NEXT_TASK_LIST = mosic.task_lists["phase-" + next_phase_num]

IF NEXT_TASK_LIST AND PREV_TASK_LIST:
  # Remove old dependency (next → removed)
  existing_relations = mosic_get_document_relations("MTask List", NEXT_TASK_LIST)
  FOR each relation in existing_relations:
    IF relation.target_name == TARGET_TASK_LIST AND relation.relation_type == "Depends":
      mosic_delete_document("M Relation", relation.name)

  # Create new dependency (next → prev, skipping removed)
  mosic_create_document("M Relation", {
    workspace_id: workspace_id,
    source_doctype: "MTask List",
    source_name: NEXT_TASK_LIST,
    target_doctype: "MTask List",
    target_name: PREV_TASK_LIST,
    relation_type: "Depends"
  })
```

### Step 4: Update Task List Mappings for Renumbered Phases

```
# For each renumbered phase, update the config mapping
FOR each renumbered phase (old_num → new_num):
  old_task_list = mosic.task_lists["phase-" + old_num]

  IF old_task_list:
    # Update the task list title in Mosic
    mosic_update_document("MTask List", old_task_list, {
      title: "Phase " + new_num + ": " + phase_name,
      prefix: "P" + new_num
    })

    # Update config mapping
    delete mosic.task_lists["phase-" + old_num]
    mosic.task_lists["phase-" + new_num] = old_task_list

    # Update phase tag reference
    old_tag = mosic.tags.phase_tags["phase-" + old_num]
    delete mosic.tags.phase_tags["phase-" + old_num]
    mosic.tags.phase_tags["phase-" + new_num] = old_tag
```

### Step 5: Archive Related Pages

```
# Archive pages linked to removed phase
removed_pages = [
  mosic.pages["phase-" + target + "-overview"],
  mosic.pages["phase-" + target + "-research"],
  mosic.pages["phase-" + target + "-plan-*"]
]

FOR each page_id in removed_pages:
  IF page_id:
    mosic_update_document("M Page", page_id, {
      status: "Archived",
      title: "[REMOVED] " + original_title
    })
    delete mosic.pages[page_key]
```

### Step 6: Update config.json

```bash
# Update config.json with:
# - Removed phase task_list and pages deleted from mappings
# - Renumbered phases with updated keys
# - mosic.last_sync = current timestamp
```

Display:
```
✓ Phase removal synced to Mosic
  Archived: Phase {target} task list
  Dependencies: Phase {next} now depends on Phase {prev}
  Renumbered: {N} task lists updated
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Phase removed locally."
  - Add to mosic.pending_sync array for retry
  - Continue to commit step (don't block)
```

**If mosic.enabled = false:** Skip to commit step.
</step>

<step name="commit">
Stage and commit the removal:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/
git commit -m "chore: remove phase {target} ({original-phase-name})"
```

The commit message preserves the historical record of what was removed.
</step>

<step name="completion">
Present completion summary:

```
Phase {target} ({original-name}) removed.

Changes:
- Deleted: .planning/phases/{target}-{slug}/
- Renumbered: Phases {first-renumbered}-{last-old} → {first-renumbered-1}-{last-new}
- Updated: ROADMAP.md, STATE.md
- Committed: chore: remove phase {target} ({original-name})

Current roadmap: {total-remaining} phases
Current position: Phase {current} of {new-total}

---

## What's Next

Would you like to:
- `/gsd:progress` — see updated roadmap status
- Continue with current phase
- Review roadmap

---
```
</step>

</process>

<anti_patterns>

- Don't remove completed phases (have SUMMARY.md files)
- Don't remove current or past phases
- Don't leave gaps in numbering - always renumber
- Don't add "removed phase" notes to STATE.md - git commit is the record
- Don't ask about each decimal phase - just renumber them
- Don't modify completed phase directories
</anti_patterns>

<edge_cases>

**Removing a decimal phase (e.g., 17.1):**
- Only affects other decimals in same series (17.2 → 17.1, 17.3 → 17.2)
- Integer phases unchanged
- Simpler operation

**No subsequent phases to renumber:**
- Removing the last phase (e.g., Phase 20 when that's the end)
- Just delete and update ROADMAP.md, no renumbering needed

**Phase directory doesn't exist:**
- Phase may be in ROADMAP.md but directory not created yet
- Skip directory deletion, proceed with ROADMAP.md updates

**Decimal phases under removed integer:**
- Removing Phase 17 when 17.1, 17.2 exist
- 17.1 → 16.1, 17.2 → 16.2
- They maintain their position in execution order (after current last integer)

</edge_cases>

<success_criteria>
Phase removal is complete when:

- [ ] Target phase validated as future/unstarted
- [ ] Phase directory deleted (if existed)
- [ ] All subsequent phase directories renumbered
- [ ] Files inside directories renamed ({old}-01-PLAN.md → {new}-01-PLAN.md)
- [ ] ROADMAP.md updated (section removed, all references renumbered)
- [ ] STATE.md updated (phase count, progress percentage)
- [ ] Dependency references updated in subsequent phases
- [ ] Mosic sync (if enabled):
  - [ ] MTask List archived/cancelled with [REMOVED] prefix
  - [ ] Dependency relations updated (next phase now depends on prev)
  - [ ] Renumbered phase task lists updated with new titles
  - [ ] Related pages archived
  - [ ] config.json mappings updated (removed and renumbered)
- [ ] Changes committed with descriptive message
- [ ] No gaps in phase numbering
- [ ] User informed of changes
</success_criteria>
