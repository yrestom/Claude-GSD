---
name: gsd:plan-phase
description: Create detailed execution plan for a phase (PLAN.md) with verification loop
argument-hint: "[phase] [--research] [--skip-research] [--gaps] [--skip-verify]"
agent: gsd-planner
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - mcp__context7__*
---

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<objective>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Research (if needed) → Plan → Verify → Done

**Orchestrator role:** Parse arguments, validate phase, research domain (unless skipped or exists), spawn gsd-planner agent, verify plans with gsd-plan-checker, iterate until plans pass or max iterations reached, present results.

**Why subagents:** Research and planning burn context fast. Verification uses fresh context. User sees the flow between agents in main context.
</objective>

<context>
Phase number: $ARGUMENTS (optional - auto-detects next unplanned phase if not provided)

**Flags:**
- `--research` — Force re-research even if RESEARCH.md exists
- `--skip-research` — Skip research entirely, go straight to planning
- `--gaps` — Gap closure mode (reads VERIFICATION.md, skips research)
- `--skip-verify` — Skip planner → checker verification loop

Normalize phase input in step 2 before any directory lookups.
</context>

<process>

## 1. Validate Environment and Resolve Model Profile

```bash
ls .planning/ 2>/dev/null
```

**If not found:** Error - user should run `/gsd:new-project` first.

**Resolve model profile for agent spawning:**

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-phase-researcher | opus | sonnet | haiku |
| gsd-planner | opus | opus | sonnet |
| gsd-plan-checker | sonnet | sonnet | haiku |

Store resolved models for use in Task calls below.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS:

- Phase number (integer or decimal like `2.1`)
- `--research` flag to force re-research
- `--skip-research` flag to skip research
- `--gaps` flag for gap closure mode
- `--skip-verify` flag to bypass verification loop

**If no phase number:** Detect next unplanned phase from roadmap.

**Normalize phase to zero-padded format:**

```bash
# Normalize phase number (8 → 08, but preserve decimals like 2.1 → 02.1)
if [[ "$PHASE" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$PHASE")
elif [[ "$PHASE" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
fi
```

**Check for existing research and plans:**

```bash
ls .planning/phases/${PHASE}-*/*-RESEARCH.md 2>/dev/null
ls .planning/phases/${PHASE}-*/*-PLAN.md 2>/dev/null
```

## 3. Validate Phase

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

**If not found:** Error with available phases. **If found:** Extract phase number, name, description.

## 4. Ensure Phase Directory Exists

```bash
# PHASE is already normalized (08, 02.1, etc.) from step 2
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  # Create phase directory from roadmap name
  PHASE_NAME=$(grep "Phase ${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".planning/phases/${PHASE}-${PHASE_NAME}"
  PHASE_DIR=".planning/phases/${PHASE}-${PHASE_NAME}"
fi
```

## 5. Handle Research

**If `--gaps` flag:** Skip research (gap closure uses VERIFICATION.md instead).

**If `--skip-research` flag:** Skip to step 6.

**Check config for research setting:**

```bash
WORKFLOW_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
```

**If `workflow.research` is `false` AND `--research` flag NOT set:** Skip to step 6.

**Otherwise:**

Check for existing research:

```bash
ls "${PHASE_DIR}"/*-RESEARCH.md 2>/dev/null
```

**If RESEARCH.md exists AND `--research` flag NOT set:**
- Display: `Using existing research: ${PHASE_DIR}/${PHASE}-RESEARCH.md`
- Skip to step 6

**If RESEARCH.md missing OR `--research` flag set:**

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

Proceed to spawn researcher

### Spawn gsd-phase-researcher

Gather context for research prompt:

```bash
# Get phase description from roadmap
PHASE_DESC=$(grep -A3 "Phase ${PHASE}:" .planning/ROADMAP.md)

# Get requirements if they exist
REQUIREMENTS=$(cat .planning/REQUIREMENTS.md 2>/dev/null | grep -A100 "## Requirements" | head -50)

# Get prior decisions from STATE.md
DECISIONS=$(grep -A20 "### Decisions Made" .planning/STATE.md 2>/dev/null)

# Get phase context if exists
PHASE_CONTEXT=$(cat "${PHASE_DIR}"/*-CONTEXT.md 2>/dev/null)
```

Fill research prompt and spawn:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}

Answer: "What do I need to know to PLAN this phase well?"
</objective>

<context>
**Phase description:**
{phase_description}

**Requirements (if any):**
{requirements}

**Prior decisions:**
{decisions}

**Phase context (if any):**
{phase_context}
</context>

<output>
Write research findings to: {phase_dir}/{phase}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

### Handle Researcher Return

**`## RESEARCH COMPLETE`:**
- Display: `Research complete. Proceeding to planning...`
- Continue to step 6

**`## RESEARCH BLOCKED`:**
- Display blocker information
- Offer: 1) Provide more context, 2) Skip research and plan anyway, 3) Abort
- Wait for user response

## 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

**If exists:** Offer: 1) Continue planning (add more plans), 2) View existing, 3) Replan from scratch. Wait for response.

## 7. Read Context Files

Read and store context file contents for the planner agent. The `@` syntax does not work across Task() boundaries - content must be inlined.

```bash
# Read required files
STATE_CONTENT=$(cat .planning/STATE.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)

# Read optional files (empty string if missing)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null)
CONTEXT_CONTENT=$(cat "${PHASE_DIR}"/*-CONTEXT.md 2>/dev/null)
RESEARCH_CONTENT=$(cat "${PHASE_DIR}"/*-RESEARCH.md 2>/dev/null)

# Gap closure files (only if --gaps mode)
VERIFICATION_CONTENT=$(cat "${PHASE_DIR}"/*-VERIFICATION.md 2>/dev/null)
UAT_CONTENT=$(cat "${PHASE_DIR}"/*-UAT.md 2>/dev/null)
```

## 8. Spawn gsd-planner Agent

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

Fill prompt with inlined content and spawn:

```markdown
<planning_context>

**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:**
{state_content}

**Roadmap:**
{roadmap_content}

**Requirements (if exists):**
{requirements_content}

**Phase Context (if exists):**
{context_content}

**Research (if exists):**
{research_content}

**Gap Closure (if --gaps mode):**
{verification_content}
{uat_content}

</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase
Plans must be executable prompts with:

- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
Before returning PLANNING COMPLETE:

- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

## 9. Handle Planner Return

Parse planner output:

**`## PLANNING COMPLETE`:**
- Display: `Planner created {N} plan(s). Files on disk.`
- If `--skip-verify`: Skip to step 13
- Check config: `WORKFLOW_PLAN_CHECK=$(cat .planning/config.json 2>/dev/null | grep -o '"plan_check"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")`
- If `workflow.plan_check` is `false`: Skip to step 13
- Otherwise: Proceed to step 10

**`## CHECKPOINT REACHED`:**
- Present to user, get response, spawn continuation (see step 12)

**`## PLANNING INCONCLUSIVE`:**
- Show what was attempted
- Offer: Add context, Retry, Manual
- Wait for user response

## 10. Spawn gsd-plan-checker Agent

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

Read plans and requirements for the checker:

```bash
# Read all plans in phase directory
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)

# Read requirements (reuse from step 7 if available)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null)
```

Fill checker prompt with inlined content and spawn:

```markdown
<verification_context>

**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

**Plans to verify:**
{plans_content}

**Requirements (if exists):**
{requirements_content}

</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

## 11. Handle Checker Return

**If `## VERIFICATION PASSED`:**
- Display: `Plans verified. Ready for execution.`
- Proceed to step 13

**If `## ISSUES FOUND`:**
- Display: `Checker found issues:`
- List issues from checker output
- Check iteration count
- Proceed to step 12

## 12. Revision Loop (Max 3 Iterations)

Track: `iteration_count` (starts at 1 after initial plan + check)

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

Read current plans for revision context:

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Spawn gsd-planner with revision prompt:

```markdown
<revision_context>

**Phase:** {phase_number}
**Mode:** revision

**Existing plans:**
{plans_content}

**Checker issues:**
{structured_issues_from_checker}

</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-planner.md for your role and instructions.\n\n" + revision_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

- After planner returns → spawn checker again (step 10)
- Increment iteration_count

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain:`
- List remaining issues

Offer options:
1. Force proceed (execute despite issues)
2. Provide guidance (user gives direction, retry)
3. Abandon (exit planning)

Wait for user response.

## 13. Sync Plans to Mosic (Deep Integration)

**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing plans to Mosic...
```

### Step 13.1: Get Phase Context from Mosic

```bash
# Get task_list_id for this phase
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE}\"]")
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")

# Get tag IDs from config
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
PLAN_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.plan")
PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PHASE}\"]")
```

### Step 13.2: Check for Existing Tasks in Mosic

```
# Search for existing tasks in this phase's task list
existing_tasks = mosic_search_tasks({
  workspace_id: workspace_id,
  task_list_id: task_list_id,
  status__in: ["Backlog", "ToDo", "In Progress"]
})

# Build mapping of existing plan tasks
existing_plan_map = {}
FOR each task in existing_tasks:
  IF task.title matches "Plan {NN}:" pattern:
    existing_plan_map[plan_number] = task.name
```

### Step 13.3: Create/Update MTasks for Each Plan

```
FOR each PLAN.md in ${PHASE_DIR}:
  # Extract plan metadata from frontmatter
  plan_number = extract from filename (e.g., "01" from "01-PLAN.md")
  plan_objective = extract from <objective> section
  plan_wave = extract from frontmatter "wave:"
  plan_autonomous = extract from frontmatter "autonomous:"
  plan_depends_on = extract from frontmatter "depends_on:"
  plan_files_modified = extract from frontmatter "files_modified:"

  # Check if task already exists
  existing_task_id = existing_plan_map[plan_number]

  IF existing_task_id:
    # Update existing task
    mosic_update_document("MTask", existing_task_id, {
      description: "[Updated plan summary with wave, files, etc.]",
      status: "ToDo"
    })
    task_id = existing_task_id
  ELSE:
    # Create new MTask with rich metadata
    task = mosic_create_document("MTask", {
      workspace_id: workspace_id,
      task_list: task_list_id,
      title: "Plan " + plan_number + ": " + plan_objective.substring(0, 100),
      description: build_task_description(plan),
      icon: "lucide:file-code",
      status: "ToDo",
      priority: determine_priority(plan_wave),  # Wave 1 = High, later waves = Normal
      start_date: null,
      due_date: null
    })
    task_id = task.name
```

### Step 13.4: Create Plan Page with Proper Type

```
  # Create Plan page (type: Spec) linked to task
  plan_page = mosic_create_entity_page("MTask", task_id, {
    workspace_id: workspace_id,
    title: "Execution Plan",
    page_type: "Spec",  # Plans are specifications
    icon: mosic.page_icons.plan,  # "lucide:file-code"
    status: "Published",
    content: convert_to_editorjs(PLAN.md content),
    relation_type: "Related"
  })

  # Tag the page with appropriate tags
  mosic_batch_add_tags_to_document("M Page", plan_page.name, [
    GSD_MANAGED_TAG,
    PLAN_TAG,
    PHASE_TAG
  ])

  # Store page ID
  mosic.pages["phase-" + PHASE + "-plan-" + plan_number] = plan_page.name
```

### Step 13.5: Create Task Dependencies (Depends Relations)

```
  # Create Depends relations based on plan.depends_on
  IF plan_depends_on AND plan_depends_on != "none":
    FOR each dependency in plan_depends_on:
      dep_task_id = mosic.tasks["phase-" + PHASE + "-plan-" + dependency]
      IF dep_task_id:
        mosic_create_document("M Relation", {
          workspace_id: workspace_id,
          source_doctype: "MTask",
          source_name: task_id,
          target_doctype: "MTask",
          target_name: dep_task_id,
          relation_type: "Depends"
        })

  # Tag the task
  mosic_batch_add_tags_to_document("MTask", task_id, [
    GSD_MANAGED_TAG,
    PLAN_TAG,
    PHASE_TAG
  ])

  # Store task ID in config and update PLAN.md frontmatter
  mosic.tasks["phase-" + PHASE + "-plan-" + plan_number] = task_id

  # Update PLAN.md frontmatter with mosic_task_id
  Add to PLAN.md frontmatter: mosic_task_id: task_id
```

### Step 13.6: Create Checklist Items for Plan Tasks

```
  # Extract tasks from PLAN.md and create checklists
  plan_tasks = extract_tasks_from_plan(PLAN.md)

  # Initialize checklist storage for this plan
  checklist_ids = {}

  FOR each task in plan_tasks:
    checklist = mosic_create_document("MTask CheckList", {
      workspace_id: workspace_id,
      task: task_id,
      title: task.name,
      done: false
    })

    # Store checklist ID mapped to task name for execute-phase lookup
    checklist_ids[task.name] = checklist.name

  # Store checklist IDs in config.json for later lookup by execute-phase
  mosic.checklists = mosic.checklists or {}
  mosic.checklists["phase-" + PHASE + "-plan-" + plan_number] = checklist_ids
```

### Step 13.7: Update Research Page (if exists)

```
  IF ${PHASE_DIR}/${PHASE}-RESEARCH.md exists:
    # Create or update Research page linked to phase
    research_page = mosic_create_entity_page("MTask List", task_list_id, {
      workspace_id: workspace_id,
      title: "Phase Research",
      page_type: "Document",  # Research is documentation
      icon: mosic.page_icons.research,  # "lucide:search"
      status: "Published",
      content: convert_to_editorjs(RESEARCH.md content),
      relation_type: "Related"
    })

    mosic_batch_add_tags_to_document("M Page", research_page.name, [
      GSD_MANAGED_TAG,
      mosic.tags.research,
      PHASE_TAG
    ])

    # Store page ID
    mosic.pages["phase-" + PHASE + "-research"] = research_page.name
```

### Step 13.8: Update config.json with All Mappings

```json
{
  "mosic": {
    "tasks": {
      "phase-01-plan-01": "task_id_1",
      "phase-01-plan-02": "task_id_2"
    },
    "pages": {
      "phase-01-plan-01": "page_id_1",
      "phase-01-plan-02": "page_id_2",
      "phase-01-research": "research_page_id"
    },
    "last_sync": "[ISO timestamp]"
  }
}
```

Display:
```
✓ Plans synced to Mosic

  Task List: https://mosic.pro/app/MTask%20List/[task_list_id]
  Tasks: [N] created/updated
  Pages: [M] plan pages + research page
  Relations: [R] dependency links

  Plan Structure:
  ├─ Plan 01: [objective] (Wave 1)
  ├─ Plan 02: [objective] (Wave 1)
  └─ Plan 03: [objective] (Wave 2) → depends on 01, 02
```

**Error handling:**

```
IF mosic sync fails:
  - Display warning: "Mosic plan sync failed: [error]. Plans created locally."
  - Add failed items to mosic.pending_sync array
  - Continue to step 14 (don't block)
```

**If mosic.enabled = false:** Skip to step 14.

## 14. Present Final Status

Route to `<offer_next>`.

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Phase {X}** — run all {N} plans

/gsd:execute-phase {X}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase-dir}/*-PLAN.md — review plans
- /gsd:plan-phase {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] gsd-phase-researcher spawned if research needed
- [ ] Existing plans checked
- [ ] gsd-planner spawned with context (including RESEARCH.md if available)
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] gsd-plan-checker spawned (unless --skip-verify)
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] Mosic sync (if enabled):
  - [ ] MTasks created for each plan
  - [ ] Plan pages attached to tasks
  - [ ] Tags applied (gsd-managed, plan, phase-NN)
  - [ ] Task IDs stored in config.json
- [ ] User sees status between agent spawns
- [ ] User knows next steps (execute or review)
</success_criteria>
