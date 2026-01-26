---
name: gsd:plan-milestone-gaps
description: Create phases to close all gaps identified by milestone audit
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__mosic_pro__*
---

<objective>
Create all phases necessary to close gaps identified by `/gsd:audit-milestone`.

Reads audit page from Mosic, groups gaps into logical phases, creates MTask Lists for phases, and offers to plan each phase.

One command creates all fix phases — no manual `/gsd:add-phase` per gap.

**Mosic-only architecture:** All context from Mosic M Pages, phases created as MTask Lists.
</objective>

<execution_context>
<!-- Spawns gsd-planner agent which has all planning expertise baked in -->
</execution_context>

<context>
Load from Mosic MCP:
- config.json → workspace_id, project_id, audits
- mosic_get_page(audit_page_id, { content_format: "markdown" }) → audit results
- mosic_get_entity_pages("MProject", project_id) → requirements, overview pages
- mosic_get_project(project_id, { include_task_lists: true }) → current phases
</context>

<process>

## 1. Load Audit Results from Mosic

```bash
WORKSPACE_ID=$(cat config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json | jq -r ".mosic.project_id")
LATEST_AUDIT=$(cat config.json | jq -r ".mosic.audits | keys | last")
AUDIT_PAGE_ID=$(cat config.json | jq -r ".mosic.audits[\"$LATEST_AUDIT\"].page_id")
```

```
# Get audit page content
audit_page = mosic_get_page(AUDIT_PAGE_ID, {
  content_format: "markdown"
})

# Parse gaps from audit content
gaps = parse_audit_gaps(audit_page.content)
# gaps.requirements — unsatisfied requirements
# gaps.integration — missing cross-phase connections
# gaps.flows — broken E2E flows
```

If no audit page exists or has no gaps:
```
No audit gaps found. Run `/gsd:audit-milestone` first.
```
Exit.

## 2. Load Project Context

```
# Get project pages for requirements and overview
project_pages = mosic_get_entity_pages("MProject", PROJECT_ID, {
  content_format: "markdown"
})

requirements_page = project_pages.find(p => p.title.includes("Requirements"))
overview_page = project_pages.find(p => p.title.includes("Overview"))

# Get current phases
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })
existing_phases = project.task_lists
```

## 3. Prioritize Gaps

Group gaps by priority from requirements:

| Priority | Action |
|----------|--------|
| `must` | Create phase, blocks milestone |
| `should` | Create phase, recommended |
| `nice` | Ask user: include or defer? |

For integration/flow gaps, infer priority from affected requirements.

## 4. Group Gaps into Phases

Cluster related gaps into logical phases:

**Grouping rules:**
- Same affected phase → combine into one fix phase
- Same subsystem (auth, API, UI) → combine
- Dependency order (fix stubs before wiring)
- Keep phases focused: 2-4 tasks each

**Example grouping:**
```
Gap: DASH-01 unsatisfied (Dashboard doesn't fetch)
Gap: Integration Phase 1→3 (Auth not passed to API calls)
Gap: Flow "View dashboard" broken at data fetch

→ Phase 6: "Wire Dashboard to API"
  - Add fetch to Dashboard.tsx
  - Include auth header in fetch
  - Handle response, update state
  - Render user data
```

## 5. Determine Phase Numbers

Find highest existing phase from task lists:

```
max_phase = existing_phases
  .map(tl => extract_phase_number(tl.title))
  .max()
```

New phases continue from there:
- If Phase 5 is highest, gaps become Phase 6, 7, 8...

## 6. Present Gap Closure Plan

```markdown
## Gap Closure Plan

**Milestone:** {version}
**Gaps to close:** {N} requirements, {M} integration, {K} flows

### Proposed Phases

**Phase {N}: {Name}**
Closes:
- {REQ-ID}: {description}
- Integration: {from} → {to}
Tasks: {count}

**Phase {N+1}: {Name}**
Closes:
- {REQ-ID}: {description}
- Flow: {flow name}
Tasks: {count}

{If nice-to-have gaps exist:}

### Deferred (nice-to-have)

These gaps are optional. Include them?
- {gap description}
- {gap description}

---

Create these {X} phases? (yes / adjust / defer all optional)
```

Wait for user confirmation.

## 7. Create MTask Lists for Gap Closure Phases

```
GSD_MANAGED_TAG = config.mosic.tags.gsd_managed

# Get or create fix tag
fix_tag = mosic_search_tags({ workspace_id: WORKSPACE_ID, query: "fix" })
IF fix_tag.length == 0:
  fix_tag = mosic_create_document("M Tag", {
    workspace_id: WORKSPACE_ID,
    title: "fix",
    color: "#EF4444",  # Red for gap/fix work
    description: "Gap closure / fix work"
  })
  FIX_TAG = fix_tag.name
ELSE:
  FIX_TAG = fix_tag[0].name

# Track previous phase for dependencies
prev_task_list = existing_phases[existing_phases.length - 1]

FOR each gap_phase in created_phases:
  phase_num = gap_phase.number
  phase_name = gap_phase.name
  gaps_closed = gap_phase.gaps

  # Create phase tag
  phase_tag = mosic_search_tags({ workspace_id: WORKSPACE_ID, query: "phase-" + phase_num })
  IF phase_tag.length == 0:
    phase_tag = mosic_create_document("M Tag", {
      workspace_id: WORKSPACE_ID,
      title: "phase-" + phase_num,
      color: "#EF4444"  # Red for gap closure phases
    })

  # Create MTask List with gap closure metadata
  task_list = mosic_create_document("MTask List", {
    workspace_id: WORKSPACE_ID,
    project: PROJECT_ID,
    title: "Phase " + phase_num + ": " + phase_name + " (GAP CLOSURE)",
    description: build_gap_closure_description(gaps_closed),
    icon: "lucide:wrench",  # Wrench for fix work
    color: "#EF4444",
    status: "Backlog",
    prefix: "P" + phase_num
  })

  task_list_id = task_list.name

  # Tag the task list
  mosic_batch_add_tags_to_document("MTask List", task_list_id, [
    GSD_MANAGED_TAG,
    FIX_TAG,
    phase_tag.name
  ])

  # Create Depends relation to previous phase
  IF prev_task_list:
    mosic_create_document("M Relation", {
      workspace_id: WORKSPACE_ID,
      source_doctype: "MTask List",
      source_name: task_list_id,
      target_doctype: "MTask List",
      target_name: prev_task_list.name,
      relation_type: "Depends"
    })

  prev_task_list = task_list
```

## 8. Create Gap Closure Documentation Page

```
# Create a summary page linking audit to gap phases
gap_doc_page = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Gap Closure Plan - " + milestone_version,
  page_type: "Document",
  icon: "lucide:clipboard-list",
  status: "Published",
  content: build_gap_doc_content(created_phases, gaps),
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", gap_doc_page.name, [
  GSD_MANAGED_TAG,
  FIX_TAG
])

# Create relation from gap doc to audit
mosic_create_document("M Relation", {
  workspace_id: WORKSPACE_ID,
  source_doctype: "M Page",
  source_name: gap_doc_page.name,
  target_doctype: "M Page",
  target_name: AUDIT_PAGE_ID,
  relation_type: "Related"
})
```

## 9. Update config.json

```json
{
  "mosic": {
    "task_lists": {
      "phase-6": "[task_list_id]",
      "phase-7": "[task_list_id]"
    },
    "tags": {
      "fix": "[FIX_TAG]",
      "phase_tags": {
        "phase-6": "[tag_id]",
        "phase-7": "[tag_id]"
      }
    },
    "pages": {
      "gap-closure-v1.0": "[gap_doc_page.name]"
    },
    "last_sync": "[timestamp]"
  }
}
```

Display:
```
✓ Gap closure phases created

  Phases: [N] new task lists
  Gap Doc: https://mosic.pro/app/page/[gap_doc_page.name]

  Phase Structure:
  ├─ Phase [X]: [name] (GAP CLOSURE) → depends on [X-1]
  ├─ Phase [X+1]: [name] (GAP CLOSURE) → depends on [X]
  └─ ...
```

## 10. Offer Next Steps

```markdown
## ✓ Gap Closure Phases Created

**Phases added:** {N} - {M}
**Gaps addressed:** {count} requirements, {count} integration, {count} flows
**Mosic:** https://mosic.pro/app/page/[gap_doc_page.name]

---

## ▶ Next Up

**Plan first gap closure phase**

`/gsd:plan-phase {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:execute-phase {N}` — if plans already exist
- View gap doc: https://mosic.pro/app/page/[gap_doc_page.name]

---

**After all gap phases complete:**

`/gsd:audit-milestone` — re-audit to verify gaps closed
`/gsd:complete-milestone {version}` — archive when audit passes
```

</process>

<gap_to_phase_mapping>

## How Gaps Become Tasks

**Requirement gap → Tasks:**
```yaml
gap:
  id: DASH-01
  description: "User sees their data"
  reason: "Dashboard exists but doesn't fetch from API"
  missing:
    - "useEffect with fetch to /api/user/data"
    - "State for user data"
    - "Render user data in JSX"

becomes:

phase: "Wire Dashboard Data"
tasks:
  - name: "Add data fetching"
    files: [src/components/Dashboard.tsx]
    action: "Add useEffect that fetches /api/user/data on mount"

  - name: "Add state management"
    files: [src/components/Dashboard.tsx]
    action: "Add useState for userData, loading, error states"

  - name: "Render user data"
    files: [src/components/Dashboard.tsx]
    action: "Replace placeholder with userData.map rendering"
```

**Integration gap → Tasks:**
```yaml
gap:
  from_phase: 1
  to_phase: 3
  connection: "Auth token → API calls"
  reason: "Dashboard API calls don't include auth header"
  missing:
    - "Auth header in fetch calls"
    - "Token refresh on 401"

becomes:

phase: "Add Auth to Dashboard API Calls"
tasks:
  - name: "Add auth header to fetches"
    files: [src/components/Dashboard.tsx, src/lib/api.ts]
    action: "Include Authorization header with token in all API calls"

  - name: "Handle 401 responses"
    files: [src/lib/api.ts]
    action: "Add interceptor to refresh token or redirect to login on 401"
```

**Flow gap → Tasks:**
```yaml
gap:
  name: "User views dashboard after login"
  broken_at: "Dashboard data load"
  reason: "No fetch call"
  missing:
    - "Fetch user data on mount"
    - "Display loading state"
    - "Render user data"

becomes:

# Usually same phase as requirement/integration gap
# Flow gaps often overlap with other gap types
```

</gap_to_phase_mapping>

<error_handling>
```
IF mosic operation fails:
  - Log warning: "Mosic operation failed: [error]. Continuing..."
  - Add to config.mosic.pending_sync for retry
  - Continue (don't block)
```
</error_handling>

<success_criteria>
- [ ] Audit page loaded from Mosic and gaps parsed
- [ ] Project context loaded (requirements, existing phases)
- [ ] Gaps prioritized (must/should/nice)
- [ ] Gaps grouped into logical phases
- [ ] User confirmed phase plan
- [ ] MTask Lists created for each gap closure phase
- [ ] Depends relations created between phases
- [ ] Tags applied (gsd-managed, fix, phase-NN)
- [ ] Gap Closure documentation page created
- [ ] Related relation to audit page created
- [ ] config.json updated with all mappings
- [ ] User knows to run `/gsd:plan-phase` next
</success_criteria>
