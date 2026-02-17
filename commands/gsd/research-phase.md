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

```
distributed_config = config.workflow?.distributed ?? {}
threshold = distributed_config.threshold ?? 6
use_distributed = false
requirement_groups = []

IF requirements_page_id AND distributed_config.enabled !== false:
  requirements_content = mosic_get_page(requirements_page_id, {
    content_format: "markdown"
  }).content

  # Extract phase-specific requirements from traceability table
  phase_requirements = []
  traceability_section = extract_section(requirements_content, "## Traceability")
  IF NOT traceability_section:
    traceability_section = extract_section(requirements_content, "## Requirements Traceability")
  IF traceability_section:
    FOR each row in parse_markdown_table(traceability_section):
      IF row.phase matches current phase (PHASE or phase.title):
        phase_requirements.append({ id: row.req_id, description: row.description })

  use_distributed = phase_requirements.length >= threshold

  IF use_distributed:
    # Group by category prefix: AUTH-*, UI-*, CONT-*, etc.
    groups_by_prefix = {}
    FOR each req in phase_requirements:
      prefix = req.id.match(/^([A-Z]+)/)?.[1] or "MISC"
      groups_by_prefix[prefix] = groups_by_prefix[prefix] or []
      groups_by_prefix[prefix].push(req)

    # Merge small groups (< min_per_group) into nearest group
    min_per_group = distributed_config.min_requirements_per_group ?? 2
    max_per_group = distributed_config.max_requirements_per_group ?? 5
    max_groups = distributed_config.max_groups ?? 8

    requirement_groups = merge_and_split_groups(groups_by_prefix, {
      min_per_group, max_per_group, max_groups
    })
    # Each group: { number: N, title: "Authentication (AUTH)", prefix: "AUTH",
    #   requirement_ids: ["AUTH-01", "AUTH-02"], requirements: [...] }

    Display:
    """
    Distributed research: {phase_requirements.length} requirements in {requirement_groups.length} groups
    {requirement_groups.map(g => "  " + g.number + ". " + g.title + " (" + g.requirement_ids.length + " reqs)").join("\n")}
    """
```

## 5. Spawn gsd-phase-researcher Agent(s)

```
IF use_distributed:
  Display:
  """
  -------------------------------------------
   GSD > RESEARCHING PHASE {PHASE} (DISTRIBUTED)
  -------------------------------------------

  {requirement_groups.length} researchers spawning in parallel...
  """

  # Create group-specific research page placeholders (so we have IDs for config)
  # Then spawn ALL researchers in ONE response (parallel)

  FOR each group in requirement_groups:
    assigned_reqs_xml = "<assigned_requirements>\n"
    FOR each req_id in group.requirement_ids:
      assigned_reqs_xml += '<req id="' + req_id + '" />\n'
    assigned_reqs_xml += "</assigned_requirements>"

    group_prompt = """
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

""" + assigned_reqs_xml + """

<decomposition_context>
<my_group>{group.number}</my_group>
<total_groups>{requirement_groups.length}</total_groups>
<group_title>{group.title}</group_title>
</decomposition_context>

<research_type>
Distributed Phase Research — investigating HOW to implement the {group.title} requirements.
Focus on your assigned requirements only. Produce a ## Proposed Interfaces section listing
what your group Exposes (APIs, models, services) and what it Consumes from other groups.
</research_type>

<key_insight>
Focus on your {group.requirement_ids.length} assigned requirements.
Discover: architecture patterns, standard stack, common pitfalls, and don't-hand-roll items
relevant to this group's domain.
</key_insight>

<objective>
Research implementation approach for Phase {PHASE}: {phase.title}
Group {group.number}: {group.title}
Requirements: {group.requirement_ids.join(", ")}
</objective>

<downstream_consumer>
Your research will be loaded by a group-specific planner agent.
CRITICAL: Include a ## Proposed Interfaces section with Exposes and Consumes lists.
The orchestrator collects these to determine dependency order between groups.
</downstream_consumer>

<output>
Return research findings as structured markdown. The orchestrator will create the Mosic page.
</output>
"""

    # Spawn ALL in one response (parallel execution)
    Task(
      prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role.\n\n" + group_prompt,
      subagent_type="general-purpose",
      model="{researcher_model}",
      description="Research Group " + group.number + ": " + group.title.substring(0, 20)
    )

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
Return research findings as structured markdown. The orchestrator will create the Mosic page.
</output>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role.\n\n" + single_prompt,
    subagent_type="general-purpose",
    model="{researcher_model}",
    description="Research Phase {PHASE}"
  )
```

## 6. Handle Agent Return and Create Research Page(s)

```
IF use_distributed:
  # --- DISTRIBUTED: Handle multiple researcher returns ---

  group_research_pages = []
  all_interfaces = []
  aggregate_gaps_status = "CLEAR"

  FOR each (group, researcher_output) in zip(requirement_groups, researcher_results):
    # Create group-specific research page
    research_page = mosic_create_entity_page("MTask List", task_list_id, {
      workspace_id: workspace_id,
      title: "Phase " + PHASE + " Research: " + group.title,
      page_type: "Document",
      icon: config.mosic.page_icons.research,
      status: "Published",
      content: convert_to_editorjs(researcher_output),
      relation_type: "Related"
    })

    # Tag research page
    mosic_batch_add_tags_to_document("M Page", research_page.name, [
      config.mosic.tags.gsd_managed,
      config.mosic.tags.research,
      config.mosic.tags.phase_tags[phase_key]
    ])

    group.research_page_id = research_page.name
    group_research_pages.push({ group: group, page_id: research_page.name })

    # Store in config
    config.mosic.pages["phase-" + PHASE + "-research-group-" + group.number] = research_page.name

    # Extract ## Proposed Interfaces from researcher output
    interfaces_section = extract_section(researcher_output, "## Proposed Interfaces")
    IF interfaces_section:
      exposes = extract_subsection(interfaces_section, "### Exposes")
      consumes = extract_subsection(interfaces_section, "### Consumes")
      all_interfaces.push({
        group_number: group.number,
        title: group.title,
        exposes: exposes or "",
        consumes: consumes or ""
      })

    # Track worst gap status across groups
    group_gaps = extract_field(researcher_output, "Gaps Status:")
    IF group_gaps == "BLOCKING": aggregate_gaps_status = "BLOCKING"
    ELIF group_gaps == "NON-BLOCKING" AND aggregate_gaps_status != "BLOCKING":
      aggregate_gaps_status = "NON-BLOCKING"

  # Determine dependency order from interfaces (Consumes → Exposes matching)
  # Groups whose Consumes is empty or "None" → foundational → go first
  # Groups that consume from foundational → go second
  # If circular: break tie by group number
  dependency_order = topological_sort_by_interfaces(all_interfaces)

  # Store decomposition in config for plan-phase to reuse
  config.mosic.session.decomposition = {
    phase: PHASE,
    groups: requirement_groups.map(g => ({
      number: g.number,
      title: g.title,
      prefix: g.prefix,
      requirement_ids: g.requirement_ids,
      research_page_id: g.research_page_id
    })),
    interface_contracts: all_interfaces,
    dependency_order: dependency_order
  }

  # Set primary research page to first group's page (for backward compat)
  config.mosic.pages["phase-" + PHASE + "-research"] = group_research_pages[0].page_id
  gaps_status = aggregate_gaps_status

  Display:
  """
  Distributed research complete: {requirement_groups.length} groups
  Dependency order: {dependency_order.map(g => g.title).join(" → ")}
  Research pages synced to Mosic
  """

ELSE:
  # --- SINGLE RESEARCHER (existing behavior) ---
  gaps_status = "CLEAR"

  IF researcher_output contains "## RESEARCH COMPLETE":
    # Create or update research page in Mosic
    IF existing_research_page:
      mosic_update_document("M Page", existing_research_page.name, {
        content: convert_to_editorjs(researcher_output),
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
        content: convert_to_editorjs(researcher_output),
        relation_type: "Related"
      })
      research_page_id = research_page.name

    # Tag research page
    mosic_batch_add_tags_to_document("M Page", research_page_id, [
      config.mosic.tags.gsd_managed,
      config.mosic.tags.research,
      config.mosic.tags.phase_tags[phase_key]
    ])

    config.mosic.pages["phase-" + PHASE + "-research"] = research_page_id
    gaps_status = extract_field(researcher_output, "Gaps Status:") or "CLEAR"

    Display:
    """
    Research synced to Mosic
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
- [ ] Research page(s) created/updated in Mosic linked to phase
- [ ] Tags applied (gsd-managed, research, phase-NN)
- [ ] config.json updated with page mapping(s)
- [ ] User knows next steps with Mosic URLs
</success_criteria>
