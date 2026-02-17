<purpose>
Canonical extraction patterns for context data flowing through the GSD pipeline.

**Used by:** gsd-phase-researcher, gsd-task-researcher, gsd-planner, execute-plan.md
**Replaces:** Inline extraction code duplicated across 5+ files

Data flow:
```
discuss-phase/task WRITES context page → canonical headings
context-extraction.md DEFINES how to READ those headings
researcher/planner/executor READS using these patterns
```
</purpose>

<user_decision_extraction>

## Extract User Decisions

Parse from loaded context pages. Supports cascaded merge (task context overrides phase context).

**Input:** `task_context_content`, `phase_context_content` (from Mosic page loads), and optionally `research_content`, `task_research_content`

```
# Step 1: Check for <user_decisions> XML in prompt (legacy orchestrator — highest priority)
IF prompt contains <user_decisions>:
  locked_decisions = parse_xml(prompt, "locked_decisions")
  deferred_ideas = parse_xml(prompt, "deferred_ideas")
  discretion_areas = parse_xml(prompt, "discretion_areas")
  RETURN  # orchestrator already merged — use directly

# Step 2: Self-extract from context pages
locked_decisions = ""
deferred_ideas = ""
discretion_areas = ""

# Task-level context first (highest priority, task-mode only)
IF task_context_content:
  locked_decisions = extract_section(task_context_content, "## Decisions")
  deferred_ideas = extract_section(task_context_content, "## Deferred Ideas")
  discretion_areas = extract_section(task_context_content, "## Claude's Discretion")

# Phase-level context (merge with task-level)
IF phase_context_content:
  phase_locked = extract_section(phase_context_content, "## Decisions")
  IF phase_locked:
    locked_decisions = locked_decisions
      ? locked_decisions + "\n\n**Inherited from phase:**\n" + phase_locked
      : phase_locked
  IF not deferred_ideas:
    deferred_ideas = extract_section(phase_context_content, "## Deferred Ideas")
  IF not discretion_areas:
    discretion_areas = extract_section(phase_context_content, "## Claude's Discretion")

# Research pages (fallback if no context pages)
IF research_content AND not locked_decisions:
  user_constraints = extract_section(research_content, "## User Constraints")
  IF user_constraints:
    locked_decisions = extract_subsection(user_constraints, "### Locked Decisions")
    deferred_ideas = deferred_ideas or extract_subsection(user_constraints, "### Deferred Ideas")
    discretion_areas = discretion_areas or extract_subsection(user_constraints, "### Claude's Discretion")

# Task research fallback (task-mode only)
IF task_research_content AND not locked_decisions:
  task_constraints = extract_section(task_research_content, "## User Constraints")
  IF task_constraints:
    locked_decisions = extract_subsection(task_constraints, "### Locked Decisions")
    deferred_ideas = deferred_ideas or extract_subsection(task_constraints, "### Deferred Ideas")
    discretion_areas = discretion_areas or extract_subsection(task_constraints, "### Claude's Discretion")
```

**Output:** `locked_decisions`, `deferred_ideas`, `discretion_areas` — strings ready for downstream use.

</user_decision_extraction>

<requirements_extraction>

## Extract Phase Requirements

Parse requirements mapped to the current phase from the requirements page traceability table.

**Input:** `requirements_content` (from Mosic page load), `current_phase` (phase number or title)

```
phase_requirements = []

IF requirements_content:
  traceability_section = extract_section(requirements_content, "## Traceability")
  IF NOT traceability_section:
    traceability_section = extract_section(requirements_content, "## Requirements Traceability")

  IF traceability_section:
    FOR each row in parse_markdown_table(traceability_section):
      IF row.phase matches current_phase:
        phase_requirements.append({ id: row.req_id, description: row.description })

  # Fallback: phase overview Requirements section
  IF not phase_requirements AND phase_pages:
    phase_overview = phase_pages.find(p => p.title.includes("Overview"))
    IF phase_overview:
      overview_content = mosic_get_page(phase_overview.name, { content_format: "markdown" }).content
      requirements_section = extract_section(overview_content, "## Requirements")
      IF requirements_section:
        FOR each line matching "- {REQ-ID}: {description}" or "- **{REQ-ID}**: {description}":
          phase_requirements.append({ id: REQ-ID, description: description })

# Filter to assigned requirements (distributed mode)
IF prompt.includes("<assigned_requirements>"):
  assigned_ids = parse xml list of <req id="..."/> from <assigned_requirements>
  phase_requirements = phase_requirements.filter(req => assigned_ids.includes(req.id))
  distributed_mode = true
ELSE:
  distributed_mode = false
```

**For plan page coverage (execute-plan only):**
```
IF plan_content:
  coverage = extract_section(plan_content, "## Requirements Coverage")
  IF coverage:
    FOR each row in parse_markdown_table(coverage):
      phase_requirements.push({ id: row.req_id, description: row.description })
```

**Output:** `phase_requirements[]` — array of `{ id, description }` objects.

</requirements_extraction>

<frontend_detection>

## Detect Frontend Work

Keyword-based detection using canonical list from `@detection-constants.md`.

**Input:** Scope text (phase/task title + description + requirements)

```
# Load frontend keywords from @~/.claude/get-shit-done/references/detection-constants.md
frontend_keywords = FRONTEND_KEYWORDS  # defined in detection-constants.md

scope_text = (title + " " + (description or "") + " " + (requirements_content or "")).toLowerCase()
is_frontend = frontend_keywords.some(kw => scope_text.includes(kw.toLowerCase()))

IF is_frontend:
  frontend_design_content = Read("~/.claude/get-shit-done/references/frontend-design.md")
  # Extract role-specific section:
  # - Researchers: extract_section(frontend_design_content, "## For Researchers")
  # - Planners: extract_section(frontend_design_content, "## For Planners")
  # - Executors: extract_section(frontend_design_content, "## For Executors")
```

**Output:** `is_frontend` boolean + `frontend_design_context` string (role-appropriate section).

</frontend_detection>

<tdd_detection>

## Detect TDD Eligibility

Multi-signal detection following priority chain: user decision > config > keyword heuristic.

**Input:** `tdd_config` (from `<research_config>` or `<planning_config>`), context pages, scope text

### For Researchers (produces `include_tdd_research`)

```
tdd_config = config_xml.tdd_config  # "auto", true, or false

IF tdd_config !== false AND tdd_config !== "false":
  # Check context page for user TDD decision
  tdd_user_decision = extract_decision(context_content, "Testing Approach")
  # If task mode, also check task context (higher priority)
  IF task_context_content:
    tdd_user_decision = extract_decision(task_context_content, "Testing Approach") or tdd_user_decision

  # Load TDD keywords from @~/.claude/get-shit-done/references/detection-constants.md
  tdd_keywords = TDD_KEYWORDS  # defined in detection-constants.md
  is_tdd_eligible = tdd_keywords.some(kw => scope_text.includes(kw.toLowerCase()))

  # Resolve mode (priority: user decision > config setting > keyword heuristic)
  IF tdd_user_decision == "tdd": include_tdd_research = true
  ELIF tdd_user_decision == "standard": include_tdd_research = false
  ELIF tdd_config == true OR tdd_config == "true": include_tdd_research = true
  ELIF tdd_config == "auto" AND is_tdd_eligible: include_tdd_research = true
  ELSE: include_tdd_research = false
ELSE:
  include_tdd_research = false
```

### For Planners (produces `tdd_mode`)

```
tdd_config = planning_config.tdd_config  # "auto", true, or false

IF tdd_config !== false AND tdd_config !== "false":
  tdd_user_decision = extract_decision(context_content, "Testing Approach")
  IF task_context_content:
    tdd_user_decision = extract_decision(task_context_content, "Testing Approach") or tdd_user_decision

  # TDD_KEYWORDS loaded from @~/.claude/get-shit-done/references/detection-constants.md
  is_tdd_eligible = tdd_keywords.some(kw => scope_text.includes(kw.toLowerCase()))

  IF tdd_user_decision == "tdd": tdd_mode = "prefer"
  ELIF tdd_user_decision == "standard": tdd_mode = "disabled"
  ELIF tdd_user_decision == "planner_decides": tdd_mode = "auto"
  ELIF tdd_config == true OR tdd_config == "true": tdd_mode = "prefer"
  ELIF tdd_config == "auto" AND is_tdd_eligible: tdd_mode = "auto"
  ELSE: tdd_mode = "disabled"

  IF tdd_mode != "disabled":
    tdd_reference = Read("~/.claude/get-shit-done/references/tdd.md")
ELSE:
  tdd_mode = "disabled"
```

### For Executors (produces `has_tdd`)

```
has_tdd = false

# Check 1: Plan content for tdd="true" (phase-level plans)
IF plan_content AND plan_content.includes('tdd="true"'): has_tdd = true

# Check 2: Plan/subtask content for **Type:** tdd (task-level subtasks)
IF plan_content AND plan_content.includes('**Type:** tdd'): has_tdd = true

# Check 3: Task tags include "tdd" (set by planner)
IF task.tags AND task.tags.includes("tdd"): has_tdd = true

# Check 4: Config fallback — only explicit true forces TDD without markers
IF not has_tdd:
  tdd_config = Read("config.json").workflow?.tdd
  IF tdd_config === true OR tdd_config === "true": has_tdd = true

IF has_tdd:
  tdd_reference = Read("~/.claude/get-shit-done/references/tdd.md")
  tdd_execution_context = extract_sections(tdd_reference, [
    "<execution_flow>", "<test_quality>", "<commit_patterns>", "<mosic_test_tracking>"
  ])
```

**Output:**
- Researchers: `include_tdd_research` boolean
- Planners: `tdd_mode` string ("prefer" | "auto" | "disabled")
- Executors: `has_tdd` boolean + `tdd_execution_context` string

</tdd_detection>

<discussion_gap_extraction>

## Extract Discussion Gap Status

Parse gap status from context pages for research gap analysis.

**Input:** `task_context_content`, `phase_context_content`

```
IF prompt contains <discussion_gaps>:
  # Legacy orchestrator already extracted — use directly
  discussion_gaps = parse_xml(prompt, "discussion_gaps")

ELSE:
  # Self-extract from context pages (task first, then phase)
  gap_status_section = ""
  IF task_context_content:
    gap_status_section = extract_section(task_context_content, "## Discussion Gap Status")
  IF not gap_status_section AND phase_context_content:
    gap_status_section = extract_section(phase_context_content, "## Discussion Gap Status")

  # Process as INPUT to gap analysis (not conclusions)
  # Remaining gaps → priority investigation items
  # Resolved gaps → validate technical soundness
```

**Output:** `gap_status_section` string or structured `discussion_gaps` object.

</discussion_gap_extraction>
