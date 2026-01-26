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

**This command IS the orchestrator.** Reads existing VERIFICATION.md files (phases already verified during execute-phase), aggregates tech debt and deferred gaps, then spawns integration checker for cross-phase wiring.
</objective>

<execution_context>
<!-- Spawns gsd-integration-checker agent which has all audit expertise baked in -->
</execution_context>

<context>
Version: $ARGUMENTS (optional — defaults to current milestone)

**Original Intent:**
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md

**Planned Work:**
@.planning/ROADMAP.md
@.planning/config.json (if exists)

**Completed Work:**
Glob: .planning/phases/*/*-SUMMARY.md
Glob: .planning/phases/*/*-VERIFICATION.md
</context>

<process>

## 0. Resolve Model Profile

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-integration-checker | sonnet | sonnet | haiku |

Store resolved model for use in Task call below.

## 1. Determine Milestone Scope

```bash
# Get phases in milestone
ls -d .planning/phases/*/ | sort -V
```

- Parse version from arguments or detect current from ROADMAP.md
- Identify all phase directories in scope
- Extract milestone definition of done from ROADMAP.md
- Extract requirements mapped to this milestone from REQUIREMENTS.md

## 2. Read All Phase Verifications

For each phase directory, read the VERIFICATION.md:

```bash
cat .planning/phases/01-*/*-VERIFICATION.md
cat .planning/phases/02-*/*-VERIFICATION.md
# etc.
```

From each VERIFICATION.md, extract:
- **Status:** passed | gaps_found
- **Critical gaps:** (if any — these are blockers)
- **Non-critical gaps:** tech debt, deferred items, warnings
- **Anti-patterns found:** TODOs, stubs, placeholders
- **Requirements coverage:** which requirements satisfied/blocked

If a phase is missing VERIFICATION.md, flag it as "unverified phase" — this is a blocker.

## 3. Spawn Integration Checker

With phase context collected:

```
Task(
  prompt="Check cross-phase integration and E2E flows.

Phases: {phase_dirs}
Phase exports: {from SUMMARYs}
API routes: {routes created}

Verify cross-phase wiring and E2E user flows.",
  subagent_type="gsd-integration-checker",
  model="{integration_checker_model}"
)
```

## 4. Collect Results

Combine:
- Phase-level gaps and tech debt (from step 2)
- Integration checker's report (wiring gaps, broken flows)

## 5. Check Requirements Coverage

For each requirement in REQUIREMENTS.md mapped to this milestone:
- Find owning phase
- Check phase verification status
- Determine: satisfied | partial | unsatisfied

## 6. Aggregate into v{version}-MILESTONE-AUDIT.md

Create `.planning/v{version}-MILESTONE-AUDIT.md` with:

```yaml
---
milestone: {version}
audited: {timestamp}
status: passed | gaps_found | tech_debt
scores:
  requirements: N/M
  phases: N/M
  integration: N/M
  flows: N/M
gaps:  # Critical blockers
  requirements: [...]
  integration: [...]
  flows: [...]
tech_debt:  # Non-critical, deferred
  - phase: 01-auth
    items:
      - "TODO: add rate limiting"
      - "Warning: no password strength validation"
  - phase: 03-dashboard
    items:
      - "Deferred: mobile responsive layout"
---
```

Plus full markdown report with tables for requirements, phases, integration, tech debt.

**Status values:**
- `passed` — all requirements met, no critical gaps, minimal tech debt
- `gaps_found` — critical blockers exist
- `tech_debt` — no blockers but accumulated deferred items need review

## 6.5. Sync Audit to Mosic

**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
VERIFICATION_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.verification")
```

### Step 6.5.1: Create Audit Page

```
audit_page = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Milestone v" + version + " Audit",
  page_type: "Document",
  icon: "lucide:clipboard-check",
  status: "Published",
  content: convert_to_editorjs(MILESTONE-AUDIT.md content),
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", audit_page.name, [
  GSD_MANAGED_TAG,
  VERIFICATION_TAG
])
```

### Step 6.5.2: Update Phase Task Lists with Audit Status

```
FOR each phase in audit_results:
  task_list_id = config.mosic.task_lists["phase-" + phase.number]
  IF task_list_id:
    # Add audit status as comment
    mosic_create_document("M Comment", {
      workspace_id: WORKSPACE_ID,
      ref_doc: "MTask List",
      ref_name: task_list_id,
      content: "**Audit Status:** " + phase.status + "\n\n" +
        (phase.gaps.length > 0 ? "**Gaps:**\n- " + phase.gaps.join("\n- ") : "No gaps") + "\n\n" +
        (phase.tech_debt.length > 0 ? "**Tech Debt:**\n- " + phase.tech_debt.join("\n- ") : "No tech debt")
    })

    # If gaps found, create blocking tasks
    IF phase.gaps.length > 0:
      FOR each gap in phase.gaps:
        gap_task = mosic_create_document("MTask", {
          workspace_id: WORKSPACE_ID,
          task_list: task_list_id,
          title: "Gap: " + gap.description,
          description: "**Audit Gap**\n\n" + gap.details + "\n\n**Requirement:** " + gap.requirement_id,
          icon: "lucide:alert-triangle",
          status: "ToDo",
          priority: "High"
        })

        # Create Blocker relation to milestone completion
        mosic_create_document("M Relation", {
          workspace_id: WORKSPACE_ID,
          source_doctype: "MTask",
          source_name: gap_task.name,
          target_doctype: "MProject",
          target_name: PROJECT_ID,
          relation_type: "Blocker"
        })
```

### Step 6.5.3: Update config.json with Audit Info

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
✓ Audit synced to Mosic

  Report: https://mosic.pro/app/page/[audit_page.name]
  Status: [passed|gaps_found|tech_debt]
  [IF gaps_found:] Gap Tasks: [N] blocking tasks created
```

**Error handling:**

```
IF mosic sync fails:
  - Display warning: "Mosic audit sync failed: [error]. Local audit created."
  - Add to mosic.pending_sync array:
    { type: "milestone_audit", version: version }
  - Continue (don't block)
```

**If mosic.enabled = false:** Skip Mosic sync.

## 7. Present Results

Route by status (see `<offer_next>`).

</process>

<offer_next>
Output this markdown directly (not as a code block). Route based on status:

---

**If passed:**

## ✓ Milestone {version} — Audit Passed

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

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
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

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
- cat .planning/v{version}-MILESTONE-AUDIT.md — see full report
- /gsd:complete-milestone {version} — proceed anyway (accept tech debt)

───────────────────────────────────────────────────────────────

---

**If tech_debt (no blockers but accumulated debt):**

## ⚡ Milestone {version} — Tech Debt Review

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

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
- [ ] Milestone scope identified
- [ ] All phase VERIFICATION.md files read
- [ ] Tech debt and deferred gaps aggregated
- [ ] Integration checker spawned for cross-phase wiring
- [ ] v{version}-MILESTONE-AUDIT.md created
- [ ] Mosic sync (if enabled):
  - [ ] Audit page created linked to MProject
  - [ ] Tags applied (gsd-managed, verification)
  - [ ] Phase task lists updated with audit comments
  - [ ] Gap tasks created with Blocker relations (if gaps_found)
  - [ ] config.json updated with audit info
  - [ ] Sync failures handled gracefully (added to pending_sync)
- [ ] Results presented with actionable next steps
</success_criteria>
