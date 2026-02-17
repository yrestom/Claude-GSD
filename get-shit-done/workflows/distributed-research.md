<purpose>
Shared workflow for distributed (parallel) researcher spawning.

Extracts the parallel researcher orchestration logic from research-phase into a reusable workflow
that both research-phase and research-task can reference.

**Used by:** research-phase (Step 5 distributed path), research-task (new distributed path)
**Replaces:** Inline parallel spawn code in research-phase
</purpose>

<parallel_researcher_spawning>

## Spawn Parallel Researchers

**Command provides (scope-specific):**
- `mosic_references_base` — XML block with scope-specific page IDs
- `researcher_agent_path` — `~/.claude/agents/gsd-phase-researcher.md` or `~/.claude/agents/gsd-task-researcher.md`
- `researcher_model` — from config profile lookup
- `tdd_config` — TDD setting from config
- `scope_label` — "Phase 01" or "AUTH-5" (for display)
- `requirement_groups[]` — from `@decompose-requirements.md`

```
Display:
"""
-------------------------------------------
 GSD > RESEARCHING {scope_label} (DISTRIBUTED)
-------------------------------------------

{requirement_groups.length} researchers spawning in parallel...
"""

# Build and spawn ALL researchers in ONE response (parallel execution)
FOR each group in requirement_groups:

  # Build assigned requirements XML
  assigned_reqs_xml = "<assigned_requirements>\n"
  FOR each req_id in group.requirement_ids:
    assigned_reqs_xml += '<req id="' + req_id + '" />\n'
  assigned_reqs_xml += "</assigned_requirements>"

  group_prompt = """
""" + mosic_references_base + """

<research_config>
<tdd_config>{tdd_config}</tdd_config>
<mode>ecosystem</mode>
</research_config>

""" + assigned_reqs_xml + """

<decomposition_context>
<my_group>{group.number}</my_group>
<total_groups>{requirement_groups.length}</total_groups>
<group_title>{group.title}</group_title>
</decomposition_context>

<research_type>
Distributed Research — investigating HOW to implement the {group.title} requirements.
Focus on your assigned requirements only. Produce a ## Proposed Interfaces section listing
what your group Exposes (APIs, models, services) and what it Consumes from other groups.
</research_type>

<key_insight>
Focus on your {group.requirement_ids.length} assigned requirements.
Discover: architecture patterns, standard stack, common pitfalls, and don't-hand-roll items
relevant to this group's domain.
</key_insight>

<objective>
Research implementation approach for {scope_label}
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
    prompt="First, read " + researcher_agent_path + " for your role.\n\n" + group_prompt,
    subagent_type="general-purpose",
    model=researcher_model,
    description="Research Group " + group.number + ": " + group.title.substring(0, 20)
  )
```

</parallel_researcher_spawning>

<interface_collection>

## Collect Interface Contracts

After all researchers return, extract interface contracts for dependency ordering.

**Input:** `requirement_groups[]`, `researcher_results[]` (parallel Task returns)

```
all_interfaces = []

FOR each (group, researcher_output) in zip(requirement_groups, researcher_results):
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
```

**Output:** `all_interfaces[]` — array of `{ group_number, title, exposes, consumes }`

</interface_collection>

<dependency_ordering>

## Determine Dependency Order

Use interface contracts for topological sort, or fall back to tier heuristics.

**Input:** `all_interfaces[]`, `requirement_groups[]`

```
IF all_interfaces.length > 0:
  # Use interface-based ordering from @decompose-requirements.md
  dependency_order = topological_sort_by_interfaces(all_interfaces)
ELSE:
  # Fall back to tier-based heuristics from @decompose-requirements.md
  dependency_order = sort_by_tier(requirement_groups)
```

**Output:** `dependency_order[]` — groups sorted by execution priority.

</dependency_ordering>

<handle_research_returns>

## Handle Distributed Research Returns

Process researcher outputs: create Mosic pages, collect gaps, store decomposition.

**Command provides (scope-specific):**
- `entity_type` — "MTask List" or "MTask"
- `entity_id` — task_list_id or task_id
- `page_title_prefix` — "Phase 01" or "AUTH-5"
- `config_page_key_prefix` — "phase-01" or "task-AUTH-5"
- `workspace_id`, `tag_ids`

```
group_research_pages = []
aggregate_gaps_status = "CLEAR"

FOR each (group, researcher_output) in zip(requirement_groups, researcher_results):
  # Create group-specific research page
  research_page = mosic_create_entity_page(entity_type, entity_id, {
    workspace_id: workspace_id,
    title: page_title_prefix + " Research: " + group.title,
    page_type: "Document",
    icon: config.mosic.page_icons.research,
    status: "Published",
    content: convert_to_editorjs(researcher_output),
    relation_type: "Related"
  })

  # Tag research page
  mosic_batch_add_tags_to_document("M Page", research_page.name, [
    tag_ids.gsd_managed,
    tag_ids.research,
    tag_ids.scope_tag  # phase-NN or task-specific tag
  ])

  group.research_page_id = research_page.name
  group_research_pages.push({ group: group, page_id: research_page.name })

  # Store in config
  config.mosic.pages[config_page_key_prefix + "-research-group-" + group.number] = research_page.name

  # Track worst gap status across groups
  group_gaps = extract_field(researcher_output, "Gaps Status:")
  IF group_gaps == "BLOCKING": aggregate_gaps_status = "BLOCKING"
  ELIF group_gaps == "NON-BLOCKING" AND aggregate_gaps_status != "BLOCKING":
    aggregate_gaps_status = "NON-BLOCKING"

# Set primary research page to first group's page (backward compat)
config.mosic.pages[config_page_key_prefix + "-research"] = group_research_pages[0].page_id
```

**Output:** `group_research_pages[]`, `aggregate_gaps_status`, updated `config`

</handle_research_returns>

<store_decomposition_after_research>

## Store Decomposition with Interface Data

After research completes, store full decomposition (including interface contracts and dependency order) for plan command to reuse.

```
# Use @decompose-requirements.md <store_decomposition> pattern
config.mosic.session.decomposition = {
  phase: scope_identifier,  # phase number or task identifier
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

write config.json
```

For task-level distributed research, use `config.mosic.session.task_decomposition` instead.

</store_decomposition_after_research>
