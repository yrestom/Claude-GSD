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

## 6. Spawn gsd-planner Agent

Display:
```
-------------------------------------------
 GSD > SPAWNING PLANNER {quick_mode ? "(QUICK)" : ""}
-------------------------------------------

Analyzing task and creating subtasks...
```

Build lean prompt with page IDs only — planner self-loads all content from Mosic:

```
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
**Type:** auto
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
- [ ] Phase/task page IDs discovered
- [ ] Plan page created/updated linked to task
- [ ] gsd-planner spawned with page IDs (planner self-loads content)
- [ ] Subtasks created with parent_task field
- [ ] Checklist items added for acceptance criteria
- [ ] Plan page tagged (gsd-managed, plan)
- [ ] Verification passed (unless skipped)
- [ ] config.json updated with page ID
- [ ] User sees Mosic URLs and next steps
</success_criteria>
