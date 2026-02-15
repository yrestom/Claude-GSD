---
name: gsd:research-phase
description: Research how to implement a phase (Mosic-native, standalone)
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Research how to implement a phase. Spawns gsd-phase-researcher agent with phase context from Mosic.

**Note:** This is a standalone research command. For most workflows, use `/gsd:plan-phase` which integrates research automatically.

**Use this command when:**
- You want to research without planning yet
- You want to re-research after planning is complete
- You need to investigate before deciding if a phase is feasible

**Architecture:** All context loaded from Mosic. Research output becomes M Page linked to phase task list. config.json stores entity IDs only.
</objective>

<context>
Phase number: $ARGUMENTS (required)
</context>

<process>

## 0. Load Config and Resolve Model Profile

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
| gsd-phase-researcher | opus | sonnet | haiku |
```

## 1. Normalize and Validate Phase

```
# Normalize phase number
IF ARGUMENTS is integer: PHASE = printf("%02d", ARGUMENTS)
ELIF ARGUMENTS has decimal: PHASE = printf("%02d.%s", integer_part, decimal_part)
ELSE: PHASE = ARGUMENTS
```

## 2. Load Phase from Mosic

```
phase_key = "phase-" + PHASE
task_list_id = config.mosic.task_lists[phase_key]

IF not task_list_id:
  ERROR: Phase {PHASE} not found in config. Available phases: {list keys}

# Load phase details
phase = mosic_get_task_list(task_list_id, {
  include_tasks: false
})

# Load phase pages
phase_pages = mosic_get_entity_pages("MTask List", task_list_id, {
  include_subtree: false
})

# Check for existing research page
existing_research_page = phase_pages.find(p => p.title contains "Research")
```

Display:
```
Phase {PHASE}: {phase.title}
Research: {existing_research_page ? "Found" : "None"}
```

## 3. Check Existing Research

```
IF existing_research_page:
  research_content = mosic_get_page(existing_research_page.name, {
    content_format: "markdown"
  })

  Display summary of existing research

  Offer:
  1) Update research (re-research with fresh data)
  2) View full research
  3) Skip (proceed to planning)

  Wait for response.

  IF view: Display full content, return to menu
  IF skip: Exit with next steps
```

## 4. Gather Phase Context from Mosic

```
# Load context page if exists
context_page = phase_pages.find(p => p.title contains "Context")
context_content = ""
IF context_page:
  context_content = mosic_get_page(context_page.name, {
    content_format: "markdown"
  }).content

# Load requirements
requirements_content = ""
IF config.mosic.pages.requirements:
  requirements_content = mosic_get_page(config.mosic.pages.requirements, {
    content_format: "markdown"
  }).content

# Load roadmap for phase description
roadmap_content = ""
IF config.mosic.pages.roadmap:
  roadmap_content = mosic_get_page(config.mosic.pages.roadmap, {
    content_format: "markdown"
  }).content
```

Display:
```
Context loaded:
- Phase goal: {phase.description}
- Context decisions: {context_page ? "Yes" : "None"}
- Requirements: {requirements_content ? "Yes" : "None"}

Proceeding to research...
```

## 5. Extract Decisions and Spawn gsd-phase-researcher Agent

Display:
```
-------------------------------------------
 GSD > RESEARCHING PHASE {PHASE}
-------------------------------------------

Spawning researcher...
```

**Extract user decisions from context page (if exists):**
```
locked_decisions = ""
deferred_ideas = ""
discretion_areas = ""

IF context_content:
  locked_decisions = extract_section(context_content, "## Decisions")
  IF not locked_decisions:
    locked_decisions = extract_section(context_content, "## Implementation Decisions")
  deferred_ideas = extract_section(context_content, "## Deferred Ideas")
  discretion_areas = extract_section(context_content, "## Claude's Discretion")

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

# Extract discussion gap status from context page (if exists)
discussion_gaps_xml = ""
IF context_content:
  gap_status_section = extract_section(context_content, "## Discussion Gap Status")
  IF gap_status_section:
    discussion_gaps_xml = """
<discussion_gaps>
""" + gap_status_section + """
</discussion_gaps>
"""
    Display: "Discussion gaps found — researcher will prioritize investigating these."

# Frontend detection
frontend_keywords = ["UI", "frontend", "component", "page", "screen", "layout",
  "design", "form", "button", "modal", "dialog", "sidebar", "navbar", "dashboard",
  "responsive", "styling", "CSS", "Tailwind", "React", "Vue", "template", "view",
  "UX", "interface", "widget"]

phase_text = (phase.title + " " + (phase.description or "") + " " + requirements_content).toLowerCase()
is_frontend = frontend_keywords.some(kw => phase_text.includes(kw.toLowerCase()))

frontend_design_xml = ""
IF is_frontend:
  frontend_design_content = Read("~/.claude/get-shit-done/references/frontend-design.md")
  # Extract "For Researchers" section
  frontend_design_xml = extract_section(frontend_design_content, "## For Researchers")
  Display: "Frontend work detected — design system inventory will be included in research."

# TDD detection for research
tdd_config = config.workflow?.tdd ?? "auto"
tdd_research_xml = ""

IF tdd_config !== false:
  tdd_keywords = ["API", "endpoint", "validation", "parser", "transform", "algorithm",
    "state machine", "workflow engine", "utility", "helper", "business logic",
    "data model", "schema", "converter", "calculator", "formatter", "serializer",
    "authentication", "authorization"]

  is_tdd_eligible = tdd_keywords.some(kw => phase_text.includes(kw.toLowerCase()))

  # Check context page for user TDD decision
  tdd_user_decision = extract_decision(context_content, "Testing Approach")

  IF tdd_user_decision == "standard":
    # User explicitly chose standard testing — skip TDD research
    tdd_research_xml = ""
  ELIF tdd_user_decision == "tdd" OR tdd_config == true OR (tdd_config == "auto" AND is_tdd_eligible):
    tdd_research_xml = """
<tdd_research_context>
This phase may use TDD. Research should include:
- Identify existing test framework and configuration in the project
- Recommend test patterns specific to this domain (unit, integration, contract)
- Find examples of test-first patterns for the core logic
- Note any testing gotchas or infrastructure gaps
Include a "## Testing Approach" section in research output.
</tdd_research_context>
"""
    Display: "TDD-eligible phase — researcher will include testing approach."

Research modes: ecosystem (default), feasibility, implementation, comparison.

```markdown
<research_type>
Phase Research - investigating HOW to implement a specific phase well.
</research_type>

<key_insight>
The question is NOT "which library should I use?"

The question is: "What do I not know that I don't know?"

For this phase, discover:
- What's the established architecture pattern?
- What libraries form the standard stack?
- What problems do people commonly hit?
- What's SOTA vs what Claude's training thinks is SOTA?
- What should NOT be hand-rolled?
</key_insight>

""" + user_decisions_xml + """

<objective>
Research implementation approach for Phase {PHASE}: {phase.title}
Mode: ecosystem
</objective>

<context>
**Phase goal:**
{phase.description}

**Requirements:**
{requirements_content}

**Context decisions:**
{context_content}
</context>

""" + discussion_gaps_xml + """

<downstream_consumer>
Your research will be loaded by `/gsd:plan-phase` which uses specific sections:
- `## Standard Stack` -> Plans use these libraries
- `## Architecture Patterns` -> Task structure follows these
- `## Don't Hand-Roll` -> Tasks NEVER build custom solutions for listed problems
- `## Common Pitfalls` -> Verification steps check for these
- `## Code Examples` -> Task actions reference these patterns

Be prescriptive, not exploratory. "Use X" not "Consider X or Y."
</downstream_consumer>

<quality_gate>
Before declaring complete, verify:
- [ ] All domains investigated (not just some)
- [ ] Negative claims verified with official docs
- [ ] Multiple sources for critical claims
- [ ] Confidence levels assigned honestly
- [ ] Section names match what plan-phase expects
</quality_gate>

<frontend_design_context>
""" + frontend_design_xml + """
</frontend_design_context>

""" + tdd_research_xml + """

<output>
Return research findings as structured markdown. The orchestrator will create the Mosic page.
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {PHASE}"
)
```

## 6. Handle Agent Return and Create Research Page

**If `## RESEARCH COMPLETE`:**

```
# Create or update research page in Mosic
IF existing_research_page:
  mosic_update_document("M Page", existing_research_page.name, {
    content: convert_to_editorjs(research_findings),
    status: "Published"
  })
  research_page_id = existing_research_page.name
ELSE:
  research_page = mosic_create_entity_page("MTask List", task_list_id, {
    workspace_id: workspace_id,
    title: "Phase " + PHASE + " Research",
    page_type: "Document",
    icon: config.mosic.page_icons.research,
    status: "Published",
    content: convert_to_editorjs(research_findings),
    relation_type: "Related"
  })
  research_page_id = research_page.name
```

**Tag research page:**

```
mosic_batch_add_tags_to_document("M Page", research_page_id, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.research,
  config.mosic.tags.phase_tags[phase_key]
])
```

**Update config:**

```
config.mosic.pages["phase-" + PHASE + "-research"] = research_page_id
config.mosic.session.last_action = "research-phase"
config.mosic.session.last_updated = "[ISO timestamp]"

write config.json
```

Display:
```
Research synced to Mosic
Page: https://mosic.pro/app/page/{research_page_id}
```

### Handle Gap Status

```
# Parse gaps_status from researcher return
gaps_status = extract_field(researcher_output, "Gaps Status:")

IF gaps_status == "BLOCKING":
  blocking_gaps = extract_section(researcher_output, "### Blocking Gaps")

  Display:
  """
  -------------------------------------------
   ⚠ BLOCKING GAPS DETECTED
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
        { label: "Resolve gaps", description: "Run /gsd:discuss-phase to make decisions, then re-research" },
        { label: "Proceed anyway", description: "Continue to planning — planner will use best judgment" },
        { label: "View research", description: "View the full research page first" }
      ],
      multiSelect: false
    }]
  })

  IF user_selection == "Resolve gaps":
    Display:
    """
    To resolve these gaps:
    1. `/gsd:discuss-phase {PHASE}` — make decisions on the blocking gaps
    2. `/gsd:research-phase {PHASE}` — re-research with updated context

    Research page saved: https://mosic.pro/app/page/{research_page_id}
    """
    EXIT

  IF user_selection == "View research":
    research_full = mosic_get_page(research_page_id, { content_format: "markdown" })
    Display: research_full.content
    # Return to gap handling menu
    GOTO "Handle Gap Status"
```

**If `## CHECKPOINT REACHED`:**
- Present checkpoint to user
- Get response
- Spawn continuation agent with checkpoint context

**If `## RESEARCH INCONCLUSIVE`:**
- Show what was attempted
- Offer: Add context, Try different mode, Manual investigation
- Wait for response

## 7. Spawn Continuation Agent (if needed)

```markdown
<objective>
Continue research for Phase {PHASE}: {phase.title}
</objective>

<prior_state>
Research page: https://mosic.pro/app/page/{research_page_id}
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role.\n\n" + continuation_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Continue research Phase {PHASE}"
)
```

## 8. Offer Next Steps

```
-------------------------------------------
 GSD > RESEARCH COMPLETE
-------------------------------------------

**Phase {PHASE}: {phase.title}**

Research: https://mosic.pro/app/page/{research_page_id}

Key findings:
- {summary_point_1}
- {summary_point_2}
- {summary_point_3}

Gap Status: {gaps_status or "Not assessed"}
{IF gaps_status == "NON-BLOCKING": "Non-blocking gaps documented — planner will use defaults."}
{IF gaps_status == "BLOCKING": "⚠ Blocking gaps overridden — planner will use best judgment."}

---

## Next Up

**Plan Phase {PHASE}** - create execution plans based on research

`/gsd:plan-phase {PHASE}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- View research in Mosic
- `/gsd:research-phase {PHASE}` - dig deeper
- `/gsd:discuss-phase {PHASE}` - gather more context first

---
```

</process>

<error_handling>
```
IF mosic operation fails:
  Display: "Mosic sync failed: {error}"

  # Display content directly (no local file backup)
  Display: "---"
  Display: "Research content that failed to sync:"
  Display: "---"
  Display: {research_findings}
  Display: "---"

  Display: "To retry: /gsd:research-phase {PHASE}"
  Display: "The content above can be manually copied to Mosic if needed."
```
</error_handling>

<success_criteria>
- [ ] Phase loaded from Mosic
- [ ] Existing research checked
- [ ] Context loaded from Mosic (context page, requirements)
- [ ] gsd-phase-researcher spawned with full context
- [ ] Checkpoints handled correctly
- [ ] Research page created/updated in Mosic linked to phase
- [ ] Tags applied (gsd-managed, research, phase-NN)
- [ ] config.json updated with page mapping
- [ ] User knows next steps with Mosic URLs
</success_criteria>
