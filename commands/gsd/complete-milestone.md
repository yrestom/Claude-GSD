---
type: prompt
name: gsd:complete-milestone
description: Archive completed milestone and prepare for next version
argument-hint: <version>
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__mosic_pro__*
---

<objective>
Mark milestone {{version}} complete, archive to milestones/, and update ROADMAP.md and REQUIREMENTS.md.

Purpose: Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.
Output: Milestone archived (roadmap + requirements), PROJECT.md evolved, git tagged.
</objective>

<execution_context>
**Load these files NOW (before proceeding):**

- @~/.claude/get-shit-done/workflows/complete-milestone.md (main workflow)
- @~/.claude/get-shit-done/templates/milestone-archive.md (archive template)
  </execution_context>

<context>
**Project files:**
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/PROJECT.md`

**User input:**

- Version: {{version}} (e.g., "1.0", "1.1", "2.0")
  </context>

<process>

**Follow complete-milestone.md workflow:**

0. **Check for audit:**

   - Look for `.planning/v{{version}}-MILESTONE-AUDIT.md`
   - If missing or stale: recommend `/gsd:audit-milestone` first
   - If audit status is `gaps_found`: recommend `/gsd:plan-milestone-gaps` first
   - If audit status is `passed`: proceed to step 1

   ```markdown
   ## Pre-flight Check

   {If no v{{version}}-MILESTONE-AUDIT.md:}
   ⚠ No milestone audit found. Run `/gsd:audit-milestone` first to verify
   requirements coverage, cross-phase integration, and E2E flows.

   {If audit has gaps:}
   ⚠ Milestone audit found gaps. Run `/gsd:plan-milestone-gaps` to create
   phases that close the gaps, or proceed anyway to accept as tech debt.

   {If audit passed:}
   ✓ Milestone audit passed. Proceeding with completion.
   ```

1. **Verify readiness:**

   - Check all phases in milestone have completed plans (SUMMARY.md exists)
   - Present milestone scope and stats
   - Wait for confirmation

2. **Gather stats:**

   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline from git log
   - Present summary, confirm

3. **Extract accomplishments:**

   - Read all phase SUMMARY.md files in milestone range
   - Extract 4-6 key accomplishments
   - Present for approval

4. **Archive milestone:**

   - Create `.planning/milestones/v{{version}}-ROADMAP.md`
   - Extract full phase details from ROADMAP.md
   - Fill milestone-archive.md template
   - Update ROADMAP.md to one-line summary with link

5. **Archive requirements:**

   - Create `.planning/milestones/v{{version}}-REQUIREMENTS.md`
   - Mark all v1 requirements as complete (checkboxes checked)
   - Note requirement outcomes (validated, adjusted, dropped)
   - Delete `.planning/REQUIREMENTS.md` (fresh one created for next milestone)

6. **Update PROJECT.md:**

   - Add "Current State" section with shipped version
   - Add "Next Milestone Goals" section
   - Archive previous content in `<details>` (if v1.1+)

7. **Commit and tag:**

   - Stage: MILESTONES.md, PROJECT.md, ROADMAP.md, STATE.md, archive files
   - Commit: `chore: archive v{{version}} milestone`
   - Tag: `git tag -a v{{version}} -m "[milestone summary]"`
   - Ask about pushing tag

8. **Sync milestone completion to Mosic:**

   **Check if Mosic is enabled:**

   ```bash
   MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
   ```

   **If mosic.enabled = true:**

   ```bash
   WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
   PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
   GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
   SUMMARY_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.summary")
   ```

   ### Step 8.1: Update MProject Status

   ```
   mosic_update_document("MProject", PROJECT_ID, {
     status: "Completed"
   })
   ```

   ### Step 8.2: Create Milestone Archive Page

   ```
   milestone_page = mosic_create_entity_page("MProject", PROJECT_ID, {
     workspace_id: WORKSPACE_ID,
     title: "Milestone v" + version + " Archive",
     page_type: "Document",
     icon: "lucide:archive",
     status: "Published",
     content: convert_to_editorjs(milestone_archive_content),
     relation_type: "Related"
   })

   mosic_batch_add_tags_to_document("M Page", milestone_page.name, [
     GSD_MANAGED_TAG,
     SUMMARY_TAG
   ])
   ```

   ### Step 8.3: Mark All Phase Task Lists as Completed

   ```
   # Get all phase task lists for this milestone
   FOR each phase in milestone_phases:
     task_list_id = config.mosic.task_lists["phase-" + phase.number]
     IF task_list_id:
       mosic_update_document("MTask List", task_list_id, {
         status: "Completed"
       })

       # Mark all tasks in the list as completed
       tasks = mosic_search_tasks({
         workspace_id: WORKSPACE_ID,
         task_list_id: task_list_id,
         status__in: ["Backlog", "ToDo", "In Progress"]
       })

       FOR each task in tasks:
         mosic_complete_task(task.name)
   ```

   ### Step 8.4: Create Milestone Summary with Stats

   ```
   # Add completion comment with stats
   mosic_create_document("M Comment", {
     workspace_id: WORKSPACE_ID,
     ref_doc: "MProject",
     ref_name: PROJECT_ID,
     content: "## Milestone v" + version + " Completed\n\n" +
       "**Phases:** " + phase_count + "\n" +
       "**Tasks:** " + task_count + "\n" +
       "**Timeline:** " + start_date + " - " + end_date + "\n\n" +
       "**Key Accomplishments:**\n" + accomplishments_list
   })
   ```

   ### Step 8.5: Update config.json

   ```json
   {
     "mosic": {
       "completed_milestones": {
         "v{{version}}": {
           "completed_at": "[ISO timestamp]",
           "archive_page": "[milestone_page.name]",
           "phase_count": N,
           "task_count": M
         }
       }
     }
   }
   ```

   Display:
   ```
   ✓ Milestone synced to Mosic

     Project: https://mosic.pro/app/Project/[PROJECT_ID] (Completed)
     Archive: https://mosic.pro/app/page/[milestone_page.name]
     Phases: [N] task lists marked completed
     Tasks: [M] tasks marked completed
   ```

   **Error handling:**

   ```
   IF mosic sync fails:
     - Display warning: "Mosic milestone sync failed: [error]. Local archive created."
     - Add to mosic.pending_sync array:
       { type: "milestone_complete", version: version }
     - Continue (don't block)
   ```

   **If mosic.enabled = false:** Skip Mosic sync.

9. **Offer next steps:**
   - `/gsd:new-milestone` — start next milestone (questioning → research → requirements → roadmap)

</process>

<success_criteria>

- Milestone archived to `.planning/milestones/v{{version}}-ROADMAP.md`
- Requirements archived to `.planning/milestones/v{{version}}-REQUIREMENTS.md`
- `.planning/REQUIREMENTS.md` deleted (fresh for next milestone)
- ROADMAP.md collapsed to one-line entry
- PROJECT.md updated with current state
- Git tag v{{version}} created
- Commit successful
- Mosic sync (if enabled):
  - [ ] MProject status updated to Completed
  - [ ] Milestone archive page created
  - [ ] All phase MTask Lists marked Completed
  - [ ] All MTasks marked completed
  - [ ] Completion comment added with stats
  - [ ] config.json updated with completed_milestones
  - [ ] Sync failures handled gracefully (added to pending_sync)
- User knows next steps (including need for fresh requirements)
  </success_criteria>

<critical_rules>

- **Load workflow first:** Read complete-milestone.md before executing
- **Verify completion:** All phases must have SUMMARY.md files
- **User confirmation:** Wait for approval at verification gates
- **Archive before deleting:** Always create archive files before updating/deleting originals
- **One-line summary:** Collapsed milestone in ROADMAP.md should be single line with link
- **Context efficiency:** Archive keeps ROADMAP.md and REQUIREMENTS.md constant size per milestone
- **Fresh requirements:** Next milestone starts with `/gsd:new-milestone` which includes requirements definition
  </critical_rules>
