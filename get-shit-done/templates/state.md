# Project State Page Content Pattern

Content structure for the MProject's linked state page in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "Project State", icon: "lucide:activity" })`
**Page Type:** Document
**Icon:** lucide:activity
**Tags:** ["gsd-managed", "state"]

---

## Content Structure

```markdown
# Project State

## Project Reference

**Core value:** [One-liner from project description]
**Current focus:** [Current phase name]

## Current Position

Phase: [X] of [Y] ([Phase name])
Plan: [A] of [B] in current phase
Status: [Ready to plan / Planning / Ready to execute / In progress / Phase complete]
Last activity: [YYYY-MM-DD] — [What happened]

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: [N]
- Average duration: [X] min
- Total execution time: [X.X] hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: [durations]
- Trend: [Improving / Stable / Degrading]

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions logged in project Key Decisions. Recent decisions affecting current work:

- [Phase X]: [Decision summary]
- [Phase Y]: [Decision summary]

### Pending Todos

[Ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: [YYYY-MM-DD HH:MM]
Stopped at: [Description of last completed action]
Resume context: [Reference to continuation page if exists, otherwise "None"]
```

---

<purpose>

The Project State page is the project's short-term memory spanning all phases and sessions.

**Problem it solves:** Information is captured in summaries, issues, and decisions but not systematically consumed. Sessions start without context.

**Solution:** A single page that's:
- Read first in every workflow via `mosic_get_entity_pages("MProject", project_id)`
- Updated after every significant action via `mosic_update_content_blocks`
- Contains digest of accumulated context
- Enables instant session restoration

</purpose>

<lifecycle>

**Creation:** After project roadmap is created (during init)
- Reference project description (read via `mosic_get_project`)
- Initialize empty accumulated context sections
- Set position to "Phase 1 ready to plan"

**Reading:** First step of every workflow
- progress: Present status to user
- plan: Inform planning decisions
- execute: Know current position
- transition: Know what's complete

**Writing:** After every significant action via `mosic_update_content_blocks`
- execute: After task summary created
  - Update position (phase, plan, status)
  - Note new decisions
  - Add blockers/concerns
- transition: After phase marked complete
  - Update progress bar
  - Clear resolved blockers
  - Refresh Project Reference date

</lifecycle>

<sections>

### Project Reference
Points to project overview for full context. Includes:
- Core value (the ONE thing that matters)
- Current focus (which phase)
- Last update date (triggers re-read if stale)

Load project context via `mosic_get_project(project_id)`.

### Current Position
Where we are right now:
- Phase X of Y — which phase
- Plan A of B — which plan within phase
- Status — current state
- Last activity — what happened most recently
- Progress bar — visual indicator of overall completion

Progress calculation: (completed plans) / (total plans across all phases) × 100%

### Performance Metrics
Track velocity to understand execution patterns:
- Total plans completed
- Average duration per plan
- Per-phase breakdown
- Recent trend (improving/stable/degrading)

Updated after each plan completion.

### Accumulated Context

**Decisions:** Reference to project Key Decisions, plus recent decisions summary for quick access.

**Pending Todos:** Ideas captured via quick tasks
- Count of pending todos
- Brief list if few, count if many

**Blockers/Concerns:** From "Next Phase Readiness" sections
- Issues that affect future work
- Prefix with originating phase
- Cleared when addressed

### Session Continuity
Enables instant resumption:
- When was last session
- What was last completed
- Is there a continuation context page to resume from

</sections>

<size_constraint>

Keep state page content concise.

It's a DIGEST, not an archive. If accumulated context grows too large:
- Keep only 3-5 recent decisions in summary
- Keep only active blockers, remove resolved ones

The goal is "read once, know where we are" — if it's too long, that fails.

</size_constraint>

<mosic_operations>

**Read state:**
```javascript
const pages = await mosic_get_entity_pages("MProject", project_id);
const statePage = pages.find(p => p.title === "Project State");
const content = await mosic_get_page(statePage.name, { content_format: "markdown" });
```

**Update state:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: [{ type: "paragraph", content: "Updated content" }]
});
```

**Derive state from live data:**
```javascript
// Get task completion status
const tasks = await mosic_search_tasks({
  project_id,
  status__in: ["In Progress", "Blocked"]
});

// Calculate phase progress
const phase = await mosic_get_task_list(task_list_id, { include_tasks: true });
const progress = phase.tasks.filter(t => t.done).length / phase.tasks.length;
```

</mosic_operations>
