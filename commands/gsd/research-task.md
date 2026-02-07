---
name: gsd:research-task
description: Research implementation approach for a specific task
argument-hint: "[task-identifier]"
allowed-tools:
  - Read
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

Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-task-researcher | sonnet | sonnet | haiku |
```

## 2. Load Task from Mosic

```
# Extract task identifier
task_identifier = extract_identifier($ARGUMENTS)

# Load task
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
 GSD > RESEARCHING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
```

## 3. Load Context

```
# Get task pages
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

# Check for existing research
existing_research_page = task_pages.find(p => p.title.includes("Research"))

# Check for context page (from discuss-task)
task_context_page = task_pages.find(p => p.title.includes("Context"))

task_context_content = ""
IF task_context_page:
  task_context_content = mosic_get_page(task_context_page.name, {
    content_format: "markdown"
  }).content

# Get parent phase
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Get phase research (to inherit, not repeat)
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

phase_research_page = phase_pages.find(p => p.title.includes("Research"))

phase_research_content = ""
IF phase_research_page:
  phase_research_content = mosic_get_page(phase_research_page.name, {
    content_format: "markdown"
  }).content
```

## 4. Check for Existing Research

```
IF existing_research_page:
  existing_content = mosic_get_page(existing_research_page.name, {
    content_format: "markdown"
  })

  Display:
  """
  Existing task research found.

  Summary:
  {existing_content.content.substring(0, 500)}...
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

## 6. Extract Decisions and Spawn Task Researcher Agent

Display:
```
-------------------------------------------
 GSD > SPAWNING RESEARCHER
-------------------------------------------

Investigating implementation approach...
```

**Extract user decisions from context pages (task-level and phase-level):**
```
locked_decisions = ""
deferred_ideas = ""
discretion_areas = ""

# Extract from task context page first
IF task_context_content:
  locked_decisions = extract_section(task_context_content, "## Decisions")
  deferred_ideas = extract_section(task_context_content, "## Deferred Ideas")
  discretion_areas = extract_section(task_context_content, "## Claude's Discretion")

# Also load phase context for inherited decisions
phase_context_page = phase_pages.find(p => p.title.includes("Context"))
phase_context_content = ""
IF phase_context_page:
  phase_context_content = mosic_get_page(phase_context_page.name, {
    content_format: "markdown"
  }).content

  # Merge phase-level decisions (task-level takes precedence)
  IF not locked_decisions:
    locked_decisions = extract_section(phase_context_content, "## Decisions")
    IF not locked_decisions:
      locked_decisions = extract_section(phase_context_content, "## Implementation Decisions")
  ELSE:
    phase_decisions = extract_section(phase_context_content, "## Decisions")
    IF phase_decisions:
      locked_decisions = locked_decisions + "\n\n**Inherited from phase:**\n" + phase_decisions

  IF not deferred_ideas:
    deferred_ideas = extract_section(phase_context_content, "## Deferred Ideas")
  IF not discretion_areas:
    discretion_areas = extract_section(phase_context_content, "## Claude's Discretion")

# Also check research page for User Constraints
IF phase_research_content AND not locked_decisions:
  user_constraints = extract_section(phase_research_content, "## User Constraints")
  IF user_constraints:
    locked_decisions = extract_subsection(user_constraints, "### Locked Decisions")
    deferred_ideas = extract_subsection(user_constraints, "### Deferred Ideas")
    discretion_areas = extract_subsection(user_constraints, "### Claude's Discretion")

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

```
researcher_prompt = """
""" + user_decisions_xml + """

<objective>
Research how to implement task """ + TASK_IDENTIFIER + """: """ + TASK_TITLE + """

Answer: "What do I need to know to PLAN this task well?"
</objective>

<context>
**Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """
**Task ID:** """ + TASK_ID + """
**Research Page:** """ + RESEARCH_PAGE_ID + """
**Workspace:** """ + workspace_id + """

**Task Description:**
""" + task.description + """

**Task Context (from discussion, if available):**
""" + (task_context_content or "No task-specific context available.") + """

**Phase Research (inherit, don't repeat):**
""" + (phase_research_content or "No phase research available. May need to research more broadly.") + """

</context>

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
Update research page """ + RESEARCH_PAGE_ID + """ with:

# """ + TASK_IDENTIFIER + """ Research

**Task:** """ + TASK_TITLE + """
**Researched:** {date}
**Confidence:** HIGH/MEDIUM/LOW

## User Constraints
### Locked Decisions
[Copy from task context AND phase context verbatim - NON-NEGOTIABLE]
### Claude's Discretion
[Areas where planner can choose]
### Deferred Ideas (OUT OF SCOPE)
[Do NOT plan these]

If no context: "No user constraints — all decisions at Claude's discretion"

## Summary
{2-3 sentence summary of key findings}

## Implementation Approach
**Recommended approach:** {specific recommendation}
**Why:** {justification}

## Code Patterns
### Pattern 1: {Name}
```{language}
// Source: {Context7/official docs}
{code example}
```

## Gotchas
- **{Gotcha 1}:** {what goes wrong, how to avoid}

## Dependencies
- {Library}: {version} - {why needed}

## Open Questions
- {Any unresolved questions for planner}

---

Return:
## RESEARCH COMPLETE

**Confidence:** {level}
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
IF researcher_output contains "## RESEARCH COMPLETE":
  # Extract confidence and key finding
  confidence = extract_field(researcher_output, "Confidence:")
  key_finding = extract_field(researcher_output, "Key Finding:")

  # Update page status
  mosic_update_document("M Page", RESEARCH_PAGE_ID, {
    status: "Published"
  })

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
config.mosic.pages["task-" + TASK_IDENTIFIER + "-research"] = RESEARCH_PAGE_ID
config.mosic.session.active_task = TASK_ID
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

Confidence: {confidence}
Key Finding: {key_finding}

Research: https://mosic.pro/app/page/{RESEARCH_PAGE_ID}

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
- [ ] Research page created/updated
- [ ] gsd-task-researcher spawned with full context
- [ ] Research page updated with findings
- [ ] Page tagged (gsd-managed, task-research)
- [ ] Comment added to task
- [ ] config.json updated with page ID
- [ ] User knows next steps with Mosic URLs
</success_criteria>
