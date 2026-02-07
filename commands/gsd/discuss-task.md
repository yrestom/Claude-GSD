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
@~/.claude/get-shit-done/workflows/discuss-phase.md
@~/.claude/get-shit-done/templates/context.md
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

## 4.5 Quick Discovery (Automated)

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK DISCOVERY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scanning codebase for task-relevant context...
```

### 4.5.1 Focused Codebase Scan
Scan the project codebase for context relevant to THIS task:
- Files and directories related to the task description (Glob + Grep)
- Existing implementations of similar patterns
- Related components, APIs, or modules
- Import patterns and dependencies

### 4.5.2 Quick Web Research (1-2 searches)
Search for best practices specific to the task:
- "[task keywords] best practices [framework] [current year]"
- 1-2 targeted searches max (task scope is smaller)

### 4.5.3 Present Discovery

Display:
```
-------------------------------------------
 Discovery Findings
-------------------------------------------

**Relevant Code Found:**
- {Existing files/patterns related to task}
- {What already exists that this task connects to}

**Best Practices:**
- {Key finding from web research}

**Considerations:**
- {What the existing code suggests about implementation}
```

This context informs the gray areas in step 5.

### 4.5.4 Frontend Detection

```
# Detect frontend work from task description
frontend_keywords = ["UI", "frontend", "component", "page", "screen", "layout",
  "design", "form", "button", "modal", "dialog", "sidebar", "navbar", "dashboard",
  "responsive", "styling", "CSS", "Tailwind", "React", "Vue", "template", "view",
  "UX", "interface", "widget"]

task_text = (task.title + " " + task.description).toLowerCase()
is_frontend = frontend_keywords.some(kw => task_text.includes(kw.toLowerCase()))

IF is_frontend:
  # Load frontend design reference
  frontend_design_ref = Read("~/.claude/get-shit-done/references/frontend-design.md")
  Display: "Frontend work detected — UI-specific gray areas will be included."
```

## 5. Analyze Task and Generate Gray Areas

```
# Use discovery findings + task description to generate gray areas
task_desc_lower = task.description.toLowerCase()

# Discovery-informed analysis based on task type and codebase findings
gray_areas = []

# Gray areas informed by discovery (existing patterns, best practices)

# If frontend detected, add UI-specific gray areas from frontend-design reference
IF is_frontend:
  gray_areas.push({
    id: "F",
    name: "UI Design & Layout",
    reason: "Frontend work detected — layout, interactions, and visual design need decisions"
  })

IF task_desc_lower.includes("ui") or task_desc_lower.includes("form") or task_desc_lower.includes("component"):
  gray_areas.push({
    id: "A",
    name: "User Interaction",
    reason: "How should users interact with this feature?"
  })

IF task_desc_lower.includes("api") or task_desc_lower.includes("endpoint") or task_desc_lower.includes("request"):
  gray_areas.push({
    id: "B",
    name: "API Behavior",
    reason: "What should the API return in different scenarios?"
  })

IF task_desc_lower.includes("error") or task_desc_lower.includes("fail") or task_desc_lower.includes("invalid"):
  gray_areas.push({
    id: "C",
    name: "Error Handling",
    reason: "How should errors be handled and communicated?"
  })

IF task_desc_lower.includes("data") or task_desc_lower.includes("store") or task_desc_lower.includes("persist"):
  gray_areas.push({
    id: "D",
    name: "Data Handling",
    reason: "How should data be stored, validated, and transformed?"
  })

# Always include edge cases
gray_areas.push({
  id: String.fromCharCode(65 + gray_areas.length),
  name: "Edge Cases",
  reason: "What happens in unusual or boundary conditions?"
})

# Always include success criteria
gray_areas.push({
  id: String.fromCharCode(65 + gray_areas.length),
  name: "Success Criteria",
  reason: "How do we know this task is truly complete?"
})

# Limit to 4 gray areas
gray_areas = gray_areas.slice(0, 4)
```

Display:
```
Based on "{TASK_TITLE}", I've identified areas where your input will shape implementation:

{gray_areas.map(g => "[" + g.id + "] " + g.name + " - " + g.reason).join("\n")}

Which areas should we discuss? (Enter letters, e.g., "A, C" or "all")
```

Wait for response.

## 6. Deep-Dive Selected Areas

For each selected area:

```
FOR each selected_area in user_selection:
  Display:
  """
  -------------------------------------------
   Discussing: {selected_area.name}
  -------------------------------------------
  """

  # Ask 3-4 targeted questions per area
  questions_asked = 0
  area_decisions = []

  WHILE questions_asked < 4:
    # Generate contextual question based on area and task
    question = generate_contextual_question(selected_area, task, questions_asked)

    AskUserQuestion({
      questions: [{
        question: question.text,
        header: selected_area.name.substring(0, 12),
        options: question.options,
        multiSelect: false
      }]
    })

    area_decisions.push({
      question: question.text,
      answer: user_response
    })

    questions_asked += 1

  # After 3-4 questions
  AskUserQuestion({
    questions: [{
      question: "More questions about " + selected_area.name + ", or move to next?",
      header: "Continue?",
      options: [
        { label: "Move to next", description: "Done with this area" },
        { label: "More questions", description: "Keep discussing" }
      ],
      multiSelect: false
    }]
  })

  IF user_selection == "More questions":
    # Ask 3-4 more questions
    CONTINUE with more questions
```

**Scope guardrail:**
- Task scope is FIXED by the task description
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's beyond this task's scope. I'll note it for a separate task."
- Capture deferred ideas - don't lose them, don't act on them

## 7. Create/Update Context Page in Mosic

```
Display: "Ready to save context decisions?"

AskUserQuestion({
  questions: [{
    question: "Save decisions to Mosic?",
    header: "Save",
    options: [
      { label: "Yes, save", description: "Create/update context page" },
      { label: "Add more", description: "Discuss more areas first" }
    ],
    multiSelect: false
  }]
})

IF user_selection == "Add more":
  GOTO step 5 (present gray areas again)

# Build context content
context_content = build_context_markdown({
  task_identifier: TASK_IDENTIFIER,
  task_title: TASK_TITLE,
  areas_discussed: selected_areas,
  decisions: all_decisions,
  deferred_ideas: deferred_items
})

IF existing_context_page:
  # Append new decisions
  mosic_update_document("M Page", existing_context_page.name, {
    content: convert_to_editorjs(
      existing_content + "\n\n---\n\n## Updated Decisions\n\n" + new_decisions
    ),
    status: "Published"
  })
  context_page_id = existing_context_page.name
ELSE:
  # Create new context page linked to task
  context_page = mosic_create_entity_page("MTask", TASK_ID, {
    workspace_id: workspace_id,
    title: TASK_IDENTIFIER + " Context & Decisions",
    page_type: "Document",
    icon: "lucide:message-square",
    status: "Published",
    content: convert_to_editorjs(context_content),
    relation_type: "Related"
  })
  context_page_id = context_page.name

# Tag the context page
mosic_batch_add_tags_to_document("M Page", context_page_id, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.task_context or "task-context"
])
```

## 8. Update Config

```
config.mosic.pages["task-" + TASK_IDENTIFIER + "-context"] = context_page_id
config.mosic.session.active_task = TASK_ID
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

## Summary

{Brief summary of key decisions that will shape implementation}
```
</context_page_format>

<success_criteria>
- [ ] Task loaded from Mosic
- [ ] Phase context loaded for inherited decisions
- [ ] Quick discovery completed (codebase scan + web research)
- [ ] Gray areas identified through discovery-informed analysis
- [ ] User chose which areas to discuss
- [ ] Each selected area explored until satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] Context page created/updated in Mosic linked to task
- [ ] Tags applied (gsd-managed, task-context)
- [ ] config.json updated with page mapping
- [ ] User knows next steps with Mosic URLs
</success_criteria>
