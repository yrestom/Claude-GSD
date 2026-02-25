---
name: gsd:plan-task
description: Create execution plan with subtasks for a task in the current phase
argument-hint: "[task-identifier] [--quick | --skip-verify]"
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

<objective>
Create an execution plan for a specific task, decomposing it into subtasks with acceptance criteria.

**Key differences from plan-phase:**
- Creates subtasks under parent task (using `parent_task` field)
- Creates single Plan M Page linked to task
- Uses task checklist for acceptance criteria
- 1-5 subtasks max (smaller scope than phase plans)
- Inherits phase context (research, decisions) if available

**Spawns:** gsd-planner in task-mode
**Output:** Subtasks + Plan Page linked to task
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/content-formatting.md
@~/.claude/get-shit-done/workflows/context-extraction.md
@~/.claude/get-shit-done/workflows/decompose-requirements.md
@~/.claude/get-shit-done/workflows/distributed-planning.md
</execution_context>

<context>
Task identifier: $ARGUMENTS (e.g., "AUTH-5" or task UUID)

**Flags:**
- `--quick` - Quick planning mode: 1-3 simple subtasks, no checker, direct to execution
- `--skip-verify` - Skip planner -> checker verification loop
</context>

<process>

## 1. Load Config and Validate

```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

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
| gsd-planner | opus | opus | sonnet |
| gsd-plan-checker | sonnet | sonnet | haiku |

For each agent: model = model_overrides[agent_name] ?? lookup(model_profile)
```

## 2. Parse Arguments and Load Task

```
# Extract task identifier and flags
task_identifier = extract_identifier($ARGUMENTS)
quick_mode = $ARGUMENTS contains "--quick"
skip_verify = $ARGUMENTS contains "--skip-verify" or quick_mode

# Quick mode implies skip-verify (no checker needed for simple tasks)

# Load task from Mosic
# Try by identifier first, fall back to active task
IF task_identifier:
  task = mosic_get_task(task_identifier, {
    workspace_id: workspace_id,
    description_format: "none"
  })
ELSE:
  # Use active task from config
  task_id = config.mosic.session?.active_task
  IF not task_id:
    ERROR: "No task identifier provided and no active task. Provide task ID or run /gsd:task first."
  task = mosic_get_task(task_id, { description_format: "none" })

TASK_ID = task.name
TASK_IDENTIFIER = task.identifier
TASK_TITLE = task.title
```

Display:
```
-------------------------------------------
 GSD > PLANNING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
```

## 3. Load Task Pages and Check Existing Plan

```
# Get existing pages linked to task
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

# Check for existing plan page
existing_plan_page = task_pages.find(p =>
  p.title.includes("Plan") or p.page_type == "Spec"
)

# Check for existing subtasks
task_with_children = mosic_search_tasks({
  workspace_id: workspace_id,
  filters: { parent_task: TASK_ID }
})

existing_subtasks = task_with_children.results or []

IF existing_plan_page or existing_subtasks.length > 0:
  Display:
  """
  Found existing planning artifacts:
  - Plan page: {existing_plan_page ? "Yes" : "No"}
  - Subtasks: {existing_subtasks.length}
  """

  AskUserQuestion({
    questions: [{
      question: "How should we proceed?",
      header: "Existing Plan",
      options: [
        { label: "Continue (Recommended)", description: "Add to existing plan" },
        { label: "Replan", description: "Archive existing and create new" },
        { label: "View existing", description: "Show current plan details" }
      ],
      multiSelect: false
    }]
  })

  IF user_selection == "Replan":
    # Archive existing subtasks
    FOR each subtask in existing_subtasks:
      mosic_update_document("MTask", subtask.name, {
        is_archived: true
      })
    # Mark plan page as outdated
    IF existing_plan_page:
      mosic_update_document("M Page", existing_plan_page.name, {
        status: "Archived"
      })
    existing_plan_page = null

  ELIF user_selection == "View existing":
    IF existing_plan_page:
      plan_content = mosic_get_page(existing_plan_page.name, {
        content_format: "markdown"
      })
      Display: plan_content.content
    Display: "Subtasks: " + existing_subtasks.map(s => s.identifier + ": " + s.title).join("\n")
    EXIT
```

## 4. Discover Phase/Task Page IDs

Discover page IDs only — planner self-loads all content from Mosic.

```
# Get parent task list (phase)
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Get phase pages (IDs only)
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

research_page = phase_pages.find(p => p.title.includes("Research"))
context_page = phase_pages.find(p => p.title.includes("Context") or p.title.includes("Decisions"))

# Store IDs only — planner self-loads content
research_page_id = research_page ? research_page.name : null
context_page_id = context_page ? context_page.name : null
requirements_page_id = config.mosic.pages.requirements or null

# Task-specific pages
task_context_page = task_pages.find(p => p.title.includes("Context"))
task_research_page = task_pages.find(p => p.title.includes("Research"))
task_context_page_id = task_context_page ? task_context_page.name : null
task_research_page_id = task_research_page ? task_research_page.name : null
```

Display:
```
Context discovered:
- Phase research: {research_page_id ? "Yes" : "No"}
- Phase context: {context_page_id ? "Yes" : "No"}
- Task context: {task_context_page_id ? "Yes" : "No"}
- Task research: {task_research_page_id ? "Yes" : "No"}
```

## 4.5. Decompose Task for Distributed Planning

Follow `@~/.claude/get-shit-done/workflows/decompose-requirements.md`:

```
use_distributed = false
requirement_groups = []
dependency_order = []
task_requirements = []

# Check for decomposition from research-task (stored in config)
task_decomposition = config.mosic.session?.task_decomposition
IF task_decomposition AND task_decomposition.task == TASK_IDENTIFIER:
  # Reuse decomposition from research-task
  requirement_groups = task_decomposition.groups
  dependency_order = task_decomposition.dependency_order
  use_distributed = true
  Display: "Reusing decomposition from research: " + requirement_groups.length + " groups"

  # Extract task_requirements for coverage verification (Step 7)
  task_requirements = []
  FOR each group in requirement_groups:
    FOR each req_id in group.requirement_ids:
      task_requirements.append({ id: req_id })

ELIF NOT quick_mode:
  # Check if task has enough requirements for distributed planning
  # Extract from plan page coverage table (same as research-task Step 3.5)
  plan_page_for_reqs = task_pages.find(p => p.page_type == "Spec")
  IF plan_page_for_reqs:
    plan_content = mosic_get_page(plan_page_for_reqs.name, { content_format: "plain" }).content
    coverage_section = extract_section(plan_content, "## Requirements Coverage")
    IF coverage_section:
      FOR each row in parse_markdown_table(coverage_section):
        task_requirements.append({ id: row.req_id, description: row.description })

  distributed_config = config.workflow?.distributed ?? {}
  planning_threshold = distributed_config.planning_threshold ?? distributed_config.threshold ?? 6

  IF task_requirements.length >= planning_threshold AND (distributed_config.enabled !== false):
    result = decompose(task_requirements, config, { threshold_override: planning_threshold })
    use_distributed = result.use_distributed
    requirement_groups = result.requirement_groups
    dependency_order = result.dependency_order

    IF use_distributed:
      Display:
      """
      Distributed planning: {task_requirements.length} requirements ≥ threshold ({planning_threshold}) → {requirement_groups.length} groups
      """
```

## 5. Create or Update Plan Page

```
IF existing_plan_page and user_selection == "Continue":
  PLAN_PAGE_ID = existing_plan_page.name
  Display: "Updating existing plan page"
ELSE:
  # Create new plan page
  plan_page = mosic_create_entity_page("MTask", TASK_ID, {
    workspace_id: workspace_id,
    title: TASK_IDENTIFIER + " Execution Plan",
    page_type: "Spec",
    icon: "lucide:file-code",
    status: "Draft",
    content: {
      blocks: [
        {
          type: "header",
          data: { text: "Task Plan", level: 1 }
        },
        {
          type: "paragraph",
          data: { text: "Planning in progress..." }
        }
      ]
    },
    relation_type: "Related"
  })

  PLAN_PAGE_ID = plan_page.name

  # Tag the plan page
  mosic_batch_add_tags_to_document("M Page", PLAN_PAGE_ID, [
    config.mosic.tags.gsd_managed,
    config.mosic.tags.plan
  ])

  Display: "Created plan page: https://mosic.pro/app/page/" + PLAN_PAGE_ID
```

*Step 5.5 removed — planner self-extracts requirements from Mosic pages.*

## 6. Spawn gsd-planner Agent(s)

```
IF use_distributed:
  # --- DISTRIBUTED: Follow @~/.claude/get-shit-done/workflows/distributed-planning.md ---
  # Follow <sequential_planner_orchestration> with these scope-specific inputs:

  Display:
  """
  -------------------------------------------
   GSD > PLANNING TASK (DISTRIBUTED)
  -------------------------------------------

  {TASK_IDENTIFIER}: {TASK_TITLE}
  {requirement_groups.length} groups, executing in dependency order:
  {dependency_order.map(g => g.number + ". " + g.title).join("\n")}
  """

  # Command provides scope-specific parameters to workflow:
  #   build_mosic_refs(group) returns:
  #     <mosic_references>
  #     <task id="{TASK_ID}" identifier="{TASK_IDENTIFIER}" title="{TASK_TITLE}" />
  #     <phase id="{phase_id}" title="{phase.title}" />
  #     <workspace id="{workspace_id}" />
  #     <project id="{project_id}" />
  #     <plan_page id="{PLAN_PAGE_ID}" />
  #     <research_page id="{group_research_page_id}" />   ← group-specific if available
  #     <context_page id="{context_page_id}" />
  #     <requirements_page id="{requirements_page_id}" />
  #     <task_context_page id="{task_context_page_id}" />
  #     <task_research_page id="{task_research_page_id}" />
  #     </mosic_references>
  #
  #   planner_agent_path = "~/.claude/agents/gsd-planner.md"
  #   planner_model = from config profile table
  #   planning_mode = "task-planning"
  #   tdd_config = config.workflow?.tdd ?? "auto"
  #   scope_label = TASK_IDENTIFIER
  #   subtask_range = "1-8 per group" (override default 1-5)
  #   decomposition = config.mosic.session.task_decomposition

  # Workflow spawns planners sequentially in dependency_order,
  # accumulating all_prior_plan_pages and all_plan_results.
  # Output: all_prior_plan_pages[], all_plan_results[]

ELSE:
  # --- SINGLE PLANNER (existing behavior, unchanged) ---

  Display:
  """
  -------------------------------------------
   GSD > SPAWNING PLANNER {quick_mode ? "(QUICK)" : ""}
  -------------------------------------------

  Analyzing task and creating subtasks...
  """

  Build lean prompt with page IDs only — planner self-loads all content from Mosic:

  planning_mode = quick_mode ? "task-quick" : "task-planning"

  planner_prompt = """
<mosic_references>
<task id="{TASK_ID}" identifier="{TASK_IDENTIFIER}" title="{TASK_TITLE}" />
<phase id="{phase_id}" title="{phase.title}" />
<workspace id="{workspace_id}" />
<project id="{project_id}" />
<plan_page id="{PLAN_PAGE_ID}" />
<research_page id="{research_page_id}" />
<context_page id="{context_page_id}" />
<requirements_page id="{requirements_page_id}" />
<task_context_page id="{task_context_page_id}" />
<task_research_page id="{task_research_page_id}" />
</mosic_references>

<planning_config>
<mode>""" + planning_mode + """</mode>
<tdd_config>""" + (config.workflow?.tdd ?? "auto") + """</tdd_config>
</planning_config>

<constraints>
""" + (quick_mode ? """
**QUICK MODE - Simplified planning:**
- Create 1-3 subtasks MAXIMUM (keep it simple)
- Each subtask should take 5-15 minutes to execute
- Focus on core actions, skip elaborate verification
- Get to execution quickly
- Assign wave numbers (all Wave 1 if independent, sequential otherwise)
""" : """
- Create 1-5 subtasks maximum (task-level scope, not phase-level)
- Each subtask should take 15-60 minutes to execute
- Subtasks must be specific and actionable
- Include verification criteria for each subtask
- Use must-haves for goal-backward verification
- **WAVE ASSIGNMENT REQUIRED:** Analyze subtask dependencies and assign wave numbers
  - Wave 1: Subtasks with no dependencies (can run in parallel)
  - Wave 2+: Subtasks depending on earlier wave outputs
  - Subtasks touching the SAME files MUST be in different waves
  - Include wave number in subtask Metadata section
""") + """
</constraints>

<downstream_consumer>
Output consumed by /gsd:execute-task (supports parallel wave execution)
Subtasks must include:
- Clear objective
- **Metadata section** with wave number, dependencies, and type
- Files to modify/create (used for file-overlap safety checks)
- Specific actions
- Verification criteria
- Done criteria

**Wave metadata format in subtask description:**
```
## Metadata
**Wave:** {number}
**Depends On:** {subtask titles or "None"}
**Type:** {auto|tdd|checkpoint:*}
```

execute-task uses wave metadata to:
- Group subtasks into parallel execution waves
- Detect file overlaps and prevent conflicts
- Orchestrate commits in correct order
</downstream_consumer>

<output_format>
1. Update plan page (ID from mosic_references) with:
   - Objective
   - Must-haves (observable truths)
   - Wave structure table
   - Subtasks with details (including Metadata section)
   - Success criteria

2. Create MTask subtasks with:
   - parent_task from mosic_references task.id
   - workspace from mosic_references workspace.id
   - task_list from mosic_references phase.id
   - title: descriptive subtask name
   - description: Editor.js format with Metadata/Files/Action/Verify/Done sections

3. Create checklist items on parent task for acceptance criteria

Return structured result with:
## PLANNING COMPLETE

**Subtasks Created:** N
**Waves:** W
**Pages Updated:** plan page ID

### Wave Structure
| Wave | Subtasks | Parallel |
|------|----------|----------|
| 1 | Subtask 1, Subtask 2 | Yes |
| 2 | Subtask 3 | No |

### Subtasks
| # | Title | Wave | ID |
|---|-------|------|----|
| 1 | ... | 1 | ... |
| 2 | ... | 1 | ... |
| 3 | ... | 2 | ... |

### Next Steps
/gsd:execute-task {TASK_IDENTIFIER}
</output_format>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-planner.md for your role.\n\n" + planner_prompt,
    subagent_type="general-purpose",
    model="{planner_model}",
    description="Plan task: " + TASK_TITLE.substring(0, 30)
  )
```

## 7. Handle Planner Return

```
IF use_distributed:
  # Follow @~/.claude/get-shit-done/workflows/distributed-planning.md:
  # 1. <coverage_verification> — store entity IDs in config, check coverage
  #    Config storage: config.mosic.pages["task-" + TASK_IDENTIFIER + "-plan-group-NN"] = page_id
  # 2. <cross_group_relations> — create M Relations for cross-group dependencies

  # Verify subtasks were created across all groups
  created_subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  subtask_count = created_subtasks.results.length

  # Update task status
  mosic_update_document("MTask", TASK_ID, {
    status: "In Progress"
  })

  # Add planning comment
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    ref_doc: "MTask",
    ref_name: TASK_ID,
    content: "<p><strong>Distributed Planning Complete</strong></p>" +
      "<p>Groups: " + requirement_groups.length + "</p>" +
      "<p>Subtasks: " + subtask_count + "</p>" +
      "<p><a href=\"https://mosic.pro/app/page/" + PLAN_PAGE_ID + "\">View Plan</a></p>"
  })

# Single planner path
ELIF planner_output contains "## PLANNING COMPLETE":
  # Extract subtask count
  subtask_count = extract_number(planner_output, "Subtasks Created:")

  # Verify subtasks were created
  created_subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  IF created_subtasks.results.length == 0:
    Display: "Warning: No subtasks found. Planner may have failed to create them."

  # Update task status
  mosic_update_document("MTask", TASK_ID, {
    status: "In Progress"
  })

  # Add planning comment
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    ref_doc: "MTask",
    ref_name: TASK_ID,
    content: "<p><strong>Planning Complete</strong></p>" +
      "<p>Subtasks: " + subtask_count + "</p>" +
      "<p><a href=\"https://mosic.pro/app/page/" + PLAN_PAGE_ID + "\">View Plan</a></p>"
  })

ELSE:
  ERROR: "Planner did not return structured completion. Check output."
```

## 8. Verification Loop (unless --skip-verify)

```
workflow_plan_check = config.workflow?.plan_check ?? true

IF workflow_plan_check and not skip_verify:

  IF use_distributed:
    # --- DISTRIBUTED VERIFICATION ---
    # Follow <distributed_verification> in @~/.claude/get-shit-done/workflows/distributed-planning.md
    #
    # Command provides scope-specific inputs:
    #   requirement_groups, all_plan_results, task_requirements
    #   task_description = TASK_TITLE
    #   TASK_IDENTIFIER, checker_model, requirements_page_id
    #   checker_agent_path = "~/.claude/agents/gsd-plan-checker.md"
    #
    # Workflow handles:
    #   Phase 1: Parallel group-scoped verification (one checker per group)
    #   Phase 2: Cross-group verification (coverage matrix + dependency acyclicity)
    #   Issue handling: display issues, enter revision loop (iteration_count < 3)
    #
    # Output: all checks passed → proceed to step 9, or issues → revision loop

  ELSE:
    # --- SINGLE PLANNER VERIFICATION (existing behavior) ---

    Display:
    """
    -------------------------------------------
     GSD > VERIFYING PLAN
    -------------------------------------------

    Checking plan quality...
    """

    # Load requirements for verification (deferred from step 4 — not needed by planner)
    requirements_content = ""
  IF config.mosic.pages.requirements:
    requirements_content = mosic_get_page(config.mosic.pages.requirements, {
      content_format: "markdown"
    }).content

  # Extract task requirements for checker
  task_requirements = []
  IF requirements_content:
    # Check parent plan page coverage table first
    IF existing_plan_page:
      parent_plan_content = mosic_get_page(existing_plan_page.name, {
        content_format: "markdown"
      }).content
      coverage_section = extract_section(parent_plan_content, "## Requirements Coverage")
      IF coverage_section:
        FOR each row in parse_markdown_table(coverage_section):
          IF row.covered_by contains TASK_IDENTIFIER or row.covered_by contains TASK_TITLE:
            task_requirements.append({ id: row.req_id, description: row.description })

    # Fallback: traceability table
    IF not task_requirements:
      traceability_section = extract_section(requirements_content, "## Traceability")
      IF NOT traceability_section:
        traceability_section = extract_section(requirements_content, "## Requirements Traceability")
      IF traceability_section:
        FOR each row in parse_markdown_table(traceability_section):
          IF row.phase matches phase.title:
            task_requirements.append({
              id: row.requirement_id,
              description: row.description or find_requirement_description(requirements_content, row.requirement_id)
            })

  task_requirements_xml = "<phase_requirements>\n"
  IF task_requirements:
    FOR each req in task_requirements:
      task_requirements_xml += '<requirement id="' + req.id + '">' + req.description + '</requirement>\n'
  ELSE:
    task_requirements_xml += "No explicit requirements found for this task. Derive from task description.\n"
  task_requirements_xml += "</phase_requirements>"

  # Get subtask IDs for checker's mosic_references (checker self-loads content)
  subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  checker_prompt = """
<verification_context>

**Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """

""" + task_requirements_xml + """

</verification_context>

<mosic_references>
<task id=\"""" + TASK_ID + """\" identifier=\"""" + TASK_IDENTIFIER + """\" />
<plan_page id=\"""" + PLAN_PAGE_ID + """\" />
""" + subtasks.results.map(s => '<subtask id="' + s.name + '" identifier="' + s.identifier + '" />').join("\n") + """
</mosic_references>

<checklist>
- [ ] Each subtask has clear, specific actions
- [ ] Each subtask has verification criteria
- [ ] Each subtask has done criteria
- [ ] Subtasks are appropriately sized (15-60 min each)
- [ ] Must-haves are observable and testable
- [ ] No missing dependencies between subtasks
- [ ] Every locked decision from context has a corresponding subtask action
- [ ] No subtask implements or prepares for a deferred idea
- [ ] Discretion areas are handled with reasonable defaults
</checklist>

<expected_output>
Return one of:
- ## VERIFICATION PASSED - all checks pass
- ## ISSUES FOUND - structured issue list with specific fixes needed
</expected_output>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-plan-checker.md for your role.\n\n" + checker_prompt,
    subagent_type="general-purpose",
    model="{checker_model}",
    description="Verify task plan: " + TASK_IDENTIFIER
  )

  **Handle checker return:**

  iteration_count = 0
  max_iterations = 3

  WHILE true:
    IF checker_output contains "## VERIFICATION PASSED":
      Display: "Plan verification passed."
      BREAK

    IF checker_output contains "## ISSUES FOUND":
      iteration_count += 1

      IF iteration_count >= max_iterations:
        Display: "Plan checker found issues after " + max_iterations + " revision attempts. Manual review needed."
        Display: checker_output
        BREAK

      Display: "Checker found issues (attempt " + iteration_count + "/" + max_iterations + "). Auto-revising..."

      # Spawn planner with checker feedback for revision
      revision_prompt = """
<revision_context>
**Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """

**Checker Issues:**
""" + checker_output + """

**Current Plan Page:** """ + PLAN_PAGE_ID + """

<instructions>
- Address each issue identified by the checker
- Update the plan page and subtasks in Mosic
- Do NOT recreate subtasks — update existing ones
- Return ## PLANNING COMPLETE when done
</instructions>
</revision_context>
"""

      Task(
        prompt="First, read ~/.claude/agents/gsd-planner.md for your role.\n\n" + revision_prompt,
        subagent_type="general-purpose",
        model="{planner_model}",
        description="Revise task plan: " + TASK_IDENTIFIER + " (attempt " + iteration_count + ")"
      )

      # Re-run checker on revised plan (same plan page ID and subtask IDs; planner updated in place)

      checker_prompt_revised = """
<verification_context>

**Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """

""" + task_requirements_xml + """

</verification_context>

<mosic_references>
<task id=\"""" + TASK_ID + """\" identifier=\"""" + TASK_IDENTIFIER + """\" />
<plan_page id=\"""" + PLAN_PAGE_ID + """\" />
""" + subtasks.results.map(s => '<subtask id="' + s.name + '" identifier="' + s.identifier + '" />').join("\n") + """
</mosic_references>

<checklist>
- [ ] Each subtask has clear, specific actions
- [ ] Each subtask has verification criteria
- [ ] Each subtask has done criteria
- [ ] Subtasks are appropriately sized (15-60 min each)
- [ ] Must-haves are observable and testable
- [ ] No missing dependencies between subtasks
- [ ] Every locked decision from context has a corresponding subtask action
- [ ] No subtask implements or prepares for a deferred idea
- [ ] Discretion areas are handled with reasonable defaults
</checklist>

<expected_output>
Return one of:
- ## VERIFICATION PASSED - all checks pass
- ## ISSUES FOUND - structured issue list with specific fixes needed
</expected_output>
"""

      Task(
        prompt="First, read ~/.claude/agents/gsd-plan-checker.md for your role.\n\n" + checker_prompt_revised,
        subagent_type="general-purpose",
        model="{checker_model}",
        description="Re-verify task plan: " + TASK_IDENTIFIER + " (attempt " + iteration_count + ")"
      )

      # Loop continues with new checker_output
```

## 9. Update Config

```
config.mosic.pages["task-" + TASK_IDENTIFIER + "-plan"] = PLAN_PAGE_ID
config.mosic.session.active_task = TASK_ID
config.mosic.session.last_action = "plan-task"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

## 10. Present Results

```
# Get final subtask list
final_subtasks = mosic_search_tasks({
  workspace_id: workspace_id,
  filters: { parent_task: TASK_ID }
})

Display:
"""
-------------------------------------------
 GSD > TASK PLANNED
-------------------------------------------

**{TASK_IDENTIFIER}:** {TASK_TITLE}

{final_subtasks.results.length} subtask(s) created

| # | Subtask | Status |
|---|---------|--------|
""" + final_subtasks.results.map((s, i) =>
  "| " + (i+1) + " | " + s.identifier + ": " + s.title.substring(0, 40) + " | " + s.status + " |"
).join("\n") + """

Plan: https://mosic.pro/app/page/{PLAN_PAGE_ID}
Task: https://mosic.pro/app/MTask/{TASK_ID}

---

## Next Up

**Execute Task** - implement all subtasks

`/gsd:execute-task {TASK_IDENTIFIER}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- View plan page in Mosic
- `/gsd:task` - add another task first

---
"""
```

</process>

<error_handling>
```
IF mosic operation fails during subtask creation:
  Display: "Mosic operation failed: {error}"

  # Store partial state
  config.mosic.pending_sync = config.mosic.pending_sync or []
  config.mosic.pending_sync.push({
    type: "task_plan",
    task_id: TASK_ID,
    plan_page_id: PLAN_PAGE_ID,
    error: error_message,
    timestamp: new Date().toISOString()
  })

  write config.json

  Display: "Partial state saved. Check /gsd:progress for sync status."
```
</error_handling>

<success_criteria>
- [ ] Task loaded from Mosic (by identifier or active task)
- [ ] Phase/task page IDs discovered
- [ ] Distributed threshold evaluated (task requirements count vs config threshold)
- [ ] If distributed: decomposition reused from research-task or computed fresh
- [ ] If distributed: planners spawned sequentially with prior plan page IDs
- [ ] If distributed: coverage verified, cross-group relations created
- [ ] If distributed: distributed verification (group-scoped + cross-group)
- [ ] If single: gsd-planner spawned with page IDs (planner self-loads content)
- [ ] Plan page created/updated linked to task
- [ ] Subtasks created with parent_task field
- [ ] Checklist items added for acceptance criteria
- [ ] Plan page tagged (gsd-managed, plan)
- [ ] Verification passed (unless skipped)
- [ ] config.json updated with page ID(s)
- [ ] User sees Mosic URLs and next steps
</success_criteria>
