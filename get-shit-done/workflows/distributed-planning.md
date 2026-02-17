<purpose>
Shared workflow for distributed (sequential) planner spawning with coverage verification.

Extracts the sequential planner orchestration, coverage verification, cross-group relations,
and distributed verification logic from plan-phase into a reusable workflow.

**Used by:** plan-phase (Steps 8-10 distributed path), plan-task (new distributed path)
**Replaces:** Inline sequential planner code in plan-phase
</purpose>

<sequential_planner_orchestration>

## Spawn Planners Sequentially in Dependency Order

**Command provides (scope-specific):**
- `build_mosic_refs(group)` — function returning scope-specific `<mosic_references>` XML
- `planner_model` — from config profile lookup
- `tdd_config` — TDD setting from config
- `scope_label` — "Phase 01" or "AUTH-5" (for display)
- `requirement_groups[]` — from `@decompose-requirements.md`
- `dependency_order[]` — from `@decompose-requirements.md` or `@distributed-research.md`
- `planning_mode` — "standard" | "gap_closure"
- `verification_page_id` — for gap closure mode (optional)

```
Display:
"""
-------------------------------------------
 GSD > PLANNING {scope_label} (DISTRIBUTED)
-------------------------------------------

{requirement_groups.length} groups, executing in dependency order:
{dependency_order.map(g => g.number + ". " + g.title).join("\n")}
"""

# Accumulate plan page IDs from completed planners
all_prior_plan_pages = []  # [{id, group_title, plan_title}]
all_plan_results = []

# SEQUENTIAL: One planner at a time, in dependency order
FOR each group in dependency_order:
  Display:
  """
  Planning Group {group.number}/{requirement_groups.length}: {group.title}
  Prior plans available: {all_prior_plan_pages.length}
  """

  # Build prior_plans XML from already-completed groups
  prior_plans_xml = ""
  IF all_prior_plan_pages.length > 0:
    prior_plans_xml = "<prior_plans>\n"
    FOR each pp in all_prior_plan_pages:
      prior_plans_xml += '<plan_page id="' + pp.id + '" group="' + pp.group_title + '" title="' + pp.plan_title + '" />\n'
    prior_plans_xml += "</prior_plans>"

  # Get group-specific research page if available
  group_research_page_id = decomposition?.groups?.find(
    g => g.number == group.number
  )?.research_page_id or default_research_page_id

  # Build scope-specific mosic_references via command's function
  mosic_refs = build_mosic_refs(group, group_research_page_id)

  planner_prompt = """
""" + mosic_refs + """

<planning_config>
<mode>""" + planning_mode + """</mode>
<tdd_config>""" + tdd_config + """</tdd_config>
</planning_config>

<assigned_requirements>
""" + group.requirement_ids.map(id => '<req id="' + id + '" />').join("\n") + """
</assigned_requirements>

<decomposition_context>
<my_group>{group.number}</my_group>
<total_groups>{requirement_groups.length}</total_groups>
</decomposition_context>

""" + prior_plans_xml + """

<downstream_consumer>
Output consumed by execute command.
Plans must include:
- MANY small tasks with subtasks (3-8 subtasks per task)
- Dependencies within group AND cross-group
- Wave assignments for parallel execution
- Verification criteria per subtask
- must_haves for goal-backward verification
IMPORTANT: Return plan page IDs and task IDs in ## PLANNING COMPLETE output.
</downstream_consumer>
"""

  # Spawn ONE planner, WAIT for it to complete
  result = Task(
    prompt="First, read ~/.claude/agents/gsd-planner.md for your role.\n\n" + planner_prompt,
    subagent_type="general-purpose",
    model=planner_model,
    description="Plan Group " + group.number + ": " + group.title.substring(0, 25)
  )

  # Collect plan page IDs from this planner's output
  IF result contains "## PLANNING COMPLETE":
    group_plan_pages = parse_plan_pages_table(result)
    # group_plan_pages = [{task_id, page_id, plan_title, subtask_count}]

    FOR each pp in group_plan_pages:
      all_prior_plan_pages.push({
        id: pp.page_id,
        group_title: group.title,
        plan_title: pp.plan_title
      })

    all_plan_results.push({ group, result, plan_pages: group_plan_pages })
  ELSE:
    Display: "Group {group.number} planning may be incomplete"
    all_plan_results.push({ group, result, plan_pages: [] })
```

**Output:** `all_plan_results[]`, `all_prior_plan_pages[]`

</sequential_planner_orchestration>

<coverage_verification>

## Verify Requirements Coverage Across Groups

After all planners complete, verify every requirement is covered.

**Input:** `all_plan_results[]`, `phase_requirements[]`

```
coverage_tracker = {}
plan_counter = 0

FOR each gr in all_plan_results:
  FOR each plan_page in gr.plan_pages:
    plan_counter += 1
    plan_number = printf("%02d", plan_counter)

    # Store in config (renumber sequentially across groups)
    config.mosic.tasks[config_key_prefix + "-plan-" + plan_number] = plan_page.task_id
    config.mosic.pages[config_key_prefix + "-plan-" + plan_number] = plan_page.page_id

    # Load plan page to extract coverage table
    content = mosic_get_page(plan_page.page_id, { content_format: "markdown" }).content
    covered_reqs = extract_coverage_table(content)
    FOR each req_id in covered_reqs:
      coverage_tracker[req_id] = plan_page.plan_title

# Verify complete coverage
IF phase_requirements AND phase_requirements.length > 0:
  missing = phase_requirements.filter(r => !coverage_tracker[r.id])
  IF missing.length > 0:
    Display: "Missing coverage for: " + missing.map(r => r.id).join(", ")
```

**Output:** `coverage_tracker{}`, `plan_counter`, updated `config`

</coverage_verification>

<cross_group_relations>

## Create Cross-Group Dependencies

Parse cross-group dependency tables from planner outputs and create M Relations.

**Input:** `all_plan_results[]`, `workspace_id`

```
FOR each gr in all_plan_results:
  cross_deps = extract_section(gr.result, "### Cross-Group Dependencies")
  IF cross_deps:
    FOR each row in parse_markdown_table(cross_deps):
      # row.depends_on format: "Group N, Plan MM" → resolve to task ID
      dep_group_num = extract_group_number(row.depends_on)
      dep_plan_title = extract_plan_title(row.depends_on)
      dep_result = all_plan_results.find(r => r.group.number == dep_group_num)
      IF dep_result:
        dep_plan = dep_result.plan_pages.find(pp => pp.plan_title contains dep_plan_title)
        IF dep_plan:
          source_plan = gr.plan_pages.find(pp => pp.plan_title contains row.my_plan)
          IF source_plan:
            mosic_create_document("M Relation", {
              workspace: workspace_id,
              source_doctype: "MTask",
              source_name: source_plan.task_id,
              target_doctype: "MTask",
              target_name: dep_plan.task_id,
              relation_type: "Depends"
            })
```

</cross_group_relations>

<distributed_verification>

## Distributed Plan Verification (Two Phases)

### Phase 1: Group-Scoped Verification (Parallel)

**Input:** `requirement_groups[]`, `all_plan_results[]`, `phase_requirements[]`, `requirements_content`

```
checker_prompts = []

FOR each group in requirement_groups:
  # Find this group's plan pages
  group_plan_pages = all_plan_results.find(gr => gr.group.number == group.number)?.plan_pages or []

  # Load only this group's plan content
  group_plans_content = ""
  FOR each pp in group_plan_pages:
    plan_content = mosic_get_page(pp.page_id, { content_format: "markdown" }).content
    group_plans_content += "\n\n---\n\n" + plan_content

  # Build group-scoped requirements XML
  group_reqs_xml = "<phase_requirements>\n"
  FOR each req_id in group.requirement_ids:
    req_desc = phase_requirements.find(r => r.id == req_id)?.description or ""
    group_reqs_xml += '<requirement id="' + req_id + '">' + req_desc + '</requirement>\n'
  group_reqs_xml += "</phase_requirements>"

  checker_prompt = """
<verification_context>

**Phase:** {scope_label}
**Phase Goal:** {scope_description}
**Verification Scope:** Group {group.number}: {group.title}

""" + group_reqs_xml + """

<assigned_requirements>
""" + group.requirement_ids.map(id => '<req id="' + id + '" />').join("\n") + """
</assigned_requirements>

**Plans to verify:**
{group_plans_content}

**Requirements (full page, if exists):**
{requirements_content}

</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED - all checks pass for this group
- ## ISSUES FOUND - structured issue list for this group
</expected_output>
"""
  checker_prompts.push({ prompt: checker_prompt, group })

# Spawn ALL group checkers in ONE response (parallel)
FOR each cp in checker_prompts:
  Task(
    prompt="First, read ~/.claude/agents/gsd-plan-checker.md for your role.\n\n" + cp.prompt,
    subagent_type="general-purpose",
    model=checker_model,
    description="Verify Group " + cp.group.number
  )
```

### Phase 2: Cross-Group Verification (Single, Lightweight)

Only runs if all group checks passed.

```
all_group_checks_passed = all checker results contain "## VERIFICATION PASSED"

IF all_group_checks_passed:
  # Build cross-group coverage matrix
  all_coverage_tables = ""
  FOR each gr in all_plan_results:
    FOR each pp in gr.plan_pages:
      content = mosic_get_page(pp.page_id, { content_format: "markdown" }).content
      coverage = extract_section(content, "## Requirements Coverage")
      all_coverage_tables += "\n### " + pp.plan_title + "\n" + coverage

  cross_checker_prompt = """
<verification_context>

**Scope:** {scope_label}
**Goal:** {scope_description}

<verification_mode>cross-group</verification_mode>

**All Coverage Tables:**
{all_coverage_tables}

**Decomposition:**
{requirement_groups.map(g => "Group " + g.number + ": " + g.title + " (" + g.requirement_ids.join(", ") + ")").join("\n")}

**Total requirements:** {phase_requirements.length}

</verification_context>

<expected_output>
Verify:
1. Every requirement is covered somewhere (global coverage matrix)
2. No conflicting double-coverage
3. Cross-group dependency graph is acyclic
Return ## VERIFICATION PASSED or ## ISSUES FOUND
</expected_output>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-plan-checker.md for your role.\n\n" + cross_checker_prompt,
    subagent_type="general-purpose",
    model=checker_model,
    description="Cross-Group Verification"
  )

ELSE:
  # Some group checks failed — display issues, enter revision loop
  Display: "Group verification found issues. Review required."
```

**Handle checker returns:**
- IF all checks passed (group + cross-group): Proceed to finalization
- IF issues found: Display issues, enter revision loop (iteration_count < 3)

</distributed_verification>
