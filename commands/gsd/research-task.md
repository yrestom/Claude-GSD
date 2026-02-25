---
name: gsd:research-task
description: Research implementation approach for a specific task
argument-hint: "[task-identifier]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
  - mcp__context7__*
---

<objective>
Research how to implement a specific task well, producing findings that directly inform planning.

**Mirrors:** `/gsd:research-phase` but focused on single task scope

**Key differences from phase research:**
- Focused on single task's technical domain
- Inherits phase research (doesn't repeat general research)
- Shorter output format (~10-15 min execution)
- Sections: Implementation Approach, Code Patterns, Gotchas, Examples

**Spawns:** gsd-task-researcher agent
**Output:** Research M Page linked to task
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/workflows/context-extraction.md
@~/.claude/get-shit-done/workflows/decompose-requirements.md
@~/.claude/get-shit-done/workflows/distributed-research.md
</execution_context>

<context>
Task identifier: $ARGUMENTS (e.g., "AUTH-5" or task UUID)
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
model_profile = config.model_profile or "balanced"
model_overrides = config.model_overrides or {}

# Model resolution: override takes precedence over profile lookup
Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-task-researcher | sonnet | sonnet | haiku |

researcher_model = model_overrides["gsd-task-researcher"] ?? lookup(model_profile)
```

## 2. Load Task from Mosic

```
# Extract task identifier
task_identifier = extract_identifier($ARGUMENTS)

# Load task
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
 GSD > RESEARCHING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
```

## 3. Discover Page IDs

```
# Parallelize independent calls: task pages + phase data (phase_id known from task.task_list)
phase_id = task.task_list
[task_pages, phase, phase_pages] = parallel(
  mosic_get_entity_pages("MTask", TASK_ID, { include_subtree: false }),
  mosic_get_task_list(phase_id, { include_tasks: false }),
  mosic_get_entity_pages("MTask List", phase_id, { include_subtree: false })
)

# Check for existing research
existing_research_page = task_pages.find(p => p.title.includes("Research"))

# Check for context page (from discuss-task)
task_context_page = task_pages.find(p => p.title.includes("Context"))
task_context_page_id = task_context_page ? task_context_page.name : null

phase_research_page = phase_pages.find(p => p.title.includes("Research"))
phase_research_page_id = phase_research_page ? phase_research_page.name : null

phase_context_page = phase_pages.find(p => p.title.includes("Context"))
phase_context_page_id = phase_context_page ? phase_context_page.name : null

requirements_page_id = config.mosic.pages.requirements or null
```

## 3.5. Decompose Task for Distributed Research

Follow `@~/.claude/get-shit-done/workflows/decompose-requirements.md`:

```
use_distributed = false
requirement_groups = []
dependency_order = []

# Extract task requirements from parent plan page's ## Requirements Coverage table
task_requirements = []
IF task_pages.find(p => p.page_type == "Spec"):
  plan_page = task_pages.find(p => p.page_type == "Spec")
  plan_content = mosic_get_page(plan_page.name, { content_format: "plain" }).content
  coverage_section = extract_section(plan_content, "## Requirements Coverage")
  IF coverage_section:
    FOR each row in parse_markdown_table(coverage_section):
      task_requirements.append({ id: row.req_id })

distributed_config = config.workflow?.distributed ?? {}
research_threshold = distributed_config.research_threshold ?? distributed_config.threshold ?? 6

IF task_requirements.length >= research_threshold AND (distributed_config.enabled !== false):
  # Decompose using @decompose-requirements.md <decompose>
  result = decompose(task_requirements, config, { threshold_override: research_threshold })
  use_distributed = result.use_distributed
  requirement_groups = result.requirement_groups
  dependency_order = result.dependency_order

  IF use_distributed:
    Display:
    """
    Distributed research: {task_requirements.length} requirements ≥ threshold ({research_threshold}) → {requirement_groups.length} groups
    {requirement_groups.map(g => "  " + g.number + ". " + g.title + " (" + g.requirement_ids.length + " reqs)").join("\n")}
    """
```

## 4. Check for Existing Research

```
supplement_mode = false

IF existing_research_page:
  existing_content = mosic_get_page(existing_research_page.name, {
    content_format: "excerpts"
  })

  Display:
  """
  Existing task research found.

  Summary:
  {existing_content.content}
  """

  AskUserQuestion({
    questions: [{
      question: "How would you like to proceed?",
      header: "Research",
      options: [
        { label: "Re-research", description: "Create fresh research" },
        { label: "Supplement", description: "Add to existing research" },
        { label: "Use existing", description: "Skip to planning" }
      ],
      multiSelect: false
    }]
  })

  IF user_selection == "Use existing":
    Display: "Using existing research. Run /gsd:plan-task " + TASK_IDENTIFIER
    EXIT

  IF user_selection == "Supplement":
    supplement_mode = true
```

## 5. Create Research Page (placeholder)

```
IF existing_research_page and supplement_mode:
  RESEARCH_PAGE_ID = existing_research_page.name
ELSE:
  # Create new research page
  research_page = mosic_create_entity_page("MTask", TASK_ID, {
    workspace_id: workspace_id,
    title: TASK_IDENTIFIER + " Research",
    page_type: "Document",
    icon: "lucide:search",
    status: "Draft",
    content: {
      blocks: [
        {
          type: "header",
          data: { text: "Task Research", level: 1 }
        },
        {
          type: "paragraph",
          data: { text: "Research in progress..." }
        }
      ]
    },
    relation_type: "Related"
  })

  RESEARCH_PAGE_ID = research_page.name

  # Tag research page
  mosic_batch_add_tags_to_document("M Page", RESEARCH_PAGE_ID, [
    config.mosic.tags.gsd_managed,
    config.mosic.tags.task_research or "task-research"
  ])

Display: "Research page: https://mosic.pro/app/page/" + RESEARCH_PAGE_ID
```

## 6. Spawn Task Researcher Agent(s)

```
IF use_distributed:
  # --- DISTRIBUTED: Follow @~/.claude/get-shit-done/workflows/distributed-research.md ---
  # Follow <parallel_researcher_spawning> with these scope-specific inputs:

  Display:
  """
  -------------------------------------------
   GSD > RESEARCHING TASK (DISTRIBUTED)
  -------------------------------------------

  {TASK_IDENTIFIER}: {TASK_TITLE}
  {requirement_groups.length} groups, spawning parallel researchers...
  """

  # Command provides scope-specific parameters to workflow:
  mosic_references_base = """
<mosic_references>
<task id="{TASK_ID}" identifier="{TASK_IDENTIFIER}" title="{TASK_TITLE}" />
<phase id="{phase_id}" title="{phase.title}" />
<workspace id="{workspace_id}" />
<project id="{project_id}" />
<phase_research_page id="{phase_research_page_id}" />
<phase_context_page id="{phase_context_page_id}" />
<task_context_page id="{task_context_page_id}" />
<requirements_page id="{requirements_page_id}" />
</mosic_references>
"""
  researcher_agent_path = "~/.claude/agents/gsd-task-researcher.md"
  tdd_config = config.workflow?.tdd ?? "auto"
  scope_label = TASK_IDENTIFIER

  # Spawn parallel researchers per @distributed-research.md
  # All Task() calls in ONE response for parallel execution

ELSE:
  # --- SINGLE RESEARCHER (existing behavior, unchanged) ---

  Display:
  """
  -------------------------------------------
   GSD > SPAWNING RESEARCHER
  -------------------------------------------

  Investigating implementation approach...
  """

  researcher_prompt = """
<mosic_references>
<task id="{TASK_ID}" identifier="{TASK_IDENTIFIER}" title="{TASK_TITLE}" />
<phase id="{phase_id}" title="{phase.title}" />
<workspace id="{workspace_id}" />
<project id="{project_id}" />
<research_page id="{RESEARCH_PAGE_ID}" />
<phase_research_page id="{phase_research_page_id}" />
<phase_context_page id="{phase_context_page_id}" />
<task_context_page id="{task_context_page_id}" />
<requirements_page id="{requirements_page_id}" />
</mosic_references>

<research_config>
<tdd_config>{config.workflow?.tdd ?? "auto"}</tdd_config>
<supplement_mode>{supplement_mode ? "true" : "false"}</supplement_mode>
</research_config>

<objective>
Research how to implement task """ + TASK_IDENTIFIER + """: """ + TASK_TITLE + """

Answer: "What do I need to know to PLAN this task well?"
</objective>

<constraints>
- Focus on this SPECIFIC task, not general phase topics
- Inherit decisions from phase research - don't re-investigate
- Target 10-15 minute research cycle
- Be prescriptive: "Use X" not "Consider X or Y"
- Verify claims with Context7 or official docs
- CRITICAL: User Constraints section MUST be FIRST in research output
- Copy locked decisions from task context AND phase context VERBATIM
- Do NOT research or include anything from Deferred Ideas
</constraints>

<output>
Update research page """ + RESEARCH_PAGE_ID + """ with findings.

Return:
## RESEARCH COMPLETE

**Confidence:** {level}
**Gaps Status:** {CLEAR | NON-BLOCKING | BLOCKING}
**Key Finding:** {one-liner}
**Research Page:** https://mosic.pro/app/page/""" + RESEARCH_PAGE_ID + """
</output>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-task-researcher.md for your role.\n\n" + researcher_prompt,
    subagent_type="general-purpose",
    model="{researcher_model}",
    description="Research: " + TASK_TITLE.substring(0, 30)
  )
```

## 7. Handle Researcher Return

```
IF use_distributed:
  # Follow @~/.claude/get-shit-done/workflows/distributed-research.md:
  # 1. <handle_research_returns> — create per-group Mosic pages, collect gaps
  #    entity_type="MTask", entity_id=TASK_ID
  #    page_title_prefix=TASK_IDENTIFIER
  #    config_page_key_prefix="task-" + TASK_IDENTIFIER
  #
  # 2. <interface_collection> — extract Proposed Interfaces from each researcher output
  #
  # 3. <dependency_ordering> — topological sort or tier heuristic fallback
  #
  # 4. <store_decomposition_after_research> — store in config.mosic.session.task_decomposition
  #
  # Output: group_research_pages[], aggregate_gaps_status, dependency_order[]
  gaps_status = aggregate_gaps_status

ELIF researcher_output contains "## RESEARCH COMPLETE":
  # Extract confidence and key finding
  confidence = extract_field(researcher_output, "Confidence:")
  key_finding = extract_field(researcher_output, "Key Finding:")

  # Update page status
  mosic_update_document("M Page", RESEARCH_PAGE_ID, {
    status: "Published"
  })

  # Parse gap status
  gaps_status = extract_field(researcher_output, "Gaps Status:")

  IF gaps_status == "BLOCKING":
    blocking_gaps = extract_section(researcher_output, "### Blocking Gaps")

    Display:
    """
    -------------------------------------------
     BLOCKING GAPS DETECTED
    -------------------------------------------

    Research found gaps that need your input before planning:

    {blocking_gaps}

    ---
    """

    AskUserQuestion({
      questions: [{
        question: "How would you like to handle these blocking gaps?",
        header: "Gaps",
        options: [
          { label: "Resolve gaps", description: "Run /gsd:discuss-task to make decisions, then re-research" },
          { label: "Proceed anyway", description: "Continue to planning — planner will use best judgment" }
        ],
        multiSelect: false
      }]
    })

    IF user_selection == "Resolve gaps":
      Display:
      """
      To resolve these gaps:
      1. `/gsd:discuss-task {TASK_IDENTIFIER}` — make decisions on the blocking gaps
      2. `/gsd:research-task {TASK_IDENTIFIER}` — re-research with updated context

      Research page saved: https://mosic.pro/app/page/{RESEARCH_PAGE_ID}
      """
      EXIT

  # Add research comment to task
  mosic_create_document("M Comment", {
    workspace: workspace_id,
    ref_doc: "MTask",
    ref_name: TASK_ID,
    content: "<p><strong>Research Complete</strong></p>" +
      "<p>Confidence: " + confidence + "</p>" +
      "<p><a href=\"https://mosic.pro/app/page/" + RESEARCH_PAGE_ID + "\">View Research</a></p>"
  })

ELSE:
  Display: "Research may be incomplete. Check the research page."
```

## 8. Update Config

```
IF NOT use_distributed:
  config.mosic.pages["task-" + TASK_IDENTIFIER + "-research"] = RESEARCH_PAGE_ID

# Distributed mode stores per-group page IDs via <store_decomposition_after_research>
# which writes config.mosic.session.task_decomposition with groups[] and dependency_order[]

config.mosic.session.active_task = TASK_ID
config.mosic.session.active_task_identifier = TASK_IDENTIFIER
config.mosic.session.last_action = "research-task"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

## 9. Present Results and Next Steps

```
Display:
"""
-------------------------------------------
 GSD > RESEARCH COMPLETE
-------------------------------------------

**{TASK_IDENTIFIER}:** {TASK_TITLE}

IF use_distributed:
  Mode: Distributed ({requirement_groups.length} groups)
  Dependency order: {dependency_order.map(g => g.title).join(" → ")}
  Research pages:
  {group_research_pages.map(grp =>
    "  - Group " + grp.group.number + ": https://mosic.pro/app/page/" + grp.page_id
  ).join("\n")}
ELSE:
  Confidence: {confidence}
  Key Finding: {key_finding}
  Research: https://mosic.pro/app/page/{RESEARCH_PAGE_ID}

Gap Status: {gaps_status or "Not assessed"}
{IF gaps_status == "NON-BLOCKING": "Non-blocking gaps documented — planner will use defaults."}
{IF gaps_status == "BLOCKING": "Blocking gaps overridden — planner will use best judgment."}

---

## Next Up

**Create execution plan**

`/gsd:plan-task {TASK_IDENTIFIER}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- View research page in Mosic
- `/gsd:research-task {TASK_IDENTIFIER}` - research more

---
"""
```

</process>

<error_handling>
```
IF researcher fails:
  Display:
  """
  Research interrupted. Partial findings may be on the research page.

  View: https://mosic.pro/app/page/{RESEARCH_PAGE_ID}

  To retry: /gsd:research-task {TASK_IDENTIFIER}
  To skip: /gsd:plan-task {TASK_IDENTIFIER}
  """

  # Mark page as incomplete
  mosic_update_document("M Page", RESEARCH_PAGE_ID, {
    status: "Draft"
  })

IF mosic operation fails:
  Display: "Mosic operation failed: {error}"
  Display: "Research may have completed. Check Mosic for research page."
```
</error_handling>

<success_criteria>
- [ ] Task loaded from Mosic
- [ ] Phase research loaded (to inherit, not repeat)
- [ ] Task context loaded (from discuss-task if exists)
- [ ] Distributed threshold evaluated (task requirements count vs config threshold)
- [ ] If distributed: requirements grouped by category prefix, researchers spawned in parallel
- [ ] If distributed: interface contracts collected, dependency order computed
- [ ] If distributed: task_decomposition stored in config.mosic.session
- [ ] If single: gsd-task-researcher spawned with full context
- [ ] Research page(s) created/updated
- [ ] Page(s) tagged (gsd-managed, task-research)
- [ ] Comment added to task
- [ ] config.json updated with page ID(s)
- [ ] User knows next steps with Mosic URLs
</success_criteria>
