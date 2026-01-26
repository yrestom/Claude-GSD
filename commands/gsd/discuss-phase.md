---
name: gsd:discuss-phase
description: Gather phase context through adaptive questioning (Mosic-native)
argument-hint: "<phase>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Extract implementation decisions that downstream agents need - researcher and planner will use the context page to know what to investigate and what choices are locked.

**How it works:**
1. Load phase from Mosic
2. Analyze the phase to identify gray areas (UI, UX, behavior, etc.)
3. Present gray areas - user selects which to discuss
4. Deep-dive each selected area until satisfied
5. Create/update Context page in Mosic linked to phase

**Output:** M Page with decisions clear enough that downstream agents can act without asking the user again.

**Architecture:** All state in Mosic. Context page linked to phase task list. config.json stores entity IDs only.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/discuss-phase.md
@~/.claude/get-shit-done/templates/context.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)
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

## 2. Validate and Load Phase from Mosic

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

# Load phase details
phase = mosic_get_task_list(task_list_id, {
  include_tasks: false
})

# Load phase pages
phase_pages = mosic_get_entity_pages("MTask List", task_list_id, {
  include_subtree: false
})

# Check for existing context page
existing_context_page = phase_pages.find(p =>
  p.title contains "Context" or p.title contains "Decisions"
)
```

Display:
```
Loading Phase {PHASE}: {phase.title}
- Context: {existing_context_page ? "Found" : "None"}
```

## 3. Check for Existing Context

```
IF existing_context_page:
  context_content = mosic_get_page(existing_context_page.name, {
    content_format: "markdown"
  })

  Display existing decisions summary

  Offer:
  1) Update context (add more decisions)
  2) View full context
  3) Skip to planning

  Wait for response.
```

## 4. Load Project Context from Mosic

```
# Load roadmap for phase scope
roadmap_content = ""
IF config.mosic.pages.roadmap:
  roadmap_content = mosic_get_page(config.mosic.pages.roadmap, {
    content_format: "markdown"
  }).content

# Load requirements for context
requirements_content = ""
IF config.mosic.pages.requirements:
  requirements_content = mosic_get_page(config.mosic.pages.requirements, {
    content_format: "markdown"
  }).content
```

## 5. Analyze Phase and Generate Gray Areas

**Domain-aware analysis:**

Gray areas depend on what's being built. Analyze the phase goal:
- Something users SEE -> layout, density, interactions, states
- Something users CALL -> responses, errors, auth, versioning
- Something users RUN -> output format, flags, modes, error handling
- Something users READ -> structure, tone, depth, flow
- Something being ORGANIZED -> criteria, grouping, naming, exceptions

Generate 3-4 **phase-specific** gray areas, not generic categories.

```
Display:

Based on Phase {PHASE}: {phase.title}, I've identified areas where your input will shape implementation:

[A] {Gray Area 1} - {why this needs clarification}
[B] {Gray Area 2} - {why this needs clarification}
[C] {Gray Area 3} - {why this needs clarification}
[D] {Gray Area 4} - {why this needs clarification}

Which areas should we discuss? (Enter letters, e.g., "A, C" or "all")
```

Wait for response.

## 6. Deep-Dive Selected Areas

For each selected area:

```
Display:

-------------------------------------------
 Discussing: {Gray Area Name}
-------------------------------------------
```

**Ask 4 questions per area:**
- Questions should elicit specific, actionable decisions
- Not "what do you want?" but "how should this behave when X?"
- Focus on edge cases and concrete scenarios

After 4 questions:
```
"More questions about {area}, or move to next?"
```

If more -> Ask 4 more questions, check again
If next -> Proceed to next selected area

**Scope guardrail:**
- Phase boundary from roadmap is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's its own phase. I'll note it for later."
- Capture deferred ideas - don't lose them, don't act on them

**Do NOT ask about (Claude handles these):**
- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion

## 7. Create/Update Context Page in Mosic

After all selected areas discussed:

```
Display: "Ready to create context?"
```

Wait for confirmation.

**Build context content:**
```
context_content = build_context_markdown({
  phase: PHASE,
  phase_title: phase.title,
  areas_discussed: selected_areas,
  decisions: collected_decisions,
  deferred_ideas: deferred_items
})
```

**Create or update context page:**

```
IF existing_context_page:
  # Append new decisions to existing page
  mosic_update_document("M Page", existing_context_page.name, {
    content: convert_to_editorjs(
      existing_content + "\n\n---\n\n## Updated Decisions\n\n" + new_decisions
    ),
    status: "Published"
  })
  context_page_id = existing_context_page.name
ELSE:
  # Create new context page linked to phase
  context_page = mosic_create_entity_page("MTask List", task_list_id, {
    workspace_id: workspace_id,
    title: "Phase " + PHASE + " Context & Decisions",
    page_type: "Document",
    icon: "lucide:message-square",
    status: "Published",
    content: convert_to_editorjs(context_content),
    relation_type: "Related"
  })
  context_page_id = context_page.name
```

**Tag the context page:**

```
mosic_batch_add_tags_to_document("M Page", context_page_id, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.phase_tags[phase_key]
])
```

## 8. Update Phase Task List Description

```
# Extract key decisions for quick reference
key_decisions = extract_key_decisions(context_content)

# Update phase description with decisions summary
# IMPORTANT: MTask List descriptions use HTML format
current_description = phase.description or ""

mosic_update_document("MTask List", task_list_id, {
  description: current_description + "<h2>Key Decisions</h2>" +
    "<ul>" + key_decisions.map(d => "<li>" + d + "</li>").join("") + "</ul>"
})
```

## 9. Update Config

```
config.mosic.pages["phase-" + PHASE + "-context"] = context_page_id
config.mosic.session.last_action = "discuss-phase"
config.mosic.session.active_phase = task_list_id
config.mosic.session.last_updated = "[ISO timestamp]"

write config.json
```

Display:
```
Context synced to Mosic
Page: https://mosic.pro/app/page/{context_page_id}
Decisions captured: {N} areas discussed
```

## 10. Offer Next Steps

```
-------------------------------------------
 GSD > CONTEXT CAPTURED
-------------------------------------------

**Phase {PHASE}: {phase.title}**

{N} areas discussed
{M} decisions documented
{deferred_items.length ? deferred_items.length + " ideas deferred" : ""}

Context: https://mosic.pro/app/page/{context_page_id}

---

## Next Up

**Research Phase {PHASE}** - investigate implementation approaches

`/gsd:research-phase {PHASE}`

or skip research and plan directly:

`/gsd:plan-phase {PHASE}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- View context page in Mosic
- Add more context: `/gsd:discuss-phase {PHASE}`

---
```

</process>

<error_handling>
```
IF mosic sync fails:
  Display: "Mosic sync failed: {error}"

  # Display content directly (no local file backup)
  Display: "---"
  Display: "Context content that failed to sync:"
  Display: "---"
  Display: {context_content}
  Display: "---"

  Display: "To retry: /gsd:discuss-phase {PHASE}"
  Display: "The content above can be manually copied to Mosic if needed."
```
</error_handling>

<success_criteria>
- [ ] Phase loaded from Mosic
- [ ] Gray areas identified through intelligent analysis
- [ ] User chose which areas to discuss
- [ ] Each selected area explored until satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] Context page created/updated in Mosic linked to phase
- [ ] Phase task list description updated with key decisions
- [ ] Tags applied (gsd-managed, phase-NN)
- [ ] config.json updated with page mapping
- [ ] User knows next steps with Mosic URLs
</success_criteria>
