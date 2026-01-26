---
name: gsd:progress
description: Check project progress, show context, and route to next action (execute or plan)
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - SlashCommand
---

<objective>
Check project progress, summarize recent work and what's ahead, then intelligently route to the next action - either executing an existing plan or creating the next one.

Provides situational awareness before continuing work.
</objective>


<process>

<step name="verify">
**Verify planning structure exists:**

Use Bash (not Glob) to check—Glob respects .gitignore but .planning/ is often gitignored:

```bash
test -d .planning && echo "exists" || echo "missing"
```

If no `.planning/` directory:

```
No planning structure found.

Run /gsd:new-project to start a new project.
```

Exit.

If missing STATE.md: suggest `/gsd:new-project`.

**If ROADMAP.md missing but PROJECT.md exists:**

This means a milestone was completed and archived. Go to **Route F** (between milestones).

If missing both ROADMAP.md and PROJECT.md: suggest `/gsd:new-project`.
</step>

<step name="load">
**Load full project context:**

- Read `.planning/STATE.md` for living memory (position, decisions, issues)
- Read `.planning/ROADMAP.md` for phase structure and objectives
- Read `.planning/PROJECT.md` for current state (What This Is, Core Value, Requirements)
- Read `.planning/config.json` for settings (model_profile, workflow toggles, mosic config)
</step>

<step name="enrich_from_mosic">
**Enrich context from Mosic (Deep Integration):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Load Mosic config:
```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
```

### Step 1: Fetch Project Overview
```
project = mosic_get_project(project_id, {
  include_task_lists: true,
  include_comments: true
})

# Get all pages linked to project
project_pages = mosic_get_entity_pages("MProject", project_id, {
  include_subtree: true,
  include_content: false
})
```

### Step 2: Fetch Task Statistics by Phase
```
# Search for all tasks across all phases
all_tasks = mosic_search_tasks({
  workspace_id: workspace_id,
  project_id: project_id,
  limit: 100
})

# Group by status
task_by_status = {
  "Backlog": [],
  "ToDo": [],
  "In Progress": [],
  "In Review": [],
  "Blocked": [],
  "Completed": []
}

FOR each task in all_tasks:
  task_by_status[task.status].push(task)

# Search for blocked tasks specifically (important for routing)
blocked_tasks = mosic_search_tasks({
  workspace_id: workspace_id,
  project_id: project_id,
  status: "Blocked"
})

# Get blocked task details including relations
FOR each blocked_task:
  relations = mosic_get_document_relations("MTask", blocked_task.name, {
    relation_types: ["Blocker"]
  })
  blocked_task.blockers = relations.incoming  # What's blocking this
```

### Step 3: Calculate Phase-Level Progress
```
# For each phase task list
FOR each task_list in project.task_lists:
  phase_tasks = mosic_search_tasks({
    workspace_id: workspace_id,
    task_list_id: task_list.name
  })

  phase_stats = {
    name: task_list.title,
    total: phase_tasks.length,
    completed: phase_tasks.filter(t => t.done).length,
    in_progress: phase_tasks.filter(t => t.status == "In Progress").length,
    blocked: phase_tasks.filter(t => t.status == "Blocked").length,
    progress_pct: (completed / total * 100).toFixed(0) + "%"
  }

  # Get phase pages
  phase_pages = mosic_get_entity_pages("MTask List", task_list.name)

  phase_stats.has_research = phase_pages.find(p => p.title.includes("Research"))
  phase_stats.has_verification = phase_pages.find(p => p.title.includes("Verification"))
  phase_stats.has_uat = phase_pages.find(p => p.title.includes("UAT"))
```

### Step 4: Find Cross-Session Completions
```
# Get tasks completed since last local sync
last_sync = mosic.last_sync from config.json

recent_completions = mosic_advanced_search({
  workspace_id: workspace_id,
  doctypes: ["MTask"],
  filters: {
    project_id: project_id,
    done: true,
    modified: [">=", last_sync]
  }
})

# Cross-reference with local STATE.md to find external completions
# (Tasks completed in other sessions or by other agents)
```

### Step 5: Get Relation Insights
```
# Find dependency paths and blockers
relation_stats = mosic_get_relation_stats({
  workspace_id: workspace_id,
  doctype: "MProject",
  docname: project_id
})

# Find blocking chains
FOR each blocked_task:
  path = mosic_find_relation_path({
    from_doctype: "MTask",
    from_docname: blocked_task.name,
    to_doctype: "MTask List",
    to_docname: current_phase_task_list,
    relation_types: ["Blocker", "Depends"],
    max_depth: 5
  })
  blocked_task.resolution_path = path
```

Store for display in report step:
- `mosic_project_url`: `https://mosic.pro/app/Project/${project_id}`
- `mosic_total_tasks`: all_tasks.length
- `mosic_completed_tasks`: task_by_status["Completed"].length
- `mosic_in_progress_tasks`: task_by_status["In Progress"].length
- `mosic_blocked_tasks`: blocked_tasks with resolution paths
- `mosic_phase_progress`: Array of phase_stats
- `mosic_recent_completions`: Completions since last sync
- `mosic_documentation`: project_pages summary
- `mosic_relation_stats`: relation_stats

**If Mosic fetch fails:**
- Log warning, continue with local-only data
- Display: "(Mosic sync unavailable - showing local state only)"
</step>

<step name="recent">
**Gather recent work context:**

- Find the 2-3 most recent SUMMARY.md files
- Extract from each: what was accomplished, key decisions, any issues logged
- This shows "what we've been working on"
  </step>

<step name="position">
**Parse current position:**

- From STATE.md: current phase, plan number, status
- Calculate: total plans, completed plans, remaining plans
- Note any blockers or concerns
- Check for CONTEXT.md: For phases without PLAN.md files, check if `{phase}-CONTEXT.md` exists in phase directory
- Count pending todos: `ls .planning/todos/pending/*.md 2>/dev/null | wc -l`
- Check for active debug sessions: `ls .planning/debug/*.md 2>/dev/null | grep -v resolved | wc -l`
  </step>

<step name="report">
**Present rich status report:**

```
# [Project Name]

**Progress:** [████████░░] 8/10 plans complete
**Profile:** [quality/balanced/budget]
[IF mosic.enabled:] **Mosic:** [mosic_project_url] [END IF]

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line]
- [Phase X, Plan Z]: [what was accomplished - 1 line]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [✓ if CONTEXT.md exists | - if not]

[IF mosic.enabled AND mosic_recent_completions:]
## Cross-Session Progress (from Mosic)
Tasks completed in prior sessions:
- [task_title] — [completion_date]
- [task_title] — [completion_date]
[END IF]

## Key Decisions Made
- [decision 1 from STATE.md]
- [decision 2]

## Blockers/Concerns
- [any blockers or concerns from STATE.md]
[IF mosic.enabled AND mosic_blocked_tasks:]
- [Mosic blocked tasks]
[END IF]

## Pending Todos
- [count] pending — /gsd:check-todos to review

## Active Debug Sessions
- [count] active — /gsd:debug to continue
(Only show this section if count > 0)

## What's Next
[Next phase/plan objective from ROADMAP]
```

</step>

<step name="route">
**Determine next action based on verified counts.**

**Step 1: Count plans, summaries, and issues in current phase**

List files in the current phase directory:

```bash
ls -1 .planning/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null | wc -l
ls -1 .planning/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null | wc -l
ls -1 .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null | wc -l
```

State: "This phase has {X} plans, {Y} summaries."

**Step 1.5: Check for unaddressed UAT gaps**

Check for UAT.md files with status "diagnosed" (has gaps needing fixes).

```bash
# Check for diagnosed UAT with gaps
grep -l "status: diagnosed" .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null
```

Track:
- `uat_with_gaps`: UAT.md files with status "diagnosed" (gaps need fixing)

**Step 2: Route based on counts**

| Condition | Meaning | Action |
|-----------|---------|--------|
| uat_with_gaps > 0 | UAT gaps need fix plans | Go to **Route E** |
| summaries < plans | Unexecuted plans exist | Go to **Route A** |
| summaries = plans AND plans > 0 | Phase complete | Go to Step 3 |
| plans = 0 | Phase not yet planned | Go to **Route B** |

---

**Route A: Unexecuted plan exists**

Find the first PLAN.md without matching SUMMARY.md.
Read its `<objective>` section.

```
---

## ▶ Next Up

**{phase}-{plan}: [Plan Name]** — [objective summary from PLAN.md]

`/gsd:execute-phase {phase}`

<sub>`/clear` first → fresh context window</sub>

---
```

---

**Route B: Phase needs planning**

Check if `{phase}-CONTEXT.md` exists in phase directory.

**If CONTEXT.md exists:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}
<sub>✓ Context gathered, ready to plan</sub>

`/gsd:plan-phase {phase-number}`

<sub>`/clear` first → fresh context window</sub>

---
```

**If CONTEXT.md does NOT exist:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/gsd:discuss-phase {phase}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase {phase}` — skip discussion, plan directly
- `/gsd:list-phase-assumptions {phase}` — see Claude's assumptions

---
```

---

**Route E: UAT gaps need fix plans**

UAT.md exists with gaps (diagnosed issues). User needs to plan fixes.

```
---

## ⚠ UAT Gaps Found

**{phase}-UAT.md** has {N} gaps requiring fixes.

`/gsd:plan-phase {phase} --gaps`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:execute-phase {phase}` — execute phase plans
- `/gsd:verify-work {phase}` — run more UAT testing

---
```

---

**Step 3: Check milestone status (only when phase complete)**

Read ROADMAP.md and identify:
1. Current phase number
2. All phase numbers in the current milestone section

Count total phases and identify the highest phase number.

State: "Current phase is {X}. Milestone has {N} phases (highest: {Y})."

**Route based on milestone status:**

| Condition | Meaning | Action |
|-----------|---------|--------|
| current phase < highest phase | More phases remain | Go to **Route C** |
| current phase = highest phase | Milestone complete | Go to **Route D** |

---

**Route C: Phase complete, more phases remain**

Read ROADMAP.md to get the next phase's name and goal.

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/gsd:discuss-phase {Z+1}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase {Z+1}` — skip discussion, plan directly
- `/gsd:verify-work {Z}` — user acceptance test before continuing

---
```

---

**Route D: Milestone complete**

```
---

## 🎉 Milestone Complete

All {N} phases finished!

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

`/gsd:complete-milestone`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:verify-work` — user acceptance test before completing milestone

---
```

---

**Route F: Between milestones (ROADMAP.md missing, PROJECT.md exists)**

A milestone was completed and archived. Ready to start the next milestone cycle.

Read MILESTONES.md to find the last completed milestone version.

```
---

## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/gsd:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

<step name="edge_cases">
**Handle edge cases:**

- Phase complete but next phase not planned → offer `/gsd:plan-phase [next]`
- All work complete → offer milestone completion
- Blockers present → highlight before offering to continue
- Handoff file exists → mention it, offer `/gsd:resume-work`
  </step>

</process>

<success_criteria>

- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress
- [ ] What's next clearly explained
- [ ] Smart routing: /gsd:execute-phase if plans exist, /gsd:plan-phase if not
- [ ] User confirms before any action
- [ ] Seamless handoff to appropriate gsd command
      </success_criteria>
