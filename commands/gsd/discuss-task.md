---
name: gsd:discuss-task
description: Gather context and clarify requirements for a specific task
argument-hint: "[task-identifier]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Extract implementation decisions for a specific task - downstream agents (researcher, planner) will use the context page to know what to investigate and what choices are locked.

**Mirrors:** `/gsd:discuss-phase` but at task level

**How it works:**
1. Load task from Mosic
2. Analyze the task to identify gray areas (behavior, edge cases, etc.)
3. Present gray areas - user selects which to discuss
4. Deep-dive each selected area until satisfied
5. Create/update Context page in Mosic linked to task

**Output:** M Page with decisions clear enough that downstream agents can act without asking the user again.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/discuss-shared.md
@~/.claude/get-shit-done/templates/context.md
@~/.claude/get-shit-done/references/detection-constants.md
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
 GSD > DISCUSSING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
```

## 3. Load Task and Phase Context

```
# Get task pages
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

# Check for existing context page
existing_context_page = task_pages.find(p =>
  p.title.includes("Context") or p.title.includes("Decisions")
)

# Get parent phase
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Get phase pages for inherited context
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

phase_context_page = phase_pages.find(p => p.title.includes("Context"))
phase_research_page = phase_pages.find(p => p.title.includes("Research"))

# Load phase context if exists
phase_context_content = ""
IF phase_context_page:
  phase_context_content = mosic_get_page(phase_context_page.name, {
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
Phase: {phase.title}
- Phase context: {phase_context_page ? "Available" : "None"}
- Task context: {existing_context_page ? "Exists" : "None"}
```

## 4. Check for Existing Context

```
IF existing_context_page:
  context_content = mosic_get_page(existing_context_page.name, {
    content_format: "markdown"
  })

  Display: "Existing task decisions found:"
  Display: context_content.content.substring(0, 500) + "..."

  AskUserQuestion({
    questions: [{
      question: "How would you like to proceed?",
      header: "Context",
      options: [
        { label: "Update (Recommended)", description: "Add more decisions to existing context" },
        { label: "View full", description: "See all existing decisions" },
        { label: "Skip", description: "Proceed to research or planning" }
      ],
      multiSelect: false
    }]
  })

  IF user_selection == "View full":
    Display: context_content.content
    EXIT

  IF user_selection == "Skip":
    Display: "Skipping discussion. Run /gsd:research-task or /gsd:plan-task"
    EXIT
```

## 4.5-7. Discussion Flow (Shared Workflow)

Follow `@~/.claude/get-shit-done/workflows/discuss-shared.md` with these scope parameters:

```xml
<discussion_scope>
  <entity_type>MTask</entity_type>
  <entity_id>{TASK_ID}</entity_id>
  <entity_title>{TASK_TITLE}</entity_title>
  <entity_label>{TASK_IDENTIFIER}</entity_label>
  <scope_text>{task.title + " " + task.description}</scope_text>
  <scope_guardrail>That's beyond this task's scope. I'll note it for a separate task.</scope_guardrail>
  <web_search_count>1-2</web_search_count>
  <tag_set>[config.mosic.tags.gsd_managed, config.mosic.tags.task_context or "task-context"]</tag_set>
  <config_key>task-{TASK_IDENTIFIER}-context</config_key>
  <parent_context_page_id>{phase_context_page ? phase_context_page.name : null}</parent_context_page_id>
</discussion_scope>
```

The shared workflow handles:
1. **Quick Discovery** — codebase scan, web research, frontend detection
2. **Pre-Discussion Gap Scan** — cross-reference goal + requirements + discovery
3. **Gray Area Generation** — gap-informed, frontend, TDD (using `@detection-constants.md`)
4. **Deep-Dive Question Loop** — 3-4 per area, continue/next, scope guardrail
5. **Post-Discussion Gap Assessment** — track resolved vs remaining gaps
6. **Context Page Creation** — Editor.js blocks with canonical sections, tagging

Output: `context_page_id` stored in config via `config_key`

## 8. Update Config

```
config.mosic.pages["task-" + TASK_IDENTIFIER + "-context"] = context_page_id
config.mosic.session.active_task = TASK_ID
config.mosic.session.active_task_identifier = TASK_IDENTIFIER
config.mosic.session.last_action = "discuss-task"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

## 9. Present Results and Next Steps

```
Display:
"""
-------------------------------------------
 GSD > CONTEXT CAPTURED
-------------------------------------------

**{TASK_IDENTIFIER}:** {TASK_TITLE}

{selected_areas.length} areas discussed
{all_decisions.length} decisions documented
{deferred_items.length ? deferred_items.length + " ideas deferred to separate tasks" : ""}

Context: https://mosic.pro/app/page/{context_page_id}

---

## Next Up

**Research implementation approach**

`/gsd:research-task {TASK_IDENTIFIER}`

or skip research and plan directly:

`/gsd:plan-task {TASK_IDENTIFIER}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- View context page in Mosic
- `/gsd:discuss-task {TASK_IDENTIFIER}` - add more context

---
"""
```

</process>

<context_page_format>
**CRITICAL: Use canonical section names** — downstream agents parse these exact headings:
- `## Decisions` (locked choices — NON-NEGOTIABLE)
- `## Claude's Discretion` (flexible areas — top-level heading, NOT nested under Decisions)
- `## Deferred Ideas` (out of scope — FORBIDDEN for downstream agents)

The context page should follow this structure:

```markdown
# {TASK_IDENTIFIER}: Context & Decisions

**Task:** {TASK_TITLE}
**Discussed:** {date}

## Decisions

### {Area 1 Name}

**Q:** {Question 1}
**A:** {User's answer}

**Q:** {Question 2}
**A:** {User's answer}

### {Area 2 Name}

...

## Claude's Discretion

These areas are left to Claude's judgment:
- {Item 1}
- {Item 2}

## Deferred Ideas

These suggestions are out of scope for this task:
- {Idea 1} - Create separate task
- {Idea 2} - Consider for future work

## Discussion Gap Status

**Pre-Discussion:** {CLEAR | GAPS_FOUND}
**Resolved:** {resolved_gaps.length} of {pre_discussion_gaps.count}

### Resolved Gaps
{resolved_gaps.map(g => "- " + g.description + " → Resolved by: " + g.resolved_by).join("\n") || "No gaps identified."}

### Remaining Gaps (for Research)
{remaining_gaps.map(g => "- **Gap:** " + g.description + " — " + g.recommended_action).join("\n") || "All gaps resolved through discussion."}

## Summary

{Brief summary of key decisions that will shape implementation}
```
</context_page_format>

<success_criteria>
- [ ] Task loaded from Mosic
- [ ] Phase context loaded for inherited decisions
- [ ] Quick discovery completed (codebase scan + web research)
- [ ] Pre-discussion gap scan completed
- [ ] Gray areas prioritized by gap severity
- [ ] User chose which areas to discuss
- [ ] Each selected area explored until satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] Post-discussion gap assessment completed
- [ ] Context page created/updated in Mosic linked to task
- [ ] Discussion Gap Status section included in context page
- [ ] Tags applied (gsd-managed, task-context)
- [ ] config.json updated with page mapping
- [ ] User knows next steps with Mosic URLs
</success_criteria>
