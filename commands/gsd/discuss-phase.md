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

## 4.5 Quick Discovery (Automated)

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK DISCOVERY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scanning codebase and researching best practices...
```

### 4.5.1 Codebase Scan
Scan the project codebase for context relevant to this phase:
- Existing patterns and architecture (Glob + Grep key directories)
- Frameworks and libraries in use (package.json, requirements.txt, Gemfile, etc.)
- Existing components/modules related to this phase's goal
- Code conventions and project structure

### 4.5.2 Quick Web Research
Search for best practices related to the phase goal:
- "[phase goal keywords] best practices [current year]"
- "[detected framework] [phase goal] patterns"
- 2-3 targeted searches max (keep it quick, ~2-3 minutes)

### 4.5.3 Present Discovery

Display:
```
-------------------------------------------
 Discovery Findings
-------------------------------------------

**Existing Codebase:**
- Framework: {detected framework and version}
- Relevant existing code: {what already exists}
- Patterns in use: {architecture patterns found}

**Best Practices Found:**
- {Key finding 1 from web research}
- {Key finding 2}

**Technical Considerations:**
- {What's possible given the current stack}
- {What would require new dependencies}
```

This context informs the gray areas in step 5.

### 4.5.4 Frontend Detection

```
# Detect frontend work from phase goal and requirements
frontend_keywords = ["UI", "frontend", "component", "page", "screen", "layout",
  "design", "form", "button", "modal", "dialog", "sidebar", "navbar", "dashboard",
  "responsive", "styling", "CSS", "Tailwind", "React", "Vue", "template", "view",
  "UX", "interface", "widget"]

phase_text = (phase.title + " " + phase.description + " " + requirements_content).toLowerCase()
is_frontend = frontend_keywords.some(kw => phase_text.includes(kw.toLowerCase()))

IF is_frontend:
  # Load frontend design reference
  frontend_design_ref = Read("~/.claude/get-shit-done/references/frontend-design.md")
  # Use "For Discussers" section to generate UI-specific gray areas
  Display: "Frontend work detected — UI-specific gray areas will be included."
```

## 4.6 Pre-Discussion Gap Scan

Cross-reference phase goal + requirements against discovery findings to identify what's
missing or ambiguous BEFORE generating gray areas.

```
# What we know:
# - Phase goal (from task list description)
# - Requirements (from requirements page, if loaded in Step 4)
# - Discovery findings (from Step 4.5)

# Cross-reference:
1. Enumerate what the phase goal implies must be decided
   - What behaviors need specifying?
   - What interfaces need defining?
   - What edge cases need handling?

2. Check which of these are already answered by:
   - Existing requirements
   - Discovery findings (best practices found)
   - Obvious defaults

3. Remaining items = gaps
   Classify each:
   - REQUIREMENT_GAP: Phase goal implies X but no requirement defines it
   - AMBIGUITY_GAP: Requirement exists but allows 2+ valid interpretations
   - CONFLICT_GAP: Two requirements or findings contradict
   - UNKNOWN_GAP: Technical question discovery couldn't answer

4. pre_discussion_gaps = { gaps: [...], count: N }

Display:
"""
Gap scan: {N} areas identified that need your input
{IF N == 0: "No ambiguities detected — gray areas will cover preferences."}
{IF N > 0: list top 3 gaps briefly}
"""
```

## 5. Analyze Phase and Generate Gray Areas

**Discovery-informed analysis:**

Using discovery findings from step 4.5 AND the phase goal, generate gray areas.

Gray areas depend on what's being built. Analyze the phase goal:
- Something users SEE -> layout, density, interactions — informed by existing UI patterns found
- Something users CALL -> responses, errors, auth — informed by existing API patterns found
- Something users RUN -> output format, flags, modes — informed by existing CLI patterns found
- Something users READ -> structure, tone, depth, flow
- Something being ORGANIZED -> criteria, grouping, naming, exceptions

Gray areas should reference discovery findings when relevant:
- "Your project uses {framework}, so the key decision is..."
- "You already have {pattern}, so the question is whether to extend it or..."
- "Based on {best practice found}, consider..."

**Gap-informed gray area priority:**
```
IF pre_discussion_gaps.count > 0:
  # Convert gaps to gray areas (gaps get priority slots)
  gap_gray_areas = pre_discussion_gaps.gaps.slice(0, 2).map(gap => ({
    label: "⚠ " + gap.area,
    description: gap.description + " (identified as gap in requirements)"
  }))

  # Fill remaining slots with standard gray areas
  standard_gray_areas = generate_standard_gray_areas().slice(0, 4 - gap_gray_areas.length)
  gray_areas = [...gap_gray_areas, ...standard_gray_areas]
ELSE:
  gray_areas = generate_standard_gray_areas()  # existing logic unchanged
```

Generate 3-4 **phase-specific** gray areas, not generic categories. Total still capped at 4.

**If `is_frontend` is true:** Additionally generate UI-specific gray areas from the
frontend-design reference (layout approach, interaction patterns, state visualization,
responsive behavior, component reuse). Present ASCII wireframe options for layout decisions.

**TDD gray area detection:**
```
tdd_keywords = ["API", "endpoint", "validation", "parser", "transform", "algorithm",
  "state machine", "workflow engine", "utility", "helper", "business logic",
  "data model", "schema", "converter", "calculator", "formatter", "serializer",
  "authentication", "authorization"]

tdd_config = config.workflow?.tdd ?? "auto"
is_tdd_eligible = tdd_config == true OR
  (tdd_config !== false AND tdd_keywords.some(kw => phase_text.includes(kw.toLowerCase())))

IF is_tdd_eligible:
  # Add "Testing Approach" as an additional gray area
  # "This phase involves testable logic. Should we use Test-Driven Development
  #  (write tests first, then implement) for the core logic tasks?"
  # Options: TDD for core logic / Standard (implement then test) / Mix (let planner decide)
```

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

## 6.5 Post-Discussion Gap Assessment

```
# Check which pre-discussion gaps were resolved through user answers
resolved_gaps = []
remaining_gaps = []

FOR each gap in pre_discussion_gaps.gaps:
  IF gap was covered by a discussed area AND user made a decision:
    resolved_gaps.push({ ...gap, resolved_by: area_name })
  ELSE:
    remaining_gaps.push(gap)

# Also check for NEW gaps surfaced during discussion
# (e.g., user revealed conflicting preferences, or "I haven't decided yet" answers)
FOR each discussed_area:
  IF user response was ambiguous or explicitly deferred:
    remaining_gaps.push({
      type: "DEFERRED_GAP",
      area: area_name,
      description: "User deferred decision — researcher should investigate options"
    })

gap_resolution_status = remaining_gaps.length == 0 ? "RESOLVED" : "PARTIAL"

Display:
"""
Gap assessment: {resolved_gaps.length} resolved, {remaining_gaps.length} remaining
{IF remaining_gaps.length > 0: "Remaining gaps will be flagged for research investigation."}
"""
```

## 7. Create/Update Context Page in Mosic

After all selected areas discussed:

```
Display: "Ready to create context?"
```

Wait for confirmation.

**Build context content:**

**CRITICAL: Use canonical section names** — downstream agents parse these exact headings:
- `## Decisions` (locked choices — NON-NEGOTIABLE)
- `## Claude's Discretion` (flexible areas — top-level heading, NOT nested under Decisions)
- `## Deferred Ideas` (out of scope — FORBIDDEN for downstream agents)
- `## Discussion Gap Status` (gap tracking — researcher reads this to prioritize investigation)

```
context_content = build_context_markdown({
  phase: PHASE,
  phase_title: phase.title,
  areas_discussed: selected_areas,
  decisions: collected_decisions,
  deferred_ideas: deferred_items,
  pre_discussion_gaps: pre_discussion_gaps,
  resolved_gaps: resolved_gaps,
  remaining_gaps: remaining_gaps
})
```

**Include Discussion Gap Status section** (after Deferred Ideas, in Editor.js blocks):

```javascript
// After existing Deferred Ideas blocks...
{
  type: "header",
  data: { text: "Discussion Gap Status", level: 2 }
},
{
  type: "paragraph",
  data: { text: "**Pre-Discussion:** " + (pre_discussion_gaps.count > 0 ? "GAPS_FOUND" : "CLEAR") +
    "\n**Resolved:** " + resolved_gaps.length + " of " + pre_discussion_gaps.count }
},
// IF resolved_gaps.length > 0:
{
  type: "header",
  data: { text: "Resolved Gaps", level: 3 }
},
{
  type: "list",
  data: { style: "unordered", items: resolved_gaps.map(g => g.description + " → Resolved by: " + g.resolved_by) }
},
// IF remaining_gaps.length > 0:
{
  type: "header",
  data: { text: "Remaining Gaps (for Research)", level: 3 }
},
{
  type: "list",
  data: { style: "unordered", items: remaining_gaps.map(g => g.description + " — " + g.recommended_action) }
}
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
  config.mosic.tags.context,
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
