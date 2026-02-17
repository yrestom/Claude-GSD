---
name: gsd:research-phase
description: Research how to implement a phase (Mosic-native, standalone)
argument-hint: "[phase]"
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

<execution_context>
@~/.claude/get-shit-done/workflows/context-extraction.md
@~/.claude/get-shit-done/workflows/decompose-requirements.md
@~/.claude/get-shit-done/workflows/distributed-research.md
</execution_context>

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

## 4. Discover Phase Page IDs

```
# Find context page ID (if exists from discuss-phase)
context_page = phase_pages.find(p => p.title contains "Context")
context_page_id = context_page ? context_page.name : null

# Get requirements page ID
requirements_page_id = config.mosic.pages.requirements or null

# Get roadmap page ID
roadmap_page_id = config.mosic.pages.roadmap or null
```

Display:
```
Context loaded:
- Phase goal: {phase.description}
- Context page: {context_page_id ? "Found" : "None"}
- Requirements page: {requirements_page_id ? "Found" : "None"}

Proceeding to research...
```

## 4.5. Decompose Phase for Distributed Research

Follow `@~/.claude/get-shit-done/workflows/decompose-requirements.md`:

```
IF requirements_page_id AND (config.workflow?.distributed?.enabled !== false):
  # 1. Extract phase requirements using @context-extraction.md <requirements_extraction>
  requirements_content = mosic_get_page(requirements_page_id, {
    content_format: "markdown"
  }).content
  phase_requirements = extract_phase_requirements(requirements_content, PHASE)

  # 2. Decompose using @decompose-requirements.md <decompose>
  result = decompose(phase_requirements, config)
  use_distributed = result.use_distributed
  requirement_groups = result.requirement_groups

  IF use_distributed:
    Display:
    """
    Distributed research: {phase_requirements.length} requirements in {requirement_groups.length} groups
    {requirement_groups.map(g => "  " + g.number + ". " + g.title + " (" + g.requirement_ids.length + " reqs)").join("\n")}
    """
ELSE:
  use_distributed = false
  requirement_groups = []
```

## 5. Spawn gsd-phase-researcher Agent(s)

```
IF use_distributed:
  # Follow @~/.claude/get-shit-done/workflows/distributed-research.md <parallel_researcher_spawning>
  # Command provides:
  mosic_references_base = """
<mosic_references>
<phase id="{task_list_id}" title="{phase.title}" number="{PHASE}" />
<workspace id="{workspace_id}" />
<project id="{project_id}" />
<context_page id="{context_page_id}" />
<requirements_page id="{requirements_page_id}" />
<roadmap_page id="{roadmap_page_id}" />
</mosic_references>
"""
  researcher_agent_path = "~/.claude/agents/gsd-phase-researcher.md"
  tdd_config = config.workflow?.tdd ?? "auto"
  scope_label = "Phase " + PHASE

  # Spawn parallel researchers per @distributed-research.md
  # All Task() calls in ONE response for parallel execution

ELSE:
  # --- SINGLE RESEARCHER (existing behavior, unchanged) ---

  Display:
  """
  -------------------------------------------
   GSD > RESEARCHING PHASE {PHASE}
  -------------------------------------------

  Spawning researcher...
  """

  Research modes: ecosystem (default), feasibility, implementation, comparison.

  single_prompt = """
<mosic_references>
<phase id="{task_list_id}" title="{phase.title}" number="{PHASE}" />
<workspace id="{workspace_id}" />
<project id="{project_id}" />
<context_page id="{context_page_id}" />
<requirements_page id="{requirements_page_id}" />
<roadmap_page id="{roadmap_page_id}" />
</mosic_references>

<research_config>
<tdd_config>{config.workflow?.tdd ?? "auto"}</tdd_config>
<mode>ecosystem</mode>
</research_config>

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

<objective>
Research implementation approach for Phase {PHASE}: {phase.title}
Mode: ecosystem
</objective>

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

<output>
Create the research page directly in Mosic using mosic_create_entity_page. Return the created page ID and a brief summary of findings. The orchestrator will validate the page was created successfully.
</output>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role.\n\n" + single_prompt,
    subagent_type="general-purpose",
    model="{researcher_model}",
    description="Research Phase {PHASE}"
  )
```

## 6. Handle Agent Return and Validate Research Page(s)

```
IF use_distributed:
  # Follow @~/.claude/get-shit-done/workflows/distributed-research.md:
  # 1. <handle_research_returns> — validate Mosic pages, collect gaps
  #    entity_type="MTask List", entity_id=task_list_id
  #    page_title_prefix="Phase " + PHASE
  #    config_page_key_prefix="phase-" + PHASE
  #
  # 2. <interface_collection> — extract Proposed Interfaces from each researcher output
  #
  # 3. <dependency_ordering> — topological sort or tier heuristic fallback
  #
  # 4. <store_decomposition_after_research> — store in config.mosic.session.decomposition
  #
  # Output: group_research_pages[], aggregate_gaps_status, dependency_order[]
  gaps_status = aggregate_gaps_status

ELSE:
  # --- SINGLE RESEARCHER (existing behavior) ---
  gaps_status = "CLEAR"

  IF researcher_output contains "## RESEARCH COMPLETE":
    # Extract page ID from agent output
    research_page_id = extract_field(researcher_output, "Research Page ID:") or
                       extract_page_id_from_url(researcher_output)

    # Validate the agent created the research page in Mosic
    IF research_page_id:
      # Verify page exists and has content
      validated_page = mosic_get_page(research_page_id, { content_format: "plain" })
      IF NOT validated_page OR NOT validated_page.content:
        ERROR: "Agent reported page ID {research_page_id} but page not found or empty in Mosic"
    ELSE:
      # Fallback: check entity pages for newly created research page
      phase_pages_updated = mosic_get_entity_pages("MTask List", task_list_id, {
        include_subtree: false
      })
      research_page_found = phase_pages_updated.find(p => p.title contains "Research")
      IF research_page_found:
        research_page_id = research_page_found.name
      ELSE:
        ERROR: "Agent did not create research page. Check agent output."

    config.mosic.pages["phase-" + PHASE + "-research"] = research_page_id
    gaps_status = extract_field(researcher_output, "Gaps Status:") or "CLEAR"

    Display:
    """
    Research validated in Mosic
    Page: https://mosic.pro/app/page/{research_page_id}
    """
```

**Update config:**

```
config.mosic.session.last_action = "research-phase"
config.mosic.session.last_updated = "[ISO timestamp]"

write config.json
```

### Handle Gap Status

```
IF gaps_status == "BLOCKING":
  blocking_gaps = use_distributed
    ? "Multiple groups reported blocking gaps. Check individual research pages."
    : extract_section(researcher_output, "### Blocking Gaps")

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
    """
    EXIT

  IF user_selection == "View research":
    IF use_distributed:
      FOR each grp in group_research_pages:
        Display: "### Group " + grp.group.number + ": " + grp.group.title
        research_full = mosic_get_page(grp.page_id, { content_format: "markdown" })
        Display: research_full.content
    ELSE:
      research_full = mosic_get_page(research_page_id, { content_format: "markdown" })
      Display: research_full.content
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

IF use_distributed:
  Mode: Distributed ({requirement_groups.length} groups)
  Dependency order: {dependency_order.map(g => g.title).join(" → ")}
  Research pages:
  {group_research_pages.map(grp =>
    "  - Group " + grp.group.number + ": https://mosic.pro/app/page/" + grp.page_id
  ).join("\n")}
ELSE:
  Research: https://mosic.pro/app/page/{research_page_id}

Key findings:
- {summary_point_1}
- {summary_point_2}
- {summary_point_3}

Gap Status: {gaps_status or "Not assessed"}
{IF gaps_status == "NON-BLOCKING": "Non-blocking gaps documented — planner will use defaults."}
{IF gaps_status == "BLOCKING": "Blocking gaps overridden — planner will use best judgment."}

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
- [ ] Distributed threshold evaluated (phase requirements count vs config threshold)
- [ ] If distributed: requirements grouped by category prefix, researchers spawned in parallel
- [ ] If distributed: interface contracts collected, dependency order computed (topological sort)
- [ ] If distributed: decomposition stored in config.mosic.session.decomposition
- [ ] If single: gsd-phase-researcher spawned with full context
- [ ] Checkpoints handled correctly
- [ ] Research page(s) validated in Mosic (created by agent, verified by orchestrator)
- [ ] Tags applied by agent (gsd-managed, research, phase-NN)
- [ ] config.json updated with page mapping(s)
- [ ] User knows next steps with Mosic URLs
</success_criteria>
