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

Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-planner | opus | opus | sonnet |
| gsd-plan-checker | sonnet | sonnet | haiku |
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
    description_format: "markdown"
  })
ELSE:
  # Use active task from config
  task_id = config.mosic.session?.active_task
  IF not task_id:
    ERROR: "No task identifier provided and no active task. Provide task ID or run /gsd:task first."
  task = mosic_get_task(task_id, { description_format: "markdown" })

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

## 4. Load Phase Context

```
# Get parent task list (phase)
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Get phase pages for context
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

# Load available context
research_page = phase_pages.find(p => p.title.includes("Research"))
context_page = phase_pages.find(p => p.title.includes("Context") or p.title.includes("Decisions"))

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

# Load task-specific context page if exists
task_context_page = task_pages.find(p => p.title.includes("Context"))
task_research_page = task_pages.find(p => p.title.includes("Research"))

task_context_content = ""
IF task_context_page:
  task_context_content = mosic_get_page(task_context_page.name, {
    content_format: "markdown"
  }).content

task_research_content = ""
IF task_research_page:
  task_research_content = mosic_get_page(task_research_page.name, {
    content_format: "markdown"
  }).content

# Load requirements
requirements_content = ""
IF config.mosic.pages.requirements:
  requirements_content = mosic_get_page(config.mosic.pages.requirements, {
    content_format: "markdown"
  }).content
```

Display:
```
Context loaded:
- Phase research: {research_page ? "Yes" : "No"}
- Phase context: {context_page ? "Yes" : "No"}
- Task context: {task_context_page ? "Yes" : "No"}
- Task research: {task_research_page ? "Yes" : "No"}
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

## 5.5 Extract Task Requirements

```
# Extract requirements mapped to this task from parent plan page's coverage table
task_requirements = []

# Check if parent plan page exists with Requirements Coverage section
IF plan_content:
  coverage_section = extract_section(plan_content, "## Requirements Coverage")
  IF coverage_section:
    FOR each row in parse_markdown_table(coverage_section):
      IF row.covered_by contains TASK_IDENTIFIER or row.covered_by contains TASK_TITLE:
        task_requirements.append({
          id: row.req_id,
          description: row.description
        })

# Fallback: Extract from full requirements page traceability
IF not task_requirements AND requirements_content:
  traceability_section = extract_section(requirements_content, "## Traceability")
  IF NOT traceability_section:
    traceability_section = extract_section(requirements_content, "## Requirements Traceability")
  IF traceability_section:
    phase_name = phase.title
    FOR each row in parse_markdown_table(traceability_section):
      IF row.phase matches phase_name:
        task_requirements.append({
          id: row.requirement_id,
          description: row.description or find_requirement_description(requirements_content, row.requirement_id)
        })

# Build XML
task_requirements_xml = "<phase_requirements>\n"
IF task_requirements:
  FOR each req in task_requirements:
    task_requirements_xml += '<requirement id="' + req.id + '">' + req.description + '</requirement>\n'
ELSE:
  task_requirements_xml += "No explicit requirements found for this task. Derive from task description.\n"
task_requirements_xml += "</phase_requirements>"
```

## 6. Spawn gsd-planner Agent

Display:
```
-------------------------------------------
 GSD > SPAWNING PLANNER {quick_mode ? "(QUICK)" : ""}
-------------------------------------------

Analyzing task and creating subtasks...
```

```
# Determine planning mode based on flags
planning_mode = quick_mode ? "task-quick" : "task-planning"

# --- Extract user decisions from context pages ---
locked_decisions = ""
deferred_ideas = ""
discretion_areas = ""

# Task-level context first (highest priority)
IF task_context_content:
  locked_decisions = extract_section(task_context_content, "## Decisions")
  deferred_ideas = extract_section(task_context_content, "## Deferred Ideas")
  discretion_areas = extract_section(task_context_content, "## Claude's Discretion")

# Phase-level context (merge)
IF context_content:
  phase_locked = extract_section(context_content, "## Decisions")
  IF not phase_locked:
    phase_locked = extract_section(context_content, "## Implementation Decisions")
  IF phase_locked:
    locked_decisions = (locked_decisions ? locked_decisions + "\n\n**Inherited from phase:**\n" + phase_locked : phase_locked)
  IF not deferred_ideas:
    deferred_ideas = extract_section(context_content, "## Deferred Ideas")
  IF not discretion_areas:
    discretion_areas = extract_section(context_content, "## Claude's Discretion")

# Research pages (fallback)
IF research_content AND not locked_decisions:
  user_constraints = extract_section(research_content, "## User Constraints")
  IF user_constraints:
    locked_decisions = extract_subsection(user_constraints, "### Locked Decisions")
    IF not deferred_ideas:
      deferred_ideas = extract_subsection(user_constraints, "### Deferred Ideas")
    IF not discretion_areas:
      discretion_areas = extract_subsection(user_constraints, "### Claude's Discretion")

IF task_research_content AND not locked_decisions:
  task_constraints = extract_section(task_research_content, "## User Constraints")
  IF task_constraints:
    locked_decisions = extract_subsection(task_constraints, "### Locked Decisions")
    IF not deferred_ideas:
      deferred_ideas = extract_subsection(task_constraints, "### Deferred Ideas")
    IF not discretion_areas:
      discretion_areas = extract_subsection(task_constraints, "### Claude's Discretion")

planner_decisions_xml = """
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

# Frontend detection
frontend_keywords = ["UI", "frontend", "component", "page", "screen", "layout",
  "design", "form", "button", "modal", "dialog", "sidebar", "navbar", "dashboard",
  "responsive", "styling", "CSS", "Tailwind", "React", "Vue", "template", "view",
  "UX", "interface", "widget"]

task_text = (TASK_TITLE + " " + (task.description or "")).toLowerCase()
is_frontend = frontend_keywords.some(kw => task_text.includes(kw.toLowerCase()))

frontend_design_xml = ""
IF is_frontend:
  frontend_design_content = Read("~/.claude/get-shit-done/references/frontend-design.md")
  frontend_design_xml = extract_section(frontend_design_content, "## For Planners")
  Display: "Frontend work detected — design specification will be required in plans."

# TDD detection and context loading
tdd_config = config.workflow?.tdd ?? "auto"
tdd_context_xml = ""

IF tdd_config !== false:
  tdd_keywords = ["API", "endpoint", "validation", "parser", "transform", "algorithm",
    "state machine", "workflow engine", "utility", "helper", "business logic",
    "data model", "schema", "converter", "calculator", "formatter", "serializer",
    "authentication", "authorization"]

  is_tdd_eligible = tdd_keywords.some(kw => task_text.includes(kw.toLowerCase()))

  # Check task context page for TDD decision, fall back to phase context
  tdd_user_decision = extract_decision(task_context_content, "Testing Approach")
  IF not tdd_user_decision:
    tdd_user_decision = extract_decision(context_content, "Testing Approach")

  # Determine effective TDD mode
  # Priority: user decision > config setting > keyword heuristic
  IF tdd_user_decision == "tdd":
    tdd_mode = "prefer"
  ELIF tdd_user_decision == "standard":
    tdd_mode = "disabled"
  ELIF tdd_user_decision == "planner_decides":
    tdd_mode = "auto"
  ELIF tdd_config == true:
    tdd_mode = "prefer"
  ELIF tdd_config == "auto" AND is_tdd_eligible:
    tdd_mode = "auto"
  ELSE:
    tdd_mode = "disabled"

  IF tdd_mode != "disabled":
    tdd_reference = Read("~/.claude/get-shit-done/references/tdd.md")
    tdd_context_xml = """
<tdd_context mode=\"""" + tdd_mode + """\">
""" + tdd_reference + """
</tdd_context>
"""
    Display: "TDD mode: " + tdd_mode + " — planner will use TDD heuristic for task classification."

planner_prompt = """
""" + planner_decisions_xml + """

""" + task_requirements_xml + """

""" + tdd_context_xml + """

<planning_context>

**Mode:** """ + planning_mode + """
**Task ID:** """ + TASK_ID + """
**Task Identifier:** """ + TASK_IDENTIFIER + """
**Task Title:** """ + TASK_TITLE + """
**Task Description:**
""" + task.description + """

**Plan Page ID:** """ + PLAN_PAGE_ID + """
**Workspace ID:** """ + workspace_id + """

**Phase:** """ + phase.title + """

**Phase Research (if available):**
""" + (research_content or "No phase research available.") + """

**Phase Context & Decisions (if available):**
""" + (context_content or "No phase context available.") + """

**Task-Specific Context (if available):**
""" + (task_context_content or "No task-specific context.") + """

**Task-Specific Research (if available):**
""" + (task_research_content or "No task-specific research.") + """

**Requirements (if available):**
""" + (requirements_content or "No requirements loaded.") + """

</planning_context>

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
**Type:** auto
```

execute-task uses wave metadata to:
- Group subtasks into parallel execution waves
- Detect file overlaps and prevent conflicts
- Orchestrate commits in correct order
</downstream_consumer>

<frontend_design_context>
""" + frontend_design_xml + """
</frontend_design_context>

<output_format>
1. Update plan page """ + PLAN_PAGE_ID + """ with:
   - Objective
   - Must-haves (observable truths)
   - Wave structure table
   - Subtasks with details (including Metadata section)
   - Success criteria

2. Create MTask subtasks with:
   - parent_task: """ + TASK_ID + """
   - workspace: """ + workspace_id + """
   - task_list: """ + phase_id + """
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
/gsd:execute-task """ + TASK_IDENTIFIER + """
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
# Parse planner output for ## PLANNING COMPLETE
IF planner_output contains "## PLANNING COMPLETE":
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
  Display:
  """
  -------------------------------------------
   GSD > VERIFYING PLAN
  -------------------------------------------

  Checking plan quality...
  """

  # Load plan page content
  plan_content = mosic_get_page(PLAN_PAGE_ID, {
    content_format: "markdown"
  }).content

  # Load subtasks
  subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  subtask_details = ""
  FOR each subtask in subtasks.results:
    st = mosic_get_task(subtask.name, { description_format: "markdown" })
    subtask_details += "\n\n### " + st.identifier + ": " + st.title + "\n" + st.description

  checker_prompt = """
<verification_context>

**Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """

""" + task_requirements_xml + """

**Plan Page Content:**
""" + plan_content + """

**Subtasks:**
""" + subtask_details + """

</verification_context>

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
    prompt=checker_prompt,
    subagent_type="gsd-plan-checker",
    model="{checker_model}",
    description="Verify task plan: " + TASK_IDENTIFIER
  )

  IF checker_output contains "## ISSUES FOUND":
    Display: "Plan issues found. Revising..."
    # Could spawn revision here, but for simplicity, present issues to user
    Display: checker_output
    EXIT with "Run /gsd:plan-task " + TASK_IDENTIFIER + " to revise"
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
- [ ] Phase context loaded (research, decisions)
- [ ] Context fidelity enforced (locked decisions mapped, deferred ideas excluded)
- [ ] Plan page created/updated linked to task
- [ ] gsd-planner spawned with full context
- [ ] Subtasks created with parent_task field
- [ ] Checklist items added for acceptance criteria
- [ ] Plan page tagged (gsd-managed, plan)
- [ ] Verification passed (unless skipped)
- [ ] config.json updated with page ID
- [ ] User sees Mosic URLs and next steps
</success_criteria>
