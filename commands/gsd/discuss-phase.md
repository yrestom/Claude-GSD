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
  - WebSearch
  - WebFetch
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
@~/.claude/get-shit-done/workflows/discuss-shared.md
@~/.claude/get-shit-done/templates/context.md
@~/.claude/get-shit-done/references/detection-constants.md
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

## 4.5-7. Discussion Flow (Shared Workflow)

Follow `@~/.claude/get-shit-done/workflows/discuss-shared.md` with these scope parameters:

```xml
<discussion_scope>
  <entity_type>MTask List</entity_type>
  <entity_id>{task_list_id}</entity_id>
  <entity_title>{phase.title}</entity_title>
  <entity_label>Phase {PHASE}</entity_label>
  <scope_text>{phase.title + " " + phase.description + " " + requirements_content}</scope_text>
  <scope_guardrail>That's its own phase. I'll note it for later.</scope_guardrail>
  <web_search_count>2-3</web_search_count>
  <tag_set>[config.mosic.tags.gsd_managed, config.mosic.tags.context, config.mosic.tags.phase_tags[phase_key]]</tag_set>
  <config_key>phase-{PHASE}-context</config_key>
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
- [ ] Quick discovery completed (codebase scan + web research)
- [ ] Pre-discussion gap scan completed
- [ ] Gray areas prioritized by gap severity
- [ ] User chose which areas to discuss
- [ ] Each selected area explored until satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] Post-discussion gap assessment completed
- [ ] Context page created/updated in Mosic linked to phase
- [ ] Discussion Gap Status section included in context page
- [ ] Phase task list description updated with key decisions
- [ ] Tags applied (gsd-managed, phase-NN)
- [ ] config.json updated with page mapping
- [ ] User knows next steps with Mosic URLs
</success_criteria>
