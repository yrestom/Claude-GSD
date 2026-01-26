# Continuation Format

Standard format for presenting next steps after completing a command or workflow.

## Core Structure

```
---

## ▶ Next Up

**{identifier}: {name}** — {one-line description}

`{command to copy-paste}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `{alternative option 1}` — description
- `{alternative option 2}` — description

---
```

## Format Rules

1. **Always show what it is** — name + description, never just a command path
2. **Pull context from source** — ROADMAP.md for phases, PLAN.md `<objective>` for plans
3. **Command in inline code** — backticks, easy to copy-paste, renders as clickable link
4. **`/clear` explanation** — always include, keeps it concise but explains why
5. **"Also available" not "Other options"** — sounds more app-like
6. **Visual separators** — `---` above and below to make it stand out

## Variants

### Execute Next Plan

```
---

## ▶ Next Up

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry

`/gsd:execute-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Review plan before executing
- `/gsd:list-phase-assumptions 2` — check assumptions

---
```

### Execute Final Plan in Phase

Add note that this is the last plan and what comes after:

```
---

## ▶ Next Up

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry
<sub>Final plan in Phase 2</sub>

`/gsd:execute-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**After this completes:**
- Phase 2 → Phase 3 transition
- Next: **Phase 3: Core Features** — User dashboard and settings

---
```

### Plan a Phase

```
---

## ▶ Next Up

**Phase 2: Authentication** — JWT login flow with refresh tokens

`/gsd:plan-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:discuss-phase 2` — gather context first
- `/gsd:research-phase 2` — investigate unknowns
- Review roadmap

---
```

### Phase Complete, Ready for Next

Show completion status before next action:

```
---

## ✓ Phase 2 Complete

3/3 plans executed

## ▶ Next Up

**Phase 3: Core Features** — User dashboard, settings, and data export

`/gsd:plan-phase 3`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:discuss-phase 3` — gather context first
- `/gsd:research-phase 3` — investigate unknowns
- Review what Phase 2 built

---
```

### Multiple Equal Options

When there's no clear primary action:

```
---

## ▶ Next Up

**Phase 3: Core Features** — User dashboard, settings, and data export

**To plan directly:** `/gsd:plan-phase 3`

**To discuss context first:** `/gsd:discuss-phase 3`

**To research unknowns:** `/gsd:research-phase 3`

<sub>`/clear` first → fresh context window</sub>

---
```

### Milestone Complete

```
---

## 🎉 Milestone v1.0 Complete

All 4 phases shipped

## ▶ Next Up

**Start v1.1** — questioning → research → requirements → roadmap

`/gsd:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

## Pulling Context

### For phases (from ROADMAP.md):

```markdown
### Phase 2: Authentication
**Goal**: JWT login flow with refresh tokens
```

Extract: `**Phase 2: Authentication** — JWT login flow with refresh tokens`

### For plans (from ROADMAP.md):

```markdown
Plans:
- [ ] 02-03: Add refresh token rotation
```

Or from PLAN.md `<objective>`:

```xml
<objective>
Add refresh token rotation with sliding expiry window.

Purpose: Extend session lifetime without compromising security.
</objective>
```

Extract: `**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry`

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

---

## Mosic Integration

### Entity IDs in Handoff Data

When creating continuation/handoff data, include Mosic entity IDs for cross-session context:

```markdown
---

## ▶ Next Up

**Phase 2: Authentication** — JWT login flow with refresh tokens

`/gsd:plan-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**Mosic Context:**
- Project: `081aca99-8742-4b63-94a2-e5724abfac2f`
- Task List: `[phase-task-list-id]`
- Current Task: `[active-task-id]`

---
```

### Handoff State Sync

Before creating handoff, sync current state to Mosic:

```javascript
// Update task with handoff context
await mosic_update_document("MTask", current_task_id, {
  status: "In Progress",
  description: existing_description + "\n\n---\nHandoff at: " + timestamp
});

// Create handoff page if complex context
await mosic_create_entity_page("MTask", current_task_id, {
  title: "Handoff: " + context_summary,
  page_type: "Note",
  tags: ["handoff", "continuation"]
});
```

### Cross-Session Context Loading

New sessions can load context from Mosic:

```javascript
// Load project state for continuation
const project = await mosic_get_project(project_id, {
  include_task_lists: true
});

const currentPhase = await mosic_get_task_list(task_list_id, {
  include_tasks: true
});

const handoffPages = await mosic_search_documents_by_tags({
  tags: ["handoff"],
  doctypes: ["M Page"],
  parent_doctype: "MTask",
  parent_name: current_task_id
});
```

### Continuation Format with Mosic URLs

Include Mosic URLs for direct access:

```markdown
---

## ▶ Next Up

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry

`/gsd:execute-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- [View in Mosic](https://mosic.pro/app/MTask/[task-id]) — full context and history
- `/gsd:progress` — current state summary

---
```

### Sync Considerations

**Before handoff:**
1. Update MTask status to reflect current state
2. Add any blockers or notes as comments
3. Create handoff page if context is complex

**On resume:**
1. Load fresh state from Mosic (not stale local files)
2. Check for external updates (other agents, manual changes)
3. Verify task is still assigned and not blocked
