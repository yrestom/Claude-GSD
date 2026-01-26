---
name: gsd:progress
description: Check project progress from Mosic, show context, and route to next action
allowed-tools:
  - Read
  - Bash
  - ToolSearch
  - mcp__mosic_pro__mosic_get_project
  - mcp__mosic_pro__mosic_get_task_list
  - mcp__mosic_pro__mosic_get_task
  - mcp__mosic_pro__mosic_search_tasks
  - mcp__mosic_pro__mosic_get_entity_pages
  - mcp__mosic_pro__mosic_get_document_relations
  - mcp__mosic_pro__mosic_advanced_search
  - mcp__mosic_pro__mosic_get_related_documents
  - mcp__mosic_pro__mosic_get_relation_stats
  - mcp__mosic_pro__mosic_find_relation_path
  - SlashCommand
---

<objective>
Check project progress from Mosic MCP, summarize recent work and what's ahead, then intelligently route to the next action - either executing an existing plan or creating the next one.

All state is sourced directly from Mosic. The only local file is `config.json` for session context and Mosic entity IDs.
</objective>


<process>

<step name="verify">
**Verify Mosic configuration exists:**

Check if `config.json` exists with Mosic project configured:

```bash
test -f config.json && echo "exists" || echo "missing"
```

**If config.json missing:**

```
No project configuration found.

Run /gsd:new-project to start a new project.
```

Exit.

**If config.json exists, check for Mosic project_id:**

```bash
cat config.json | jq -r '.mosic.project_id // empty'
```

**If project_id is empty or null:**

```
No Mosic project linked.

Run /gsd:new-project to initialize a new project with Mosic integration.
```

Exit.

**Extract Mosic configuration:**

```bash
WORKSPACE_ID=$(cat config.json | jq -r '.mosic.workspace_id')
PROJECT_ID=$(cat config.json | jq -r '.mosic.project_id')
```

Store these for use in Mosic MCP calls.
</step>

<step name="load_from_mosic">
**Load full project context from Mosic:**

### Step 1: Load MCP Tools

```
ToolSearch(query: "+mosic project")
```

Ensure Mosic MCP tools are available before proceeding.

### Step 2: Fetch Project Overview

```
project = mosic_get_project(project_id, {
  include_task_lists: true,
  include_comments: true
})
```

Extract:
- `project.title` - Project name
- `project.description` - Project description
- `project.status` - Current status (Backlog, In Progress, Completed, etc.)
- `project.task_lists` - All phases (MTask Lists)
- `project.done` - Overall completion flag

### Step 3: Get Project Documentation Pages

```
project_pages = mosic_get_entity_pages("MProject", project_id, {
  include_subtree: false,
  include_content: false
})
```

Identify key pages:
- Overview page (page_type: "Document", title contains "Overview")
- Requirements page (page_type: "Spec", title contains "Requirements")
- Roadmap page (page_type: "Spec", title contains "Roadmap")

### Step 4: Fetch All Tasks Across Project

```
all_tasks = mosic_search_tasks({
  workspace_id: workspace_id,
  project_id: project_id,
  limit: 200
})
```

Group tasks by status:
```
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
```

### Step 5: Get Blocked Task Details

```
blocked_tasks = all_tasks.filter(t => t.status == "Blocked")

FOR each blocked_task:
  relations = mosic_get_document_relations("MTask", blocked_task.name, {
    relation_types: ["Blocker"]
  })
  blocked_task.blockers = relations.incoming
```

### Step 6: Calculate Phase-Level Progress

```
phase_stats = []

FOR each task_list in project.task_lists:
  # Get tasks for this phase
  phase_tasks = mosic_search_tasks({
    workspace_id: workspace_id,
    task_list_id: task_list.name,
    limit: 100
  })

  total = phase_tasks.length
  completed = phase_tasks.filter(t => t.done).length
  in_progress = phase_tasks.filter(t => t.status == "In Progress").length
  blocked = phase_tasks.filter(t => t.status == "Blocked").length

  # Get phase pages
  phase_pages = mosic_get_entity_pages("MTask List", task_list.name)

  phase_stat = {
    task_list_id: task_list.name,
    name: task_list.title,
    description: task_list.description,
    done: task_list.done,
    total: total,
    completed: completed,
    in_progress: in_progress,
    blocked: blocked,
    progress_pct: total > 0 ? Math.round(completed / total * 100) : 0,
    has_research: phase_pages.find(p => p.title.includes("Research")),
    has_plan: total > 0,  # Phase has planned tasks
    has_verification: phase_pages.find(p => p.title.includes("Verification")),
    has_uat: phase_pages.find(p => p.title.includes("UAT"))
  }

  phase_stats.push(phase_stat)
```

### Step 7: Identify Current Phase

```
# Current phase = first non-completed phase with work to do
current_phase = phase_stats.find(p => !p.done && (p.in_progress > 0 || p.completed < p.total))

# If no active phase, find first phase that needs planning
IF current_phase is null:
  current_phase = phase_stats.find(p => !p.done)
```

### Step 8: Get Recent Activity (Cross-Session Completions)

```
# Get tasks completed recently (last 7 days)
seven_days_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

recent_completions = mosic_advanced_search({
  workspace_id: workspace_id,
  doctypes: ["MTask"],
  filters: {
    project: project_id,
    done: true,
    modified: [">=", seven_days_ago]
  },
  limit: 10
})
```

### Step 9: Get Relation Insights

```
# Find blocking chains for blocked tasks
FOR each blocked_task in blocked_tasks:
  path = mosic_find_relation_path({
    from_doctype: "MTask",
    from_docname: blocked_task.name,
    to_doctype: "MTask List",
    to_docname: current_phase.task_list_id,
    relation_types: ["Blocker", "Depends"],
    max_depth: 5
  })
  blocked_task.resolution_path = path
```
</step>

<step name="calculate_progress">
**Calculate overall progress:**

```
total_tasks = all_tasks.length
completed_tasks = task_by_status["Completed"].length
in_progress_tasks = task_by_status["In Progress"].length
blocked_count = task_by_status["Blocked"].length

progress_pct = total_tasks > 0 ? Math.round(completed_tasks / total_tasks * 100) : 0

# Visual progress bar (10 segments)
filled = Math.round(progress_pct / 10)
progress_bar = "█".repeat(filled) + "░".repeat(10 - filled)

# Count phases
total_phases = phase_stats.length
completed_phases = phase_stats.filter(p => p.done).length
```
</step>

<step name="report">
**Present rich status report:**

```
# [Project Name]

**Progress:** [[progress_bar]] [completed_tasks]/[total_tasks] tasks ([progress_pct]%)
**Phases:** [completed_phases]/[total_phases] complete
**Mosic:** https://mosic.pro/app/Project/[project_id]

## Phase Overview

| # | Phase | Progress | Status |
|---|-------|----------|--------|
| 1 | [Phase 1 name] | [██████████] 100% | ✓ Complete |
| 2 | [Phase 2 name] | [████░░░░░░] 40% | In Progress |
| 3 | [Phase 3 name] | [░░░░░░░░░░] 0% | Pending |

## Current Position

**Phase [N]:** [phase-name]
- [X] tasks completed
- [Y] tasks in progress
- [Z] tasks remaining

[IF blocked_count > 0:]
## Blocked Tasks

- **[task_title]** — Blocked by: [blocker_info]
  Resolution path: [path if available]
[END IF]

[IF recent_completions.length > 0:]
## Recent Completions

- [task_title] — completed [relative_time]
- [task_title] — completed [relative_time]
[END IF]

## What's Next

[Next action based on routing logic]
```
</step>

<step name="route">
**Determine next action based on Mosic task states.**

### Step 1: Analyze Current Phase Status

From `current_phase` calculated earlier:

```
has_unexecuted_tasks = current_phase.total > 0 && current_phase.completed < current_phase.total
has_in_progress = current_phase.in_progress > 0
needs_planning = current_phase.total == 0
phase_complete = current_phase.done || (current_phase.total > 0 && current_phase.completed == current_phase.total)
```

### Step 2: Check for UAT Gaps

```
# Check if phase has UAT page with diagnosed gaps
uat_page = phase_pages.find(p => p.title.includes("UAT"))

IF uat_page:
  uat_content = mosic_get_page(uat_page.name, { content_format: "plain" })
  has_uat_gaps = uat_content.includes("status: diagnosed") || uat_content.includes("gaps:")
```

### Step 3: Route Based on State

| Condition | Meaning | Route |
|-----------|---------|-------|
| `has_uat_gaps` | UAT gaps need fix plans | **Route E** |
| `has_in_progress` | Work in progress | **Route A-1** (continue execution) |
| `has_unexecuted_tasks && !has_in_progress` | Pending tasks exist | **Route A-2** (start execution) |
| `needs_planning` | Phase has no tasks | **Route B** |
| `phase_complete && more_phases` | Phase done, more remain | **Route C** |
| `phase_complete && !more_phases` | All phases done | **Route D** |
| `!current_phase` | Between milestones | **Route F** |

---

**Route A-1: Work in progress**

Find the in-progress task:

```
in_progress_task = phase_tasks.find(t => t.status == "In Progress")
```

```
---

## ▶ Continue Work

**[phase-name] — [task_title]** (In Progress)

Task: https://mosic.pro/app/MTask/[task_id]

`/gsd:execute-phase [phase-number]`

<sub>`/clear` first → fresh context window</sub>

---
```

---

**Route A-2: Unexecuted tasks exist**

Find the first pending task:

```
next_task = phase_tasks.find(t => t.status == "Backlog" || t.status == "ToDo")
```

```
---

## ▶ Next Up

**[phase-name] — [task_title]** (Ready to execute)

Task: https://mosic.pro/app/MTask/[task_id]

`/gsd:execute-phase [phase-number]`

<sub>`/clear` first → fresh context window</sub>

---
```

---

**Route B: Phase needs planning**

Check for research page:

```
has_research = phase_pages.find(p => p.title.includes("Research"))
```

**If research exists:**

```
---

## ▶ Next Up

**Phase [N]: [Name]** — [Goal from phase description]
<sub>✓ Research complete, ready to plan</sub>

`/gsd:plan-phase [phase-number]`

<sub>`/clear` first → fresh context window</sub>

---
```

**If NO research:**

```
---

## ▶ Next Up

**Phase [N]: [Name]** — [Goal from phase description]

`/gsd:discuss-phase [phase-number]` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase [phase-number]` — skip discussion, plan directly
- `/gsd:research-phase [phase-number]` — deep dive research first

---
```

---

**Route C: Phase complete, more phases remain**

Find next phase:

```
next_phase = phase_stats.find(p => !p.done && p != current_phase)
```

```
---

## ✓ Phase [N] Complete

All [X] tasks completed.

## ▶ Next Up

**Phase [N+1]: [Name]** — [Goal from phase description]

`/gsd:discuss-phase [N+1]` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase [N+1]` — skip discussion, plan directly
- `/gsd:verify-work [N]` — user acceptance test before continuing

---
```

---

**Route D: All phases complete (Milestone complete)**

```
---

## Milestone Complete

All [N] phases finished!

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

**Route E: UAT gaps need fix plans**

```
---

## ⚠ UAT Gaps Found

**Phase [N] UAT** has gaps requiring fixes.

View: https://mosic.pro/app/page/[uat_page_id]

`/gsd:plan-phase [phase-number] --gaps`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:execute-phase [phase-number]` — execute existing fix tasks
- `/gsd:verify-work [phase-number]` — run more UAT testing

---
```

---

**Route F: Between milestones (no current phase)**

```
---

## ✓ Milestone Complete

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

- **Blocked tasks exist:** Highlight blockers prominently before suggesting next action
- **Multiple in-progress tasks:** List all, suggest focusing on one
- **Phase has both pending and in-progress:** Prioritize continuing in-progress work
- **Mosic connection fails:** Display error with cached info from config.json if available
- **Project archived:** Suggest creating new milestone or unarchiving

**Error handling:**

```
IF Mosic API call fails:
  Display:
  ---
  ⚠ Mosic connection failed

  Error: [error message]

  Check:
  - Network connectivity
  - Mosic MCP server status
  - Project still exists: https://mosic.pro/app/Project/[project_id]
  ---
```
</step>

</process>

<success_criteria>

- [ ] config.json checked for mosic.project_id
- [ ] Project context loaded entirely from Mosic MCP
- [ ] Phase progress calculated from Mosic task completion states
- [ ] Current phase identified from live Mosic data
- [ ] Blocked tasks identified with blocker relations
- [ ] Recent completions shown (cross-session awareness)
- [ ] Visual progress bar and statistics displayed
- [ ] Mosic project URL provided for quick access
- [ ] Smart routing based on Mosic task states:
  - Route A: Unexecuted tasks → /gsd:execute-phase
  - Route B: No tasks in phase → /gsd:plan-phase or /gsd:discuss-phase
  - Route C: Phase complete, more remain → next phase
  - Route D: All complete → /gsd:complete-milestone
  - Route E: UAT gaps → /gsd:plan-phase --gaps
  - Route F: Between milestones → /gsd:new-milestone
- [ ] No references to local .planning/ directory (except config.json)
- [ ] User confirms before any action

</success_criteria>
