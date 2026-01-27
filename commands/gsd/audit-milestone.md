---
name: gsd:audit-milestone
description: Audit milestone completion against original intent before archiving
argument-hint: "[version]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Task
  - Write
  - mcp__mosic_pro__*
---

<objective>
Verify milestone achieved its definition of done. Check requirements coverage, cross-phase integration, and end-to-end flows.

**This command IS the orchestrator.** Reads existing verification pages from Mosic (phases already verified during execute-phase), aggregates tech debt and deferred gaps, then spawns integration checker for cross-phase wiring.

**Mosic-only architecture:** All context loaded from Mosic M Pages and MTasks, not local files.
</objective>

<execution_context>
<!-- Spawns gsd-integration-checker agent which has all audit expertise baked in -->
</execution_context>

<context>
Version: $ARGUMENTS (optional — defaults to current milestone)

Load from Mosic MCP:
- config.json → workspace_id, project_id
- mosic_get_project(project_id, { include_task_lists: true }) → project with phases
- mosic_get_entity_pages("MProject", project_id, { content_format: "markdown" }) → all project docs
- For each phase: mosic_get_entity_pages("MTask List", task_list_id) → phase verification pages
</context>

<process>

## 0. Resolve Model Profile

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat config.json 2>/dev/null | jq -r ".model_profile // \"balanced\"")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-integration-checker | sonnet | sonnet | haiku |

Store resolved model for use in Task call below.

## 1. Load Project Context from Mosic

```bash
WORKSPACE_ID=$(cat config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json | jq -r ".mosic.project_id")
```

```
# Get project with task lists (phases)
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })

# Get project documentation pages
project_pages = mosic_get_entity_pages("MProject", PROJECT_ID, {
  content_format: "markdown",
  include_subtree: true
})

# Extract key pages
overview_page = project_pages.find(p => p.title.includes("Overview"))
requirements_page = project_pages.find(p => p.title.includes("Requirements"))
roadmap_info = project.task_lists  # Phases are task lists
```

## 2. Determine Milestone Scope

- Parse version from arguments or detect current from project metadata
- Identify all phase task lists in scope
- Extract milestone definition of done from overview page
- Extract requirements mapped to this milestone from requirements page

## 3. Read All Phase Verifications

For each phase task list, fetch verification pages:

```
verification_results = []

FOR each task_list in project.task_lists:
  # Get pages linked to this phase
  phase_pages = mosic_get_entity_pages("MTask List", task_list.name, {
    content_format: "markdown"
  })

  # Find verification page
  verification_page = phase_pages.find(p =>
    p.title.includes("Verification") || p.tags.includes("verification")
  )

  IF verification_page:
    # Parse verification content
    verification_results.push({
      phase: task_list.title,
      task_list_id: task_list.name,
      status: parse_status(verification_page.content),
      critical_gaps: parse_gaps(verification_page.content, "critical"),
      non_critical_gaps: parse_gaps(verification_page.content, "non-critical"),
      anti_patterns: parse_anti_patterns(verification_page.content),
      requirements_coverage: parse_requirements(verification_page.content)
    })
  ELSE:
    # Flag unverified phase
    verification_results.push({
      phase: task_list.title,
      task_list_id: task_list.name,
      status: "unverified",
      critical_gaps: ["Phase missing verification - BLOCKER"]
    })
```

## 4. Spawn Integration Checker

With phase context collected:

```
# Get phase summaries for integration context
phase_summaries = []
FOR each task_list in project.task_lists:
  summary_page = mosic_get_entity_pages("MTask List", task_list.name)
    .find(p => p.title.includes("Summary"))
  IF summary_page:
    phase_summaries.push(summary_page.content)

Task(
  prompt="Check cross-phase integration and E2E flows.

Phases: {phase_list}
Phase exports: {from summaries}
API routes: {routes created}

Verify cross-phase wiring and E2E user flows.",
  subagent_type="gsd-integration-checker",
  model="{integration_checker_model}"
)
```

## 5. Collect Results

Combine:
- Phase-level gaps and tech debt (from step 3)
- Integration checker's report (wiring gaps, broken flows)

## 6. Check Requirements Coverage

For each requirement extracted from requirements page:
- Find owning phase
- Check phase verification status
- Determine: satisfied | partial | unsatisfied

## 7. Create Audit Page in Mosic

```
audit_content = build_audit_content({
  milestone: version,
  audited: timestamp,
  status: determine_status(verification_results),
  scores: {
    requirements: satisfied_count + "/" + total_count,
    phases: verified_count + "/" + phase_count,
    integration: integration_score,
    flows: flow_score
  },
  gaps: aggregate_gaps(verification_results),
  tech_debt: aggregate_tech_debt(verification_results)
})

# Create audit page linked to project
audit_page = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Milestone v" + version + " Audit",
  page_type: "Document",
  icon: "lucide:clipboard-check",
  status: "Published",
  content: audit_content,
  relation_type: "Related"
})

# Tag the audit page
GSD_MANAGED_TAG = config.mosic.tags.gsd_managed
VERIFICATION_TAG = config.mosic.tags.verification

mosic_batch_add_tags_to_document("M Page", audit_page.name, [
  GSD_MANAGED_TAG,
  VERIFICATION_TAG
])
```

## 8. Update Phase Task Lists with Audit Status

```
FOR each phase in verification_results:
  task_list_id = phase.task_list_id

  # Add audit status as comment
  # IMPORTANT: Comments must use HTML format
  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MTask List",
    ref_name: task_list_id,
    content: "<p><strong>Audit Status:</strong> " + phase.status + "</p>" +
      (phase.critical_gaps.length > 0 ? "<p><strong>Gaps:</strong></p><ul>" + phase.critical_gaps.map(g => "<li>" + g + "</li>").join("") + "</ul>" : "<p>No gaps</p>") +
      (phase.tech_debt.length > 0 ? "<p><strong>Tech Debt:</strong></p><ul>" + phase.tech_debt.map(t => "<li>" + t + "</li>").join("") + "</ul>" : "<p>No tech debt</p>")
  })

  # If gaps found, create blocking tasks
  IF phase.critical_gaps.length > 0:
    FOR each gap in phase.critical_gaps:
      # IMPORTANT: Task descriptions must use Editor.js format
      gap_task = mosic_create_document("MTask", {
        workspace_id: WORKSPACE_ID,
        task_list: task_list_id,
        title: "Gap: " + gap.description,
        description: {
          blocks: [
            {
              type: "paragraph",
              data: { text: "**Audit Gap**" }
            },
            {
              type: "paragraph",
              data: { text: gap.details }
            },
            {
              type: "paragraph",
              data: { text: "**Requirement:** " + gap.requirement_id }
            }
          ]
        },
        icon: "lucide:alert-triangle",
        status: "ToDo",
        priority: "High"
      })

      # Create Blocker relation to project
      mosic_create_document("M Relation", {
        workspace_id: WORKSPACE_ID,
        source_doctype: "MTask",
        source_name: gap_task.name,
        target_doctype: "MProject",
        target_name: PROJECT_ID,
        relation_type: "Blocker"
      })
```

## 9. Update config.json with Audit Info

```json
{
  "mosic": {
    "audits": {
      "v{version}": {
        "page_id": "[audit_page.name]",
        "status": "[passed|gaps_found|tech_debt]",
        "audited_at": "[ISO timestamp]",
        "gap_tasks": ["task_id_1", "task_id_2"]
      }
    }
  }
}
```

Display:
```
✓ Audit complete

  Report: https://mosic.pro/app/page/[audit_page.name]
  Status: [passed|gaps_found|tech_debt]
  [IF gaps_found:] Gap Tasks: [N] blocking tasks created
```

## 10. Present Results

Route by status (see `<offer_next>`).

</process>

<offer_next>
Output this markdown directly (not as a code block). Route based on status:

---

**If passed:**

## ✓ Milestone {version} — Audit Passed

**Score:** {N}/{M} requirements satisfied
**Report:** https://mosic.pro/app/page/{audit_page_id}

All requirements covered. Cross-phase integration verified. E2E flows complete.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Complete milestone** — archive and tag

/gsd:complete-milestone {version}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If gaps_found:**

## ⚠ Milestone {version} — Gaps Found

**Score:** {N}/{M} requirements satisfied
**Report:** https://mosic.pro/app/page/{audit_page_id}

### Unsatisfied Requirements

{For each unsatisfied requirement:}
- **{REQ-ID}: {description}** (Phase {X})
  - {reason}

### Cross-Phase Issues

{For each integration gap:}
- **{from} → {to}:** {issue}

### Broken Flows

{For each flow gap:}
- **{flow name}:** breaks at {step}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Plan gap closure** — create phases to complete milestone

/gsd:plan-milestone-gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- View full report: https://mosic.pro/app/page/{audit_page_id}
- /gsd:complete-milestone {version} — proceed anyway (accept tech debt)

───────────────────────────────────────────────────────────────

---

**If tech_debt (no blockers but accumulated debt):**

## ⚡ Milestone {version} — Tech Debt Review

**Score:** {N}/{M} requirements satisfied
**Report:** https://mosic.pro/app/page/{audit_page_id}

All requirements met. No critical blockers. Accumulated tech debt needs review.

### Tech Debt by Phase

{For each phase with debt:}
**Phase {X}: {name}**
- {item 1}
- {item 2}

### Total: {N} items across {M} phases

───────────────────────────────────────────────────────────────

## ▶ Options

**A. Complete milestone** — accept debt, track in backlog

/gsd:complete-milestone {version}

**B. Plan cleanup phase** — address debt before completing

/gsd:plan-milestone-gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] Project context loaded from Mosic (mosic_get_project, mosic_get_entity_pages)
- [ ] Milestone scope identified from project task lists
- [ ] All phase verification pages read from Mosic
- [ ] Tech debt and deferred gaps aggregated
- [ ] Integration checker spawned for cross-phase wiring
- [ ] Audit page created in Mosic linked to MProject
- [ ] Tags applied (gsd-managed, verification)
- [ ] Phase task lists updated with audit comments
- [ ] Gap tasks created with Blocker relations (if gaps_found)
- [ ] config.json updated with audit info
- [ ] Results presented with actionable next steps
</success_criteria>
