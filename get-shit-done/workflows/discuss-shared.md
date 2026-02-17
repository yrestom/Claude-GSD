# Shared Discussion Workflow

Shared logic for `/gsd:discuss-phase` and `/gsd:discuss-task`. Both commands provide scope-specific parameters via `<discussion_scope>` XML, then follow this workflow for Steps 4.5-7.

**Consumers:** `commands/gsd/discuss-phase.md`, `commands/gsd/discuss-task.md`

---

## Scope Parameters (provided by command)

```xml
<discussion_scope>
  <entity_type>MTask List | MTask</entity_type>
  <entity_id>{id}</entity_id>
  <entity_title>{title}</entity_title>
  <entity_label>Phase 01 | AUTH-5</entity_label>
  <scope_text>{text to scan for keywords — title + description + requirements}</scope_text>
  <scope_guardrail>That's its own phase | Beyond this task's scope</scope_guardrail>
  <web_search_count>2-3 | 1-2</web_search_count>
  <tag_set>[tag IDs to apply to context page]</tag_set>
  <config_key>phase-01-context | task-AUTH-5-context</config_key>
  <parent_context_page_id>{phase context page ID, for task-level inheritance}</parent_context_page_id>
</discussion_scope>
```

---

<quick_discovery>

## Quick Discovery (Automated)

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK DISCOVERY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scanning codebase and researching best practices...
```

### Codebase Scan
Scan the project codebase for context relevant to this scope:
- Existing patterns and architecture (Glob + Grep key directories)
- Frameworks and libraries in use (package.json, requirements.txt, Gemfile, etc.)
- Existing components/modules related to the scope goal
- Code conventions and project structure

### Quick Web Research
Search for best practices related to the scope goal:
- "[scope goal keywords] best practices [current year]"
- "[detected framework] [scope goal] patterns"
- {web_search_count} targeted searches max (keep it quick)

### Present Discovery

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

### Frontend Detection

Use keyword list from `@~/.claude/get-shit-done/references/detection-constants.md` (## Frontend Keywords).

```
scope_text = discussion_scope.scope_text.toLowerCase()
is_frontend = frontend_keywords.some(kw => scope_text.includes(kw.toLowerCase()))

IF is_frontend:
  frontend_design_ref = Read("~/.claude/get-shit-done/references/frontend-design.md")
  Display: "Frontend work detected — UI-specific gray areas will be included."
```

</quick_discovery>

<gap_scan>

## Pre-Discussion Gap Scan

Cross-reference scope goal + requirements against discovery findings to identify gaps
BEFORE generating gray areas.

```
# What we know:
# - Scope goal (from entity description)
# - Requirements (from requirements page, if loaded by command)
# - Discovery findings (from quick_discovery)

# Cross-reference:
1. Enumerate what the scope goal implies must be decided
   - What behaviors need specifying?
   - What interfaces need defining?
   - What edge cases need handling?

2. Check which of these are already answered by:
   - Existing requirements
   - Discovery findings (best practices found)
   - Obvious defaults

3. Remaining items = gaps
   Classify each:
   - REQUIREMENT_GAP: Goal implies X but no requirement defines it
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

</gap_scan>

<gray_area_generation>

## Gray Area Generation

Discovery-informed analysis using discovery findings AND the scope goal.

Gray areas depend on what's being built. Analyze the scope goal:
- Something users SEE -> layout, density, interactions — informed by existing UI patterns
- Something users CALL -> responses, errors, auth — informed by existing API patterns
- Something users RUN -> output format, flags, modes — informed by existing CLI patterns
- Something users READ -> structure, tone, depth, flow
- Something being ORGANIZED -> criteria, grouping, naming, exceptions

Gray areas should reference discovery findings when relevant:
- "Your project uses {framework}, so the key decision is..."
- "You already have {pattern}, so the question is whether to extend it or..."

### Gap-Informed Priority

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
  gray_areas = generate_standard_gray_areas()
```

### Frontend Gray Areas

If `is_frontend` is true: additionally generate UI-specific gray areas from the
frontend-design reference (layout approach, interaction patterns, state visualization,
responsive behavior, component reuse). Present ASCII wireframe options for layout decisions.

### TDD Gray Area

Use keyword list from `@~/.claude/get-shit-done/references/detection-constants.md` (## TDD Keywords).

```
tdd_config = config.workflow?.tdd ?? "auto"
is_tdd_eligible = tdd_config == true OR
  (tdd_config !== false AND tdd_keywords.some(kw => scope_text.includes(kw.toLowerCase())))

IF is_tdd_eligible:
  # Add "Testing Approach" as an additional gray area
  # "This involves testable logic. Should we use Test-Driven Development
  #  (write tests first, then implement) for the core logic?"
  # Options: TDD for core logic / Standard (implement then test) / Mix (let planner decide)
```

### Always Include (task-level especially)

When the scope is a task (entity_type == "MTask"), always ensure these are covered
among the gray areas (merge into existing areas or add if not already present):
- **Edge Cases** — boundary conditions, empty states, error scenarios
- **Success Criteria** — what "done" looks like, how to verify it works

### Total: 3-4 scope-specific gray areas (capped at 4)

```
Display:

Based on {entity_label}: {entity_title}, I've identified areas where your input will shape implementation:

[A] {Gray Area 1} - {why this needs clarification}
[B] {Gray Area 2} - {why this needs clarification}
[C] {Gray Area 3} - {why this needs clarification}
[D] {Gray Area 4} - {why this needs clarification}

Which areas should we discuss? (Enter letters, e.g., "A, C" or "all")
```

Wait for response.

</gray_area_generation>

<deep_dive>

## Deep-Dive Question Loop

For each selected area:

```
Display:

-------------------------------------------
 Discussing: {Gray Area Name}
-------------------------------------------
```

**Ask 3-4 questions per area:**
- Questions should elicit specific, actionable decisions
- Not "what do you want?" but "how should this behave when X?"
- Focus on edge cases and concrete scenarios

After 3-4 questions:
```
"More questions about {area}, or move to next?"
```

If more -> Ask 3-4 more questions, check again
If next -> Proceed to next selected area

**Scope guardrail:**
- Scope boundary is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "{scope_guardrail}"
- Capture deferred ideas - don't lose them, don't act on them

**Do NOT ask about (Claude handles these):**
- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion

</deep_dive>

<post_discussion_gap_assessment>

## Post-Discussion Gap Assessment

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

</post_discussion_gap_assessment>

<context_page_creation>

## Create/Update Context Page in Mosic

After all selected areas discussed, confirm with user then build context.

**CRITICAL: Use canonical section names** — downstream agents parse these exact headings:
- `## Decisions` (locked choices — NON-NEGOTIABLE)
- `## Claude's Discretion` (flexible areas — top-level heading, NOT nested under Decisions)
- `## Deferred Ideas` (out of scope — FORBIDDEN for downstream agents)
- `## Discussion Gap Status` (gap tracking — researcher reads this to prioritize investigation)

**Build context content:**

```
context_content = build_context_markdown({
  entity_label: discussion_scope.entity_label,
  entity_title: discussion_scope.entity_title,
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
  # Create new context page linked to entity
  context_page = mosic_create_entity_page(entity_type, entity_id, {
    workspace_id: workspace_id,
    title: entity_label + " Context & Decisions",
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
mosic_batch_add_tags_to_document("M Page", context_page_id, discussion_scope.tag_set)
```

**Store in config:**

```
config.mosic.pages[discussion_scope.config_key] = context_page_id
```

</context_page_creation>
