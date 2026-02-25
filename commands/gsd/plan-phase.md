---
name: gsd:plan-phase
description: Create detailed execution plans for a phase in Mosic (Mosic-native)
argument-hint: "[phase] [--research] [--skip-research] [--gaps] [--skip-verify]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
  - mcp__context7__*
---

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/workflows/context-extraction.md
@~/.claude/get-shit-done/workflows/decompose-requirements.md
@~/.claude/get-shit-done/workflows/distributed-planning.md
</execution_context>

<objective>
Create executable plans as MTasks in Mosic with linked plan pages.

**Default flow:** Research (if needed) -> Plan -> Verify -> Done

**Orchestrator role:** Parse arguments, validate phase, research domain (unless skipped), spawn gsd-planner agent, verify plans, iterate until plans pass, sync all to Mosic.

**Architecture:** All state in Mosic. Plans become MTasks with plan pages. Research becomes M Pages linked to phase. config.json stores entity IDs for session context.
</objective>

<context>
Phase number: $ARGUMENTS (optional - auto-detects next unplanned phase if not provided)

**Flags:**
- `--research` - Force re-research even if research page exists
- `--skip-research` - Skip research entirely, go straight to planning
- `--gaps` - Gap closure mode (reads verification page, skips research)
- `--skip-verify` - Skip planner -> checker verification loop
</context>

<process>

## 1. Load Config and Validate

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

Extract Mosic config:
```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
```

**Resolve model profile:**
```
model_profile = config.model_profile or "balanced"
model_overrides = config.model_overrides or {}

# Model resolution: override takes precedence over profile lookup
Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-phase-researcher | opus | opus | haiku |
| gsd-planner | opus | opus | sonnet |
| gsd-plan-checker | sonnet | sonnet | haiku |

For each agent: model = model_overrides[agent_name] ?? lookup(model_profile)
```

## 2. Parse Arguments and Normalize Phase

Extract from $ARGUMENTS:
- Phase number (integer or decimal like `2.1`)
- `--research`, `--skip-research`, `--gaps`, `--skip-verify` flags

**If no phase number:** Auto-detect next unplanned phase from Mosic.

**Normalize:**
```
IF PHASE is integer: PHASE = printf("%02d", PHASE)
ELIF PHASE has decimal: PHASE = printf("%02d.%s", integer_part, decimal_part)
```

## 3. Load Phase from Mosic

```
# Get task_list_id from config
phase_key = "phase-" + PHASE
task_list_id = config.mosic.task_lists[phase_key]

IF not task_list_id:
  ERROR: Phase {PHASE} not found in config. Run /gsd:add-phase first.

# Load phase with tasks
phase = mosic_get_task_list(task_list_id, {
  include_tasks: true
})

# Load phase pages
phase_pages = mosic_get_entity_pages("MTask List", task_list_id, {
  include_subtree: false
})

# Check for existing pages
research_page = phase_pages.find(p => p.title contains "Research")
context_page = phase_pages.find(p => p.title contains "Context")
existing_plan_tasks = phase.tasks.filter(t => t.title starts with "Plan")
```

Display:
```
Loading Phase {PHASE}: {phase.title}
- Existing plans: {existing_plan_tasks.length}
- Research: {research_page ? "Found" : "None"}
- Context: {context_page ? "Found" : "None"}
```

## 4. Validate Phase Exists in Project

```
project = mosic_get_project(project_id, {
  include_task_lists: true
})

phase_exists = project.task_lists.find(tl => tl.name == task_list_id)

IF not phase_exists:
  ERROR: Phase task list {task_list_id} not found in project.
```

## 5. Handle Research

**If `--gaps` flag:** Skip research (gap closure uses verification page).

**If `--skip-research` flag:** Skip to step 6.

**Check config for research setting:**
```
workflow_research = config.workflow.research (default: true)
```

**If `workflow.research` is `false` AND `--research` flag NOT set:** Skip to step 6.

**Check for existing research page:**

```
IF research_page AND not --research flag:
  research_page_id = research_page.name
  Display: "Using existing research page: {research_page.title}"
  Skip to step 6
```

**If no research page OR `--research` flag set:**

Display:
```
-------------------------------------------
 GSD > RESEARCHING PHASE {PHASE}
-------------------------------------------

Spawning researcher...
```

### Spawn gsd-phase-researcher

Gather context for research:

```
# Load context page content (plain — only needed for section extraction of user decisions)
context_content = ""
IF context_page:
  context_content = mosic_get_page(context_page.name, {
    content_format: "plain"
  }).content

# Requirements page ID only — researcher self-loads content from Mosic
requirements_page_id = config.mosic.pages.requirements

# Roadmap page ID for mosic_references
roadmap_page_id = config.mosic.pages.roadmap or null
```

**Extract user decisions from context page (if exists):**
```
locked_decisions = ""
deferred_ideas = ""
discretion_areas = ""

IF context_content:
  locked_decisions = extract_section(context_content, "## Decisions")
  deferred_ideas = extract_section(context_content, "## Deferred Ideas")
  discretion_areas = extract_section(context_content, "## Claude's Discretion")

user_decisions_xml = """
<user_decisions>
<locked_decisions>
""" + (locked_decisions or "No locked decisions — all at Claude's discretion.") + """
</locked_decisions>

<deferred_ideas>
""" + (deferred_ideas or "No deferred ideas.") + """
</deferred_ideas>

<discretion_areas>
""" + (discretion_areas or "All areas at Claude's discretion.") + """
</discretion_areas>
</user_decisions>
"""
```

Fill research prompt:

```markdown
""" + user_decisions_xml + """

<mosic_references>
<phase id="{task_list_id}" title="{phase.title}" number="{PHASE}" />
<workspace id="{workspace_id}" />
<context_page id="{context_page ? context_page.name : null}" />
<requirements_page id="{requirements_page_id}" />
<roadmap_page id="{roadmap_page_id}" />
</mosic_references>

<objective>
Research how to implement Phase {PHASE}: {phase.title}

Answer: "What do I need to know to PLAN this phase well?"
</objective>

<context>
**Phase description:**
{phase.description}
</context>

<output>
Create the research page directly in Mosic using mosic_create_entity_page. Return the created page ID and a brief summary of findings. The orchestrator will validate the page was created successfully.
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {PHASE}"
)
```

### Validate Research Page in Mosic

After researcher returns with `## RESEARCH COMPLETE`:

```
# Extract page ID from agent output
research_page_id = extract_field(research_findings, "Research Page ID:") or
                   extract_page_id_from_url(research_findings)

# Validate the agent created/updated the research page in Mosic
IF research_page_id:
  validated_page = mosic_get_page(research_page_id, { content_format: "plain" })
  IF NOT validated_page OR NOT validated_page.content:
    ERROR: "Agent reported page ID {research_page_id} but page not found or empty in Mosic"
ELSE:
  # Fallback: check entity pages for newly created research page
  phase_pages_updated = mosic_get_entity_pages("MTask List", task_list_id, {
    include_subtree: false
  })
  research_page_found = phase_pages_updated.find(p => p.title contains "Research")
  IF research_page_found:
    research_page_id = research_page_found.name
  ELSE:
    ERROR: "Agent did not create research page. Check agent output."

# Update config
config.mosic.pages["phase-" + PHASE + "-research"] = research_page_id
write config.json
```

## 6. Check Existing Plans

```
IF existing_plan_tasks.length > 0:
  Display: "Found {existing_plan_tasks.length} existing plan(s)"

  Offer:
  1) Continue planning (add more plans)
  2) View existing plans
  3) Replan from scratch (will archive existing)

  Wait for response.

  IF replan:
    # Archive existing plan tasks
    FOR each task in existing_plan_tasks:
      mosic_update_document("MTask", task.name, {
        is_archived: true
      })
```

## 7. Discover Page IDs for Planner

All IDs already known from step 3 or step 5. No content loading — planner self-loads.

```
research_page_id = research_page ? research_page.name : null
context_page_id = context_page ? context_page.name : null
requirements_page_id = config.mosic.pages.requirements or null
roadmap_page_id = config.mosic.pages.roadmap or null

# Gap closure verification page (if --gaps mode)
verification_page_id = null
IF --gaps:
  verification_page = phase_pages.find(p => p.title contains "Verification")
  verification_page_id = verification_page ? verification_page.name : null
```

## 7.5. Decompose Phase into Requirement Groups

Follow `@~/.claude/get-shit-done/workflows/decompose-requirements.md`:

```
# 1. Check for existing decomposition from research-phase
decomposition = config.mosic.session?.decomposition
use_distributed = false
requirement_groups = []
dependency_order = []
distributed_config = config.workflow?.distributed ?? {}
planning_threshold = distributed_config.planning_threshold ?? distributed_config.threshold ?? 6

IF decomposition AND decomposition.phase == PHASE:
  # Reuse: follow <decompose> "reuse existing" path
  requirement_groups = decomposition.groups
  dependency_order = decomposition.dependency_order
  use_distributed = true

ELIF requirements_page_id AND NOT --gaps:
  # Decompose fresh: follow <decompose> with these inputs:
  #   requirements_page_id, current phase (PHASE / phase.title), config
  # Extract phase_requirements using <requirements_extraction> from @context-extraction.md
  # Then group, merge/split, order using <decompose> + <tier_based_ordering>
  result = decompose(requirements_page_id, PHASE, phase.title, config, { threshold_override: planning_threshold })
  use_distributed = result.use_distributed
  requirement_groups = result.requirement_groups
  dependency_order = result.dependency_order

# CRITICAL: Always extract phase_requirements for Steps 9-10 (coverage + checker)
phase_requirements = []
IF requirements_page_id:
  # Use <requirements_extraction> from @context-extraction.md
  phase_requirements = extract_phase_requirements(requirements_page_id, PHASE, phase.title)
```

## 8. Spawn gsd-planner Agent(s)

```
IF use_distributed:
  # --- DISTRIBUTED: Follow @~/.claude/get-shit-done/workflows/distributed-planning.md ---
  # Follow <sequential_planner_orchestration> with these scope-specific inputs:

  Display:
  """
  -------------------------------------------
   GSD > PLANNING PHASE {PHASE} (DISTRIBUTED)
  -------------------------------------------

  {phase_requirements.length} requirements ≥ threshold ({planning_threshold}) → {requirement_groups.length} groups, executing in dependency order:
  {dependency_order.map(g => g.number + ". " + g.title).join("\n")}
  """

  # Command provides scope-specific parameters to workflow:
  #   build_mosic_refs(group) returns:
  #     <mosic_references>
  #     <phase id="{task_list_id}" title="{phase.title}" number="{PHASE}" />
  #     <workspace id="{workspace_id}" />
  #     <project id="{project_id}" />
  #     <research_page id="{group_research_page_id}" />   ← group-specific if available
  #     <context_page id="{context_page_id}" />
  #     <requirements_page id="{requirements_page_id}" />
  #     <roadmap_page id="{roadmap_page_id}" />
  #     + verification_page if --gaps
  #     </mosic_references>
  #
  #   planner_agent_path = "~/.claude/agents/gsd-planner.md"
  #   planner_model = from config profile table
  #   planning_mode = --gaps ? "gap_closure" : "standard"
  #   tdd_config = config.workflow?.tdd ?? "auto"
  #   scope_label = "Phase " + PHASE
  #   decomposition = config.mosic.session.decomposition (for group research page IDs)

  # Workflow spawns planners sequentially in dependency_order,
  # accumulating all_prior_plan_pages and all_plan_results.
  # Output: all_prior_plan_pages[], all_plan_results[]

ELSE:
  # --- SINGLE PLANNER (existing behavior, unchanged) ---

  Display:
  """
  -------------------------------------------
   GSD > PLANNING PHASE {PHASE}
  -------------------------------------------

  Spawning planner...
  """

  Build lean prompt with page IDs only — planner self-loads all content from Mosic:

  planner_prompt = """
<mosic_references>
<phase id="{task_list_id}" title="{phase.title}" number="{PHASE}" />
<workspace id="{workspace_id}" />
<project id="{project_id}" />
<research_page id="{research_page_id}" />
<context_page id="{context_page_id}" />
<requirements_page id="{requirements_page_id}" />
<roadmap_page id="{roadmap_page_id}" />
""" + (verification_page_id ? '<verification_page id="' + verification_page_id + '" />\n' : "") + """
</mosic_references>

<planning_config>
<mode>""" + (--gaps ? "gap_closure" : "standard") + """</mode>
<tdd_config>""" + (config.workflow?.tdd ?? "auto") + """</tdd_config>
</planning_config>

<downstream_consumer>
Output consumed by /gsd:execute-phase → execute-task.md
Plans must include:
- Structured task breakdown
- Dependencies between tasks
- Wave assignments for parallel execution
- Verification criteria
- must_haves for goal-backward verification
- **MTask subtask entities** under each plan task (execute-task.md requires these to exist)
</downstream_consumer>

<output_format>
Create all plan MTasks, M Pages, and subtasks directly in Mosic using MCP tools. Return the created task IDs, page IDs, and a structured summary. The orchestrator will validate the entities were created correctly.
</output_format>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-planner.md for your role.\n\n" + planner_prompt,
    subagent_type="general-purpose",
    model="{planner_model}",
    description="Plan Phase {PHASE}"
  )
```

## 9. Handle Planner Return and Validate Mosic Entities

```
IF use_distributed:
  # --- DISTRIBUTED: Follow @~/.claude/get-shit-done/workflows/distributed-planning.md ---

  # 1. Follow <coverage_verification> with:
  #    all_plan_results, phase_requirements, PHASE
  #    Validates entity IDs in config, checks coverage completeness

  # 2. Follow <cross_group_relations> with:
  #    all_plan_results, workspace_id
  #    Validates M Relations for cross-group dependencies

  # Config storage pattern:
  #   config.mosic.tasks["phase-" + PHASE + "-plan-" + plan_number] = task_id
  #   config.mosic.pages["phase-" + PHASE + "-plan-" + plan_number] = page_id

  # Output: created_plan_tasks[] (sequential numbering for verification step)

ELSE:
  # --- SINGLE PLANNER (validate agent-created entities) ---

  Parse planner output for `## PLANNING COMPLETE`:

  # Extract task IDs and page IDs from planner output
  plan_task_ids = extract_field(planner_output, "Task IDs:")
  plan_page_ids = extract_field(planner_output, "Page IDs:")

  # Validate entities exist in Mosic
  # 1. Check tasks are in the correct phase task list
  phase_tasks = mosic_get_task_list(task_list_id, { include_tasks: true })
  created_plan_tasks = phase_tasks.tasks.filter(t => t.title starts with "Plan")

  IF created_plan_tasks.length == 0:
    ERROR: "Planner did not create any plan tasks in Mosic. Check agent output."

  **For each plan task found:**

  plan_number = printf("%02d", plan_index + 1)

  # Verify task exists and has content
  plan_task = mosic_get_task(created_plan_tasks[plan_index].name, {
    description_format: "plain"
  })
  IF NOT plan_task:
    ERROR: "Plan task {plan_number} not found in Mosic"

  plan_task_id = plan_task.name

  # Verify linked plan page exists
  task_pages = mosic_get_entity_pages("MTask", plan_task_id, {
    include_subtree: false
  })
  plan_page = task_pages.find(p => p.title contains "Plan" OR p.page_type == "Spec")
  IF NOT plan_page:
    WARN: "Plan task {plan_number} has no linked plan page"

  # Verify tags are applied
  task_tags = mosic_get_document_tags("MTask", plan_task_id)
  IF NOT task_tags.find(t => t.tag == config.mosic.tags.gsd_managed):
    WARN: "Plan task {plan_number} missing gsd-managed tag"

  # Store in config
  config.mosic.tasks["phase-" + PHASE + "-plan-" + plan_number] = plan_task_id
  IF plan_page:
    config.mosic.pages["phase-" + PHASE + "-plan-" + plan_number] = plan_page.name

  # Verify task dependencies (M Relations) exist
  FOR each plan_task with expected depends_on:
    relations = mosic_get_document_relations("MTask", plan_task_id)
    FOR each expected_dep in depends_on:
      dep_task_id = config.mosic.tasks["phase-" + PHASE + "-plan-" + expected_dep]
      IF dep_task_id AND NOT relations.find(r => r.target_name == dep_task_id):
        WARN: "Missing dependency relation: Plan {plan_number} -> Plan {expected_dep}"

  Display:
  """
  Validated {created_plan_tasks.length} plan(s) in Mosic
  Task List: https://mosic.pro/app/MTask%20List/{task_list_id}
  """
```

## 10. Verification Loop (unless --skip-verify)

**Check config:**
```
workflow_plan_check = config.workflow.plan_check (default: true)
IF workflow_plan_check == false OR --skip-verify: Skip to step 11
```

```
IF use_distributed AND NOT --skip-verify:

  # --- DISTRIBUTED VERIFICATION ---
  # Follow <distributed_verification> in @~/.claude/get-shit-done/workflows/distributed-planning.md
  #
  # Command provides scope-specific inputs:
  #   requirement_groups, all_plan_results, phase_requirements
  #   phase_description = phase.description
  #   PHASE, checker_model, requirements_page_id
  #   checker_agent_path = "~/.claude/agents/gsd-plan-checker.md"
  #
  # Workflow handles:
  #   Phase 1: Parallel group-scoped verification (one checker per group)
  #   Phase 2: Cross-group verification (coverage matrix + dependency acyclicity)
  #   Issue handling: display issues, enter revision loop (iteration_count < 3)
  #
  # Output: all checks passed → proceed to step 11, or issues → revision loop

ELSE:
  # --- SINGLE PLANNER VERIFICATION (existing behavior, unchanged) ---

  Display:
  """
  -------------------------------------------
   GSD > VERIFYING PLANS
  -------------------------------------------

  Spawning plan checker...
  """

  **Spawn gsd-plan-checker:**

  # Build requirements XML from phase_requirements already extracted in Step 7.5 (no re-fetch)
  phase_requirements_xml = "<phase_requirements>\n"
  IF phase_requirements:
    FOR each req in phase_requirements:
      phase_requirements_xml += '<requirement id="' + req.id + '">' + req.description + '</requirement>\n'
  ELSE:
    phase_requirements_xml += "No explicit requirements found for this phase. Derive from phase goal.\n"
  phase_requirements_xml += "</phase_requirements>"

  # Collect plan page IDs for checker's mosic_references (checker self-loads content)
  plan_page_ids = []
  FOR each (plan_index, plan_task) in enumerate(created_plan_tasks):
    plan_number = printf("%02d", plan_index + 1)
    plan_page_id = config.mosic.pages["phase-" + PHASE + "-plan-" + plan_number]
    IF plan_page_id:
      plan_page_ids.push(plan_page_id)

  checker_prompt = """
<verification_context>

**Phase:** {PHASE}
**Phase Goal:** {phase.description}

""" + phase_requirements_xml + """

</verification_context>

<mosic_references>
<phase id=\"""" + task_list_id + """\" title=\"""" + phase.title + """\" number=\"""" + PHASE + """\" />
<requirements_page id=\"""" + (requirements_page_id or "") + """\" />
""" + plan_page_ids.map(id => '<plan_page id="' + id + '" />').join("\n") + """
</mosic_references>

<expected_output>
Return one of:
- ## VERIFICATION PASSED - all checks pass
- ## ISSUES FOUND - structured issue list
</expected_output>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-plan-checker.md for your role.\n\n" + checker_prompt,
    subagent_type="general-purpose",
    model="{checker_model}",
    description="Verify Phase {PHASE} plans"
  )

  **Handle checker return:**

  IF `## VERIFICATION PASSED`: Proceed to step 11

  IF `## ISSUES FOUND`:
  - Display issues
  - If iteration_count < 3: Spawn planner with revision prompt
  - After revision: Update plan pages in Mosic, re-verify
  - If iteration_count >= 3: Offer force proceed, guidance, or abandon
```

## 11. Update Config and Finalize

```
config.mosic.session.last_action = "plan-phase"
config.mosic.session.active_phase = task_list_id
config.mosic.session.last_updated = "[ISO timestamp]"

write config.json
```

## 12. Present Final Status

```
-------------------------------------------
 GSD > PHASE {PHASE} PLANNED
-------------------------------------------

**Phase {PHASE}: {phase.title}** - {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}

Mosic Links:
- Task List: https://mosic.pro/app/MTask%20List/{task_list_id}
- Plans: {N} tasks with linked pages

---

## Next Up

**Execute Phase {PHASE}** - run all {N} plans

`/gsd:execute-phase {PHASE}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- View plans in Mosic
- `/gsd:plan-phase {PHASE} --research` - re-research first

---
```

</process>

<error_handling>
```
IF mosic validation fails during plan verification:
  - Log warning with error message
  - Store partial state in config.mosic.pending_sync
  - Continue validating remaining plans
  - Display: "Some plans may not have been created correctly. Check /gsd:progress"
```
</error_handling>

<success_criteria>
- [ ] Phase loaded from Mosic
- [ ] Research completed (unless skipped) and page validated (created by agent)
- [ ] Distributed threshold evaluated (decomposition reused or computed fresh)
- [ ] If distributed: planners spawned sequentially in dependency order with prior plan page IDs
- [ ] If distributed: each planner receives assigned requirements + prior plans XML
- [ ] If distributed: subtasks created by planners (3-8 per plan task)
- [ ] If single: gsd-planner spawned with page IDs (planner self-loads content)
- [ ] If single: subtasks created under each plan task (3-15 per plan)
- [ ] Plans validated as MTasks linked to phase task list (created by agent)
- [ ] Plan pages validated and linked to plan tasks (created by agent)
- [ ] Checklist items validated for each plan task (created by agent)
- [ ] Task dependencies validated as M Relations (created by agent)
- [ ] Tags validated (gsd-managed, plan, phase-NN) (applied by agent)
- [ ] If distributed: group-scoped verification (parallel) + cross-group verification
- [ ] If single: verification passed (unless skipped)
- [ ] config.json updated with all entity IDs
- [ ] User sees Mosic URLs and next steps
</success_criteria>
