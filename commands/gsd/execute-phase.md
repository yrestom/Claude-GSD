---
name: gsd:execute-phase
description: Execute all plans in a phase with wave-based parallelization (Mosic-native)
argument-hint: "<phase-number> [--gaps-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TodoWrite
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Execute all plan tasks in a phase using wave-based parallel execution.

Orchestrator stays lean: load plans from Mosic, analyze dependencies, group into waves, spawn subagents, collect results, update Mosic state.

**Architecture:** Plans are MTasks in Mosic. Status updates go to Mosic. Summaries become M Pages linked to tasks. config.json stores session context only.
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/workflows/execute-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS

**Flags:**
- `--gaps-only` - Execute only gap closure plans (plans with gap_closure tag)
</context>

<process>

## 0. Load Config and Resolve Model Profile

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
model_profile = config.model_profile or "balanced"

Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-executor | opus | sonnet | sonnet |
| gsd-verifier | sonnet | sonnet | haiku |
```

## 1. Validate and Load Phase from Mosic

**Normalize phase:**
```
IF PHASE is integer: PHASE = printf("%02d", PHASE)
```

**Load phase:**
```
phase_key = "phase-" + PHASE
task_list_id = config.mosic.task_lists[phase_key]

IF not task_list_id:
  ERROR: Phase {PHASE} not found in config. Run /gsd:add-phase first.

# Load phase with tasks
phase = mosic_get_task_list(task_list_id, {
  include_tasks: true
})

# Load phase pages (research, context) for executor context
phase_pages = mosic_get_entity_pages("MTask List", task_list_id, {
  include_subtree: false
})

# Find phase-level context pages
research_page = phase_pages.find(p => p.title contains "Research")
context_page = phase_pages.find(p => p.title contains "Context" or p.title contains "Decisions")

# Load their content if they exist
research_content = ""
IF research_page:
  research_content = mosic_get_page(research_page.name, {
    content_format: "markdown"
  }).content

context_content = ""
IF context_page:
  context_content = mosic_get_page(context_page.name, {
    content_format: "markdown"
  }).content

# Filter to plan tasks only
plan_tasks = phase.tasks.filter(t => t.title starts with "Plan")

IF plan_tasks.length == 0:
  ERROR: No plans found for Phase {PHASE}. Run /gsd:plan-phase first.
```

## 2. Discover Incomplete Plans

```
# Get plan tasks with their status
incomplete_plans = []
complete_plans = []

FOR each task in plan_tasks:
  IF task.done OR task.status == "Completed":
    complete_plans.push(task)
  ELSE:
    incomplete_plans.push(task)

# If --gaps-only, filter to gap closure plans
IF --gaps-only:
  gap_tag = config.mosic.tags.fix or "fix"
  incomplete_plans = incomplete_plans.filter(t =>
    t has tag gap_tag or t has tag "gap_closure"
  )

IF incomplete_plans.length == 0:
  Display: "All plans in Phase {PHASE} are complete!"
  Skip to step 6 (verify phase goal)
```

Display:
```
Phase {PHASE}: {phase.title}
- Total plans: {plan_tasks.length}
- Complete: {complete_plans.length}
- Remaining: {incomplete_plans.length}
```

## 3. Group by Wave

```
# Helper: Extract plan number from task title "Plan 01: ..."
function extract_plan_number(task_title):
  match = task_title.match(/Plan\s*(\d+)/i)
  return match ? match[1].padStart(2, '0') : "01"

# Helper: Extract wave from plan content (fallback if custom_wave not set)
function extract_wave(content):
  # Look for "**Wave:** N" in markdown content
  match = content.match(/\*\*Wave:\*\*\s*(\d+)/i)
  IF match: return parseInt(match[1])
  # Also try "Wave: N" format
  match = content.match(/Wave:\s*(\d+)/i)
  IF match: return parseInt(match[1])
  return 1

# Load plan pages and group by wave
waves = {}

FOR each plan_task in incomplete_plans:
  # Extract plan number for config lookups (from task title "Plan 01: ...")
  plan_number = extract_plan_number(plan_task.title)

  # Get plan page linked to task
  task_pages = mosic_get_entity_pages("MTask", plan_task.name, {
    include_subtree: false
  })
  plan_page = task_pages.find(p => p.title contains "Plan" or p.page_type == "Spec")

  plan_content = ""
  wave = 1
  autonomous = true

  IF plan_page:
    plan_content = mosic_get_page(plan_page.name, {
      content_format: "markdown"
    }).content

    # Extract wave from plan page "## Metadata" section
    # Format: "- **Wave:** N" or "**Wave:** N"
    wave = extract_wave(plan_content)

    # Extract autonomous flag from plan page
    # Format: "- **Autonomous:** yes/no"
    autonomous_match = plan_content.match(/\*\*Autonomous:\*\*\s*(yes|no|true|false)/i)
    IF autonomous_match:
      autonomous = autonomous_match[1].toLowerCase() in ["yes", "true"]

  waves[wave] = waves[wave] or []
  waves[wave].push({
    task: plan_task,
    page: plan_page,
    content: plan_content,
    number: plan_number,
    autonomous: autonomous
  })

# Sort waves
sorted_waves = Object.keys(waves).sort((a, b) => parseInt(a) - parseInt(b))
```

Display:
```
Wave structure:
| Wave | Plans | Status |
|------|-------|--------|
| 1    | 01, 02 | Pending |
| 2    | 03     | Waiting |
```

## 4. Execute Waves

For each wave in order:

Display:
```
-------------------------------------------
 GSD > EXECUTING WAVE {wave_num}
-------------------------------------------
```

### 4.1 Update Task Status to In Progress

```
FOR each plan in wave:
  mosic_update_document("MTask", plan.task.name, {
    status: "In Progress"
  })

  # Add execution started comment
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    reference_doctype: "MTask",
    reference_name: plan.task.name,
    content: "Execution started"
  })
```

### 4.2 Spawn Executors (Parallel)

```
# Build executor prompts with inlined content including phase context
executor_prompts = []

FOR each plan in wave:
  prompt = """
<objective>
Execute task {plan.task.identifier}: {plan.task.title}

Commit each subtask atomically. Create summary page. Update task status.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
**Task:** {plan.task.title}
**Task ID:** {plan.task.name}
**Phase:** {PHASE} - {phase.title}
**Workspace:** {workspace_id}

**Plan Content:**
{plan.content}

**Phase Research (if available):**
{research_content or "No research page for this phase."}

**Phase Context & Decisions (if available):**
{context_content or "No context page for this phase."}
</context>

<success_criteria>
- [ ] All subtasks executed
- [ ] Each subtask committed individually
- [ ] Summary page created in Mosic linked to task
- [ ] Task marked complete in Mosic
</success_criteria>
"""
  executor_prompts.push(prompt)

# Spawn all plans in wave in parallel using Task tool
FOR each prompt in executor_prompts:
  Task(
    prompt="First, read ~/.claude/agents/gsd-executor.md for your role.\n\n" + prompt,
    subagent_type="general-purpose",
    model="{executor_model}",
    description="Execute Plan " + plan.number
  )
```

### 4.3 Handle Executor Results

After each executor completes:

```
FOR each completed_plan:
  # Mark task complete
  mosic_complete_task(plan.task.name)

  # Update task metadata
  mosic_update_document("MTask", plan.task.name, {
    status: "Completed"
  })

  # Update checklist items based on summary
  task_with_checklists = mosic_get_task(plan.task.name, {
    include_checklists: true
  })

  FOR each completed_item in executor_summary.completed_tasks:
    # Flexible matching: check exact match, contains, or normalized match
    matching_checklist = task_with_checklists.checklists.find(c =>
      c.title == completed_item OR
      c.title.toLowerCase().includes(completed_item.toLowerCase()) OR
      completed_item.toLowerCase().includes(c.title.toLowerCase())
    )
    IF matching_checklist:
      mosic_update_document("MTask CheckList", matching_checklist.name, {
        done: true
      })

  # Create summary page linked to task
  # Standardized title format: "{identifier} Execution Summary"
  summary_page = mosic_create_entity_page("MTask", plan.task.name, {
    workspace_id: workspace_id,
    title: plan.task.identifier + " Execution Summary",
    page_type: "Document",
    icon: config.mosic.page_icons.summary,
    status: "Published",
    content: convert_to_editorjs(executor_summary),
    relation_type: "Related"
  })

  # Tag summary page
  mosic_batch_add_tags_to_document("M Page", summary_page.name, [
    config.mosic.tags.gsd_managed,
    config.mosic.tags.summary,
    config.mosic.tags.phase_tags[phase_key]
  ])

  # Store in config
  config.mosic.pages["phase-" + PHASE + "-summary-" + plan.number] = summary_page.name

  # Add completion comment with commit info
  # IMPORTANT: Comments must use HTML format
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    reference_doctype: "MTask",
    reference_name: plan.task.name,
    content: "<p><strong>Completed</strong></p>" +
      "<p><strong>Commits:</strong></p>" +
      "<ul>" + executor_summary.commits.map(c => "<li><code>" + c.hash + "</code>: " + c.message + "</li>").join("") + "</ul>"
  })

  # Create relation between plan page and summary page
  plan_page_id = config.mosic.pages["phase-" + PHASE + "-plan-" + plan.number]
  IF plan_page_id:
    mosic_create_document("M Relation", {
      workspace: workspace_id,
      source_doctype: "M Page",
      source_name: plan_page_id,
      target_doctype: "M Page",
      target_name: summary_page.name,
      relation_type: "Related"
    })
```

### 4.4 Proceed to Next Wave

After all plans in wave complete, proceed to next wave.

## 5. Aggregate Results

```
# Collect summaries from all plans
all_summaries = []

FOR each plan_task in plan_tasks:
  summary_page_id = config.mosic.pages["phase-" + PHASE + "-summary-" + plan.number]
  IF summary_page_id:
    summary = mosic_get_page(summary_page_id, {
      content_format: "markdown"
    })
    all_summaries.push(summary)

# Report phase execution status
Display:
"All {incomplete_plans.length} plans executed. Checking phase goal..."
```

## 6. Verify Phase Goal

**Check config:**
```
workflow_verifier = config.workflow.verifier (default: true)
IF workflow_verifier == false: Skip to step 7 (treat as passed)
```

Display:
```
-------------------------------------------
 GSD > VERIFYING PHASE GOAL
-------------------------------------------

Spawning verifier...
```

**Build verification context from Mosic:**

```
# Get phase goal from task list description
phase_goal = phase.description

# Get all must_haves from plan pages
must_haves = []
FOR each plan_page_id in config.mosic.pages matching "phase-{PHASE}-plan-*":
  plan_content = mosic_get_page(plan_page_id, {
    content_format: "markdown"
  })
  must_haves.push(extract_must_haves(plan_content))

# Get requirements for this phase
requirements_content = ""
IF config.mosic.pages.requirements:
  requirements_content = mosic_get_page(config.mosic.pages.requirements, {
    content_format: "markdown"
  }).content
```

**Spawn gsd-verifier:**

```markdown
<verification_context>

**Phase:** {PHASE}
**Phase Goal:** {phase_goal}

**Must-Haves to Verify:**
{must_haves}

**Execution Summaries:**
{all_summaries}

**Requirements:**
{requirements_content}

</verification_context>

<instructions>
Verify must_haves against actual codebase (not summary claims).
Return structured verification report.
</instructions>
```

```
Task(
  prompt=verifier_prompt,
  subagent_type="gsd-verifier",
  model="{verifier_model}",
  description="Verify Phase {PHASE}"
)
```

**Handle verifier return:**

```
# Create verification page
verification_page = mosic_create_entity_page("MTask List", task_list_id, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE + " Verification",
  page_type: "Document",
  icon: config.mosic.page_icons.verification,
  status: "Published",
  content: convert_to_editorjs(verifier_output),
  relation_type: "Related"
})

# Tag verification page
mosic_batch_add_tags_to_document("M Page", verification_page.name, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.verification,
  config.mosic.tags.phase_tags[phase_key]
])

config.mosic.pages["phase-" + PHASE + "-verification"] = verification_page.name
```

**Route by status:**
- `passed` -> Continue to step 7
- `human_needed` -> Present items, get approval or feedback
- `gaps_found` -> Route C (see offer_next)

## 7. Update Phase Status

```
# Mark phase task list as complete
mosic_update_document("MTask List", task_list_id, {
  status: "Completed",
  done: true
})

# Update config session
config.mosic.session.last_action = "execute-phase"
config.mosic.session.last_updated = "[ISO timestamp]"

write config.json
```

## 8. Update Requirements (if applicable)

```
# Get requirements page
IF config.mosic.pages.requirements:
  requirements_page = mosic_get_page(config.mosic.pages.requirements, {
    content_format: "markdown"
  })

  # Find phase requirements section and mark as Complete
  updated_requirements = mark_phase_requirements_complete(
    requirements_page.content,
    PHASE
  )

  mosic_update_document("M Page", config.mosic.pages.requirements, {
    content: convert_to_editorjs(updated_requirements)
  })
```

## 9. Commit Phase Completion (Code Changes)

```bash
# Check for uncommitted changes in codebase
git status --porcelain
```

**If changes exist:** Orchestrator made corrections between executor completions.

Use AskUserQuestion to confirm:
- Question: "Commit orchestrator corrections?"
- Options: "Yes, commit changes" / "No, skip commit"

**If user approves:**
```bash
git add -u && git commit -m "fix({phase}): orchestrator corrections"
```

## 10. Offer Next Steps

</process>

<offer_next>
Output based on verification status:

**Route A: Phase verified, more phases remain**

```
-------------------------------------------
 GSD > PHASE {PHASE} COMPLETE
-------------------------------------------

**Phase {PHASE}: {phase.title}**

{N} plans executed
Goal verified

Mosic: https://mosic.pro/app/MTask%20List/{task_list_id}

---

## Next Up

**Phase {PHASE+1}: {next_phase.title}**

`/gsd:discuss-phase {PHASE+1}` - gather context and clarify approach

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase {PHASE+1}` - skip discussion, plan directly
- `/gsd:verify-work {PHASE}` - manual acceptance testing

---
```

**Route B: Phase verified, milestone complete**

```
-------------------------------------------
 GSD > MILESTONE COMPLETE
-------------------------------------------

**{project.title}**

{N} phases completed
All phase goals verified

Mosic: https://mosic.pro/app/MProject/{project_id}

---

## Next Up

**Audit milestone** - verify requirements, cross-phase integration

`/gsd:audit-milestone`

<sub>`/clear` first -> fresh context window</sub>

---
```

**Route C: Gaps found**

```
-------------------------------------------
 GSD > PHASE {PHASE} GAPS FOUND
-------------------------------------------

**Phase {PHASE}: {phase.title}**

Score: {N}/{M} must-haves verified
Report: https://mosic.pro/app/page/{verification_page.name}

### What's Missing

{gap_summaries}

---

## Next Up

**Plan gap closure** - create additional plans

`/gsd:plan-phase {PHASE} --gaps`

<sub>`/clear` first -> fresh context window</sub>

---
```
</offer_next>

<checkpoint_handling>
Plans with `autonomous: false` have checkpoints. The execute-phase workflow handles:
- Subagent pauses at checkpoint, returns structured state
- Orchestrator presents to user, collects response
- Spawns fresh continuation agent

See `@~/.claude/get-shit-done/workflows/execute-phase.md` for complete details.
</checkpoint_handling>

<deviation_rules>
During execution, handle discoveries automatically:

1. **Auto-fix bugs** - Fix immediately, document in Summary
2. **Auto-add critical** - Security/correctness gaps, add and document
3. **Auto-fix blockers** - Can't proceed without fix, do it and document
4. **Ask about architectural** - Major structural changes, stop and ask user

Only rule 4 requires user intervention.
</deviation_rules>

<commit_rules>
**Per-Task Commits:**
After each task completes:
1. Stage only files modified by that task
2. Commit with format: `{type}({phase}-{plan}): {task-name}`
3. Types: feat, fix, test, refactor, perf, chore
4. Record commit hash for summary

**Never use:**
- `git add .`
- `git add -A`
- `git add src/` or any broad directory

**Always stage files individually.**
</commit_rules>

<error_handling>
```
IF mosic operation fails:
  Display: "Mosic sync warning: {error}"

  # Add to pending sync queue
  config.mosic.pending_sync = config.mosic.pending_sync or []
  config.mosic.pending_sync.push({
    type: "plan_completion",
    phase: PHASE,
    plan: plan_number,
    task_id: task_id,
    error: error_message,
    timestamp: now
  })

  write config.json

  Display: "Execution continues. Sync will retry on next /gsd:progress"
```
</error_handling>

<success_criteria>
- [ ] All incomplete plans in phase executed
- [ ] Each plan task marked complete in Mosic
- [ ] Checklist items updated based on summaries
- [ ] Summary pages created and linked to plan tasks
- [ ] Phase goal verified (must_haves checked)
- [ ] Verification page created in Mosic
- [ ] Phase task list marked complete
- [ ] Requirements page updated (phase requirements marked Complete)
- [ ] config.json updated with all page IDs
- [ ] User informed of next steps with Mosic URLs
</success_criteria>
