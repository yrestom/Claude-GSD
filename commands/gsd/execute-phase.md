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
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<critical_requirements>
**LOAD MOSIC TOOLS FIRST:**
Before using ANY Mosic MCP tool, you MUST call:
```
ToolSearch("mosic task list page entity create document complete update")
```

**RESPECT PARALLELIZATION CONFIG:**
Check `config.parallelization` before spawning agents. Parallel execution is conditional:

- **If `PARALLEL_ENABLED=true` AND `PARALLEL_PLAN_LEVEL=true`:** Spawn agents in parallel (multiple Task() calls in a SINGLE response). Cap at `MAX_CONCURRENT` agents.
- **If `PARALLEL_ENABLED=false` OR `PARALLEL_PLAN_LEVEL=false`:** Spawn agents sequentially (one at a time, wait for completion before next). This prevents concurrent file modifications, test conflicts, and build race conditions.
- **If wave has fewer plans than `MIN_PLANS_FOR_PARALLEL`:** Execute sequentially regardless of config (overhead of parallel coordination isn't worth it for 1 plan).

**TRUE PARALLEL EXECUTION (when enabled):**
To spawn agents in parallel within a wave, you MUST make all Task() calls in a SINGLE response message. A FOR loop does NOT create parallel execution - it creates sequential execution.

**PLAN-LEVEL ORCHESTRATION:**
Each plan gets a dedicated plan-orchestrator agent that reads execute-task.md
and follows its subtask orchestration process. The plan-orchestrator spawns one
executor per subtask, manages commits/summary/completion for that plan.

For parallel plan waves: multiple plan-orchestrators run simultaneously.
Each manages its own subtasks. Git conflicts between plans are handled by
the planner ensuring wave-concurrent plans don't modify overlapping files.
If git `index.lock` errors occur, fall back to sequential execution.
</critical_requirements>

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

## 0. Load Mosic Tools and Config

**CRITICAL FIRST STEP - Load Mosic MCP tools:**
```
ToolSearch("mosic task list page entity create document complete update comment relation batch")
```

Verify tools are available before proceeding.

**Load config:**
```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
model_profile = config.model_profile or "balanced"
model_overrides = config.model_overrides or {}

# Load parallelization config (defaults if not set)
PARALLEL_ENABLED = config.parallelization?.enabled ?? true
PARALLEL_PLAN_LEVEL = config.parallelization?.plan_level ?? true
MAX_CONCURRENT = config.parallelization?.max_concurrent_agents ?? 3
MIN_PLANS_FOR_PARALLEL = config.parallelization?.min_plans_for_parallel ?? 2

# Model resolution: override takes precedence over profile lookup
Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| plan-orchestrator | opus | sonnet | sonnet |
| gsd-verifier | sonnet | sonnet | haiku |

orchestrator_model = model_overrides["plan-orchestrator"] ?? lookup(model_profile)
verifier_model = model_overrides["gsd-verifier"] ?? lookup(model_profile)

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

# Discover phase page IDs (do NOT load content — executor loads from Mosic)
phase_pages = mosic_get_entity_pages("MTask List", task_list_id, {
  include_subtree: false
})

research_page = phase_pages.find(p => p.title contains "Research")
context_page = phase_pages.find(p => p.title contains "Context" or p.title contains "Decisions")

# Store IDs only — plan-orchestrator self-loads content via execute-task.md process
research_page_id = research_page ? research_page.name : null
context_page_id = context_page ? context_page.name : null
requirements_page_id = config.mosic.pages.requirements or null

# Fallback: discover requirements page from project entity pages
IF NOT requirements_page_id:
  project_pages = mosic_get_entity_pages("MProject", project_id, {
    include_subtree: false
  })
  req_page = project_pages.find(p => p.title.includes("Requirements"))
  IF req_page:
    requirements_page_id = req_page.name
    Display: "Discovered requirements page: " + requirements_page_id

# Filter to plan tasks only (tag-based, consistent with gsd-planner.md and gsd-plan-checker.md)
plan_tag = config.mosic.tags.plan
plan_tasks = phase.tasks.filter(t => t.tags.includes(plan_tag))

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
    ref_doc: "MTask",
    ref_name: plan.task.name,
    content: "Execution started"
  })
```

### 4.2 Build Plan-Orchestrator Prompts

**Build prompts with `<mosic_references>` — IDs only, no content embedding.**

Each plan gets a plan-orchestrator agent that reads execute-task.md and follows
its subtask orchestration process end-to-end (subtask execution, commits, summary, completion).

```
# Build prompts for all plans in wave
executor_prompts = []

FOR each plan in wave:
  # Build mosic_refs block — IDs only
  plan_mosic_refs = """
<mosic_references>
<task id="{plan.task.name}" identifier="{plan.task.identifier}" title="{plan.task.title}" />
<phase id="{task_list_id}" title="{phase.title}" number="{PHASE}" />
<workspace id="{workspace_id}" />
<plan_page id="{plan.page.name}" />
<research_page id="{research_page_id}" />
<context_page id="{context_page_id}" />
<requirements_page id="{requirements_page_id}" />
</mosic_references>
"""

  prompt = """
<objective>
Orchestrate execution of plan task {plan.task.identifier}: {plan.task.title}

You are a plan orchestrator. Read and follow the /gsd:execute-task command process
to manage subtask execution for this plan task.

One executor agent per subtask. Manage commits, summary, and completion.
The only variable: parallel vs sequential (determined by wave config).
</objective>

<execution_context>
@~/.claude/commands/gsd/execute-task.md
</execution_context>

""" + plan_mosic_refs + """

**Task to orchestrate:** {plan.task.identifier} ({plan.task.name})

<instructions>
- Start from step 0 (Load Mosic Tools and Config), skip step 1 (task already identified above), then follow steps 2-9
- Follow steps 2-9 of execute-task.md
- Spawn gsd-executor agents for each subtask (one agent per subtask, always)
- Manage commits, create summary page, mark task complete
- Return execution results when done
</instructions>
"""

  executor_prompts.push({
    prompt: prompt,
    plan: plan,
    mosic_refs: plan_mosic_refs
  })
```

**Step 2: Determine execution mode and spawn agents**

```
# Decide: parallel or sequential?
use_parallel = PARALLEL_ENABLED
  AND PARALLEL_PLAN_LEVEL
  AND executor_prompts.length >= MIN_PLANS_FOR_PARALLEL

# Initialize tracking variables
aborted = false
all_failures = []
```

**If `use_parallel=true`: Spawn agents in parallel (multiple Task() calls in ONE response)**

```
# CORRECT PATTERN: Multiple Task calls in ONE message
# This spawns all agents simultaneously, not sequentially

# Cap at MAX_CONCURRENT agents per batch
batches = chunk(executor_prompts, MAX_CONCURRENT)

FOR each batch in batches:
  # Make ALL Task calls in batch in ONE response message
  # If batch has 2 plans:
  Task(
    prompt=batch[0].prompt,
    subagent_type="general-purpose",
    model="{executor_model}",
    description="Execute Plan " + batch[0].plan.number
  )
  Task(
    prompt=batch[1].prompt,
    subagent_type="general-purpose",
    model="{executor_model}",
    description="Execute Plan " + batch[1].plan.number
  )
  # ALL Task() calls must be in the SAME response message

  # Wait for batch to complete before starting next batch
```

**Why parallel requires single response:**
- FOR loop = sequential (one agent finishes, then next starts)
- Multiple Task() in single response = parallel (all agents start simultaneously)

**If `use_parallel=false`: Spawn agents sequentially (one at a time) with inline result handling**

```
# Sequential execution: each plan completes before the next starts
# This prevents concurrent file modifications and build conflicts
# Result handling happens INLINE after each agent completes (no deferred zip)

FOR each executor_prompt in executor_prompts:
  agent_result = Task(
    prompt=executor_prompt.prompt,
    subagent_type="general-purpose",
    model="{executor_model}",
    description="Execute Plan " + executor_prompt.plan.number
  )

  # IMMEDIATELY handle this result before spawning next agent
  plan = executor_prompt.plan

  # --- Run shared Post-Plan Completion procedure (see 4.4) ---
  post_plan_result = run_post_plan_completion({
    plan: plan,
    agent_result: agent_result
  })

  IF post_plan_result.aborted:
    aborted = true
    BREAK  # Exit the FOR loop — skip remaining plans

  # THEN continue to next plan in wave
```

### 4.3 Handle Executor Results (Parallel Mode Only)

After all parallel executors in wave complete, pair results with plans:

```
# This section only applies to parallel mode — sequential results are handled inline above
IF use_parallel:
  # Results correspond to executor_prompts by spawn order
  FOR each (ep, agent_result) in zip(executor_prompts, wave_results):
    plan = ep.plan

    # --- Run shared Post-Plan Completion procedure (see 4.4) ---
    post_plan_result = run_post_plan_completion({
      plan: plan,
      agent_result: agent_result
    })

    IF post_plan_result.aborted:
      aborted = true
      BREAK  # Exit the FOR loop — skip remaining plans
```

### 4.4 Post-Plan Completion (shared procedure)

**This procedure is called by both sequential (4.2) and parallel (4.3) paths after each plan-orchestrator completes.**

The plan-orchestrator follows execute-task.md end-to-end, which handles all lifecycle operations internally
(per-subtask review if enabled, commits, summary page, task completion). So post_plan_completion
is a lightweight validation and bookkeeping step.

Given: `plan`, `agent_result`

Returns: `{ aborted: bool }`

```
function run_post_plan_completion(args):
  plan = args.plan

  # Validate plan-orchestrator completed successfully
  IF agent_result contains "## TASK EXECUTION COMPLETE" or agent_result contains "TASK COMPLETE":

    # Find summary page (created by plan-orchestrator via execute-task.md step 7)
    task_pages = mosic_get_entity_pages("MTask", plan.task.name, { include_subtree: false })
    summary_page = task_pages.find(p => p.title.includes("Execution Summary"))

    IF summary_page:
      # Tag summary page (idempotent — safe even if plan-orchestrator already tagged)
      mosic_batch_add_tags_to_document("M Page", summary_page.name, [
        config.mosic.tags.gsd_managed,
        config.mosic.tags.summary,
        config.mosic.tags.phase_tags[phase_key]
      ])

      # Store in config
      config.mosic.pages["phase-" + PHASE + "-summary-" + plan.number] = summary_page.name

      # Create relation between plan page and summary page (page→page)
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

    # Add orchestrator completion comment
    # IMPORTANT: Comments must use HTML format
    mosic_create_document("M Comment", {
      workspace: workspace_id,
      ref_doc: "MTask",
      ref_name: plan.task.name,
      content: "<p><strong>Phase Orchestrator: Plan completed</strong></p>"
    })

  ELSE:
    # Plan-orchestrator failed
    all_failures.push({ plan: plan, result: agent_result })

    Display: "Plan " + plan.task.identifier + " failed."
    Display: agent_result

    AskUserQuestion({
      questions: [{
        question: "Plan " + plan.task.identifier + " failed. How should we proceed?",
        header: "Plan Failed",
        options: [
          { label: "Continue", description: "Skip this plan, continue with remaining plans" },
          { label: "Abort phase", description: "Stop execution of remaining plans" }
        ],
        multiSelect: false
      }]
    })

    IF user_selection == "Abort phase":
      return { aborted: true }

  return { aborted: false }
```

### 4.5 Proceed to Next Wave

After all plans in wave complete, check abort flag:

```
IF aborted:
  BREAK  # Exit the wave loop — skip remaining waves, go to step 7
```

Proceed to next wave.

## 5. Aggregate Results

```
# Collect summaries from all plans
all_summaries = []

FOR each (plan_task, index) in plan_tasks:
  plan_number = extract_plan_number(plan_task.title)  # Uses helper from step 3
  summary_page_id = config.mosic.pages["phase-" + PHASE + "-summary-" + plan_number]
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
  prompt="First, read ~/.claude/agents/gsd-verifier.md for your complete role instructions.\n\n" + verifier_prompt,
  subagent_type="general-purpose",
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
# Determine if arriving from an abort (partial completion) or normal completion
# Abort arrives here when aborted == true from steps 4.2/4.3
# Normal completion arrives here after all plans executed and phase goal verified

# Re-query plan tasks from Mosic for fresh status (local plan_tasks array is stale
# after execution — tasks were marked complete by the plan-orchestrator)
fresh_phase = mosic_get_task_list(task_list_id, { include_tasks: true })
plan_tasks = fresh_phase.tasks.filter(t => t.tags.includes(plan_tag))

# Check if all plan tasks are actually complete
all_plans_done = plan_tasks.every(t => t.done or t.status == "Completed")

IF all_plans_done:
  # Normal completion — all plans executed successfully
  mosic_update_document("MTask List", task_list_id, {
    status: "Completed",
    done: true
  })
ELSE:
  # Partial completion (abort) — do NOT mark as Completed
  completed_count = plan_tasks.filter(t => t.done or t.status == "Completed").length
  mosic_update_document("MTask List", task_list_id, {
    status: "In Progress"
  })
  # Add comment explaining partial state
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    ref_doc: "MTask List",
    ref_name: task_list_id,
    content: "<p><strong>Partial Execution</strong></p>" +
      "<p>Completed " + completed_count + "/" + plan_tasks.length + " plans.</p>" +
      (all_failures.length > 0 ? "<p>Failed plans: " + all_failures.map(f => f.plan.task.identifier).join(", ") + "</p>" : "")
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
git add config.json  # Stage only the specific files modified by orchestrator corrections
git commit -m "fix({phase}): orchestrator corrections"
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
**Orchestrator-Managed Commits:**
Plan-orchestrator agents manage subtask-level commits via execute-task.md process.
Each subtask gets an atomic commit managed by the plan-orchestrator.
execute-phase does NOT commit code directly — it manages plan-level orchestration.
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
- [ ] Parallelization config loaded and respected
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
