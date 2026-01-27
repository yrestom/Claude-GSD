# Continuation Format

Standard format for presenting next steps after completing a command or workflow. Context is loaded from Mosic, not local files.

## Core Structure

```
---

## Next Up

**{identifier}: {name}** - {one-line description}

`{command to copy-paste}`

<sub>`/clear` first - fresh context window</sub>

---

**Also available:**
- `{alternative option 1}` - description
- `{alternative option 2}` - description

---
```

## Format Rules

1. **Always show what it is** - name + description, never just a command path
2. **Pull context from Mosic** - MTask List title for phases, MTask title/description for plans
3. **Command in inline code** - backticks, easy to copy-paste, renders as clickable link
4. **`/clear` explanation** - always include, keeps it concise but explains why
5. **"Also available" not "Other options"** - sounds more app-like
6. **Visual separators** - `---` above and below to make it stand out

## Mosic Context Loading

### Loading Phase Context

```javascript
// Get phase (task list) details for continuation
const phase = await mosic_get_task_list(config.session.current_phase_id, {
  include_tasks: true
});

// Extract for display
const phaseName = phase.title;
const phaseDescription = phase.description;
const completedTasks = phase.tasks.filter(t => t.done).length;
const totalTasks = phase.tasks.length;
```

### Loading Task Context

```javascript
// Get current task details
const task = await mosic_get_task(config.session.current_task_id, {
  description_format: "markdown"
});

// Get task's plan page for objective
const planPages = await mosic_get_entity_pages("MTask", task.name, {
  tags: ["plan"]
});
const planObjective = planPages[0]?.description || task.description;
```

### Deriving Next Work

```javascript
// Find next pending task in current phase
const phase = await mosic_get_task_list(config.session.current_phase_id, {
  include_tasks: true
});

const nextTask = phase.tasks
  .filter(t => !t.done && t.status !== "Blocked")
  .sort((a, b) => a.idx - b.idx)[0];

// Or find next phase if current is complete
if (!nextTask) {
  const project = await mosic_get_project(config.project_id, {
    include_task_lists: true
  });

  const currentPhaseIdx = project.task_lists.findIndex(
    tl => tl.name === config.session.current_phase_id
  );

  const nextPhase = project.task_lists[currentPhaseIdx + 1];
}
```

## Variants

### Execute Next Plan

```
---

## Next Up

**02-03: Refresh Token Rotation** - Add /api/auth/refresh with sliding expiry

`/gsd:execute-phase 2`

<sub>`/clear` first - fresh context window</sub>

---

**Also available:**
- Review plan before executing
- `/gsd:progress` - check current state

---
```

### Execute Final Plan in Phase

Add note that this is the last plan and what comes after:

```
---

## Next Up

**02-03: Refresh Token Rotation** - Add /api/auth/refresh with sliding expiry
<sub>Final plan in Phase 2</sub>

`/gsd:execute-phase 2`

<sub>`/clear` first - fresh context window</sub>

---

**After this completes:**
- Phase 2 - Phase 3 transition
- Next: **Phase 3: Core Features** - User dashboard and settings

---
```

### Plan a Phase

```
---

## Next Up

**Phase 2: Authentication** - JWT login flow with refresh tokens

`/gsd:plan-phase 2`

<sub>`/clear` first - fresh context window</sub>

---

**Also available:**
- `/gsd:discuss-phase 2` - gather context first
- `/gsd:research-phase 2` - investigate unknowns
- `/gsd:progress` - review roadmap

---
```

### Phase Complete, Ready for Next

Show completion status before next action:

```
---

## Phase 2 Complete

3/3 plans executed

## Next Up

**Phase 3: Core Features** - User dashboard, settings, and data export

`/gsd:plan-phase 3`

<sub>`/clear` first - fresh context window</sub>

---

**Also available:**
- `/gsd:discuss-phase 3` - gather context first
- `/gsd:research-phase 3` - investigate unknowns
- `/gsd:progress` - review what Phase 2 built

---
```

### Multiple Equal Options

When there's no clear primary action:

```
---

## Next Up

**Phase 3: Core Features** - User dashboard, settings, and data export

**To plan directly:** `/gsd:plan-phase 3`

**To discuss context first:** `/gsd:discuss-phase 3`

**To research unknowns:** `/gsd:research-phase 3`

<sub>`/clear` first - fresh context window</sub>

---
```

### Milestone Complete

```
---

## Milestone v1.0 Complete

All 4 phases shipped

## Next Up

**Start v1.1** - questioning - research - requirements - roadmap

`/gsd:new-milestone`

<sub>`/clear` first - fresh context window</sub>

---
```

## Session Context Storage

The only local file is `config.json` which tracks session state:

```json
{
  "workspace_id": "b0dd6682-3b21-4556-aeba-59229d454a27",
  "project_id": "081aca99-8742-4b63-94a2-e5724abfac2f",
  "session": {
    "current_phase_id": "task-list-uuid",
    "current_task_id": "task-uuid",
    "active_plan_number": 2,
    "last_sync": "2024-01-15T10:30:00Z"
  },
  "entity_ids": {
    "task_lists": {
      "phase_1": "uuid-1",
      "phase_2": "uuid-2"
    },
    "tasks": {},
    "pages": {}
  }
}
```

### Before Creating Handoff

Update config.json with current session state:

```javascript
// Save current position before handoff
config.session = {
  current_phase_id: currentPhase.name,
  current_task_id: currentTask?.name || null,
  active_plan_number: planNumber,
  last_sync: new Date().toISOString()
};

// Write to config.json
```

### On Session Resume

Load fresh state from Mosic, not stale config:

```javascript
// Load config for entity IDs
const config = JSON.parse(fs.readFileSync('config.json'));

// Get fresh state from Mosic
const project = await mosic_get_project(config.project_id, {
  include_task_lists: true
});

// Verify session task is still valid
if (config.session.current_task_id) {
  const task = await mosic_get_task(config.session.current_task_id);

  if (task.done || task.status === "Completed") {
    // Task was completed (possibly externally), find next
    config.session.current_task_id = null;
  }
}

// Check for external updates since last sync
const recentActivity = await mosic_search_tasks({
  project_id: config.project_id,
  modified_after: config.session.last_sync
});

if (recentActivity.length > 0) {
  // Warn about external changes
  console.log(`${recentActivity.length} tasks modified since last session`);
}
```

## Handoff Notes in Mosic

For complex handoffs, create a comment on the current task:

```javascript
// Add handoff context as task comment
await mosic_create_document("M Comment", {
  comment_type: "Comment",
  ref_doc: "MTask",
  ref_name: config.session.current_task_id,
  content: `**Session Handoff**

**Status:** ${currentStatus}
**Completed:** ${completedSteps.join(', ')}
**Next:** ${nextStep}
**Context:** ${handoffContext}
**Timestamp:** ${new Date().toISOString()}`
});
```

For major context that needs preservation:

```javascript
// Create handoff page linked to task
const handoffPage = await mosic_create_entity_page("MTask", task_id, {
  title: `Handoff: ${task.title}`,
  page_type: "Note"
});

await mosic_update_content_blocks(handoffPage.name, [{
  type: "paragraph",
  data: {
    text: `## Handoff Context

### Current State
${currentStateDescription}

### Work Completed
${completedWork}

### Pending Items
${pendingItems}

### Key Files Modified
${modifiedFiles.join('\n')}

### Resume Instructions
${resumeInstructions}`
  }
}]);

// Tag for easy finding
await mosic_add_tag_to_document("M Page", handoffPage.name, "handoff");
```

## Cross-Session Context Loading

New sessions load context from Mosic:

```javascript
// Load project overview
const project = await mosic_get_project(config.project_id, {
  include_task_lists: true
});

// Get current phase details
const currentPhase = await mosic_get_task_list(config.session.current_phase_id, {
  include_tasks: true
});

// Check for handoff notes
const handoffPages = await mosic_search_documents_by_tags({
  tags: ["handoff"],
  doctypes: ["M Page"],
  parent_doctype: "MTask",
  parent_name: config.session.current_task_id
});

if (handoffPages.length > 0) {
  // Load handoff context
  const handoff = await mosic_get_page(handoffPages[0].name, {
    content_format: "markdown"
  });
}
```

## Continuation Format with Mosic Context

Include Mosic context in handoff display:

```
---

## Next Up

**02-03: Refresh Token Rotation** - Add /api/auth/refresh with sliding expiry

`/gsd:execute-phase 2`

<sub>`/clear` first - fresh context window</sub>

---

**Mosic Context:**
- Project: GET SHIT DONE (GSD)
- Phase: Authentication (2/3 tasks done)
- [View in Mosic](https://mosic.pro/app/MTask%20List/[phase-id])

**Also available:**
- `/gsd:progress` - current state summary

---
```

## Anti-Patterns

### Don't: Command-only (no context)

```
## To Continue

Run `/clear`, then paste:
/gsd:execute-phase 2
```

User has no idea what 02-03 is about.

### Don't: Missing /clear explanation

```
`/gsd:plan-phase 3`

Run /clear first.
```

Doesn't explain why. User might skip it.

### Don't: "Other options" language

```
Other options:
- Review roadmap
```

Sounds like an afterthought. Use "Also available:" instead.

### Don't: Fenced code blocks for commands

```
```
/gsd:plan-phase 3
```
```

Fenced blocks inside templates create nesting ambiguity. Use inline backticks instead.

### Don't: Reference local files that don't exist

```
Review .planning/ROADMAP.md for phase details
```

There is no local .planning/ directory. All documentation is in Mosic M Pages.

### Don't: Suggest manual file reads for context

```
To continue, first read:
- .planning/STATE.md
- .planning/phases/02-auth/PLAN.md
```

Context comes from Mosic API calls, not local files.

## Correct Patterns

### Do: Load context from Mosic

```javascript
// Get all context needed for continuation
const phase = await mosic_get_task_list(phaseId, { include_tasks: true });
const planPage = await mosic_get_entity_pages("MTask", taskId, { tags: ["plan"] });
```

### Do: Include Mosic links for reference

```
[View phase in Mosic](https://mosic.pro/app/MTask%20List/[id])
```

### Do: Show progress from live data

```javascript
const tasks = phase.tasks || [];
const done = tasks.filter(t => t.done).length;
console.log(`Progress: ${done}/${tasks.length} tasks`);
```
