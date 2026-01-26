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
---

<objective>
Create all phases necessary to close gaps identified by `/gsd:audit-milestone`.

Reads MILESTONE-AUDIT.md, groups gaps into logical phases, creates phase entries in ROADMAP.md, and offers to plan each phase.

One command creates all fix phases — no manual `/gsd:add-phase` per gap.
</objective>

<execution_context>
<!-- Spawns gsd-planner agent which has all planning expertise baked in -->
</execution_context>

<context>
**Audit results:**
Glob: .planning/v*-MILESTONE-AUDIT.md (use most recent)

**Original intent (for prioritization):**
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md

**Current state:**
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>

## 1. Load Audit Results

```bash
# Find the most recent audit file
ls -t .planning/v*-MILESTONE-AUDIT.md 2>/dev/null | head -1
```

Parse YAML frontmatter to extract structured gaps:
- `gaps.requirements` — unsatisfied requirements
- `gaps.integration` — missing cross-phase connections
- `gaps.flows` — broken E2E flows

If no audit file exists or has no gaps, error:
```
No audit gaps found. Run `/gsd:audit-milestone` first.
```

## 2. Prioritize Gaps

Group gaps by priority from REQUIREMENTS.md:

| Priority | Action |
|----------|--------|
| `must` | Create phase, blocks milestone |
| `should` | Create phase, recommended |
| `nice` | Ask user: include or defer? |

For integration/flow gaps, infer priority from affected requirements.

## 3. Group Gaps into Phases

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

## 4. Determine Phase Numbers

Find highest existing phase:
```bash
ls -d .planning/phases/*/ | sort -V | tail -1
```

New phases continue from there:
- If Phase 5 is highest, gaps become Phase 6, 7, 8...

## 5. Present Gap Closure Plan

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

## 6. Update ROADMAP.md

Add new phases to current milestone:

```markdown
### Phase {N}: {Name}
**Goal:** {derived from gaps being closed}
**Requirements:** {REQ-IDs being satisfied}
**Gap Closure:** Closes gaps from audit

### Phase {N+1}: {Name}
...
```

## 7. Create Phase Directories

```bash
mkdir -p ".planning/phases/{NN}-{name}"
```

## 8. Sync Gap Closure Phases to Mosic (Deep Integration)

**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing gap closure phases to Mosic...
```

### Step 8.1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
FIX_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.fix")
```

### Step 8.2: Create Fix Tag if Not Exists

```
IF FIX_TAG is null:
  fix_tag = mosic_search_tags({ workspace_id, query: "fix" })
  IF fix_tag.length == 0:
    fix_tag = mosic_create_document("M Tag", {
      workspace_id: workspace_id,
      name: "fix",
      color: "red"  # Red to indicate gap/fix work
    })
  FIX_TAG = fix_tag.name
  mosic.tags.fix = FIX_TAG
```

### Step 8.3: Create MTask List for Each Gap Closure Phase

```
FOR each gap_phase in created_phases:
  phase_num = gap_phase.number
  phase_name = gap_phase.name
  gaps_closed = gap_phase.gaps

  # Create phase tag
  phase_tag = mosic_search_tags({ workspace_id, query: "phase-" + phase_num })
  IF phase_tag.length == 0:
    phase_tag = mosic_create_document("M Tag", {
      workspace_id: workspace_id,
      name: "phase-" + phase_num,
      color: "red"  # Red for gap closure phases
    })

  # Get previous phase task list for dependency
  prev_phase_num = phase_num - 1
  PREV_TASK_LIST = mosic.task_lists["phase-" + prev_phase_num]

  # Create MTask List with gap closure metadata
  task_list = mosic_create_document("MTask List", {
    workspace_id: workspace_id,
    project: PROJECT_ID,
    title: "Phase " + phase_num + ": " + phase_name + " (GAP CLOSURE)",
    description: build_gap_closure_description(gaps_closed),
    icon: "lucide:wrench",  # Wrench for fix work
    color: "red",
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
  IF PREV_TASK_LIST:
    mosic_create_document("M Relation", {
      workspace_id: workspace_id,
      source_doctype: "MTask List",
      source_name: task_list_id,
      target_doctype: "MTask List",
      target_name: PREV_TASK_LIST,
      relation_type: "Depends"
    })

  # Store mapping
  mosic.task_lists["phase-" + phase_num] = task_list_id
  mosic.tags.phase_tags["phase-" + phase_num] = phase_tag.name
```

### Step 8.4: Create Gap Closure Documentation Page

```
# Create a summary page linking audit to gap phases
gap_doc_page = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: workspace_id,
  title: "Gap Closure Plan - " + milestone_version,
  page_type: "Document",
  icon: "lucide:clipboard-list",
  status: "Published",
  content: {
    blocks: [
      { type: "header", data: { text: "Gap Closure Plan", level: 1 } },
      { type: "paragraph", data: { text: "Phases created to close gaps identified by milestone audit." } },
      { type: "header", data: { text: "Gaps Addressed", level: 2 } },
      { type: "list", data: { style: "unordered", items: all_gaps_list } },
      { type: "header", data: { text: "Closure Phases", level: 2 } },
      build_phase_list_blocks(created_phases)
    ]
  },
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", gap_doc_page.name, [
  GSD_MANAGED_TAG,
  FIX_TAG
])

mosic.pages["gap-closure-" + milestone_version] = gap_doc_page.name
```

### Step 8.5: Link to Original Audit

```
# Create relation from gap doc to audit findings
IF mosic.pages["milestone-audit-" + milestone_version]:
  mosic_create_document("M Relation", {
    workspace_id: workspace_id,
    source_doctype: "M Page",
    source_name: gap_doc_page.name,
    target_doctype: "M Page",
    target_name: mosic.pages["milestone-audit-" + milestone_version],
    relation_type: "Related"
  })
```

### Step 8.6: Update config.json

```bash
# Update config.json with:
# mosic.task_lists["phase-NN"] for each new phase
# mosic.tags.phase_tags["phase-NN"] for each new phase
# mosic.tags.fix if created
# mosic.pages["gap-closure-VERSION"]
# mosic.last_sync = current timestamp
```

Display:
```
✓ Gap closure phases synced to Mosic

  Phases created: [N]
  Gap doc: https://mosic.pro/app/page/[gap_doc_page.name]

  Phase Structure:
  ├─ Phase [X]: [name] (GAP CLOSURE) → depends on [X-1]
  ├─ Phase [X+1]: [name] (GAP CLOSURE) → depends on [X]
  └─ ...
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Gap phases created locally."
  - Add to mosic.pending_sync array for retry
  - Continue to commit step (don't block)
```

**If mosic.enabled = false:** Skip to commit step.

## 9. Commit Roadmap Update

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/ROADMAP.md
git commit -m "docs(roadmap): add gap closure phases {N}-{M}"
```

## 10. Offer Next Steps

```markdown
## ✓ Gap Closure Phases Created

**Phases added:** {N} - {M}
**Gaps addressed:** {count} requirements, {count} integration, {count} flows
[IF mosic.enabled:]
**Mosic:** https://mosic.pro/app/page/[gap_doc_page.name]
[END IF]

---

## ▶ Next Up

**Plan first gap closure phase**

`/gsd:plan-phase {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:execute-phase {N}` — if plans already exist
- `cat .planning/ROADMAP.md` — see updated roadmap

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

<success_criteria>
- [ ] MILESTONE-AUDIT.md loaded and gaps parsed
- [ ] Gaps prioritized (must/should/nice)
- [ ] Gaps grouped into logical phases
- [ ] User confirmed phase plan
- [ ] ROADMAP.md updated with new phases
- [ ] Phase directories created
- [ ] Mosic sync (if enabled):
  - [ ] Fix tag created (if not exists)
  - [ ] MTask Lists created for each gap closure phase with (GAP CLOSURE) marker
  - [ ] Depends relations created between phases
  - [ ] Tags applied (gsd-managed, fix, phase-NN)
  - [ ] Gap Closure documentation page created
  - [ ] Related relation to audit findings (if exists)
  - [ ] config.json updated with all mappings
- [ ] Changes committed
- [ ] User knows to run `/gsd:plan-phase` next
</success_criteria>
