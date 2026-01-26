# Plan Task Content Pattern

Content structure for executable plan tasks (MTasks) in Mosic.

**Created via:** `mosic_create_document("MTask", { title: "[Phase]-[Plan] Plan", task_list: phase_task_list_id })`
**Entity:** MTask (with linked M Page for detailed plan content)
**Icon:** lucide:file-text
**Tags:** ["gsd-managed", "plan", "phase-XX"]

> **Note:** Planning methodology is in `agents/gsd-planner.md`.
> This template defines the MTask + M Page structure for executable plans.

---

## MTask Fields

| Field | Value |
|-------|-------|
| `title` | `[Phase]-[Plan] Plan: [Brief description]` |
| `description` | Objective and key deliverables (brief) |
| `task_list` | Phase MTask List ID |
| `priority` | Medium (default) or High for critical path |
| `check_list` | Acceptance criteria as checklist items |
| `status` | Open → In Progress → Completed |

## Linked M Page Content Structure

```markdown
# [Phase]-[Plan] Plan

**Objective:** [What this plan accomplishes]
**Purpose:** [Why this matters for the project]
**Output:** [What artifacts will be created]

## Context References

- Project overview and requirements
- Prior plan summaries (if this plan depends on them)
- Relevant source files in codebase

## Tasks

### Task 1: [Action-oriented name]

**Files:** `path/to/file.ext`, `another/file.ext`

**Action:**
[Specific implementation - what to do, how to do it, what to avoid and WHY]

**Verify:** [Command or check to prove it worked]

**Done:** [Measurable acceptance criteria]

---

### Task 2: [Action-oriented name]

**Files:** `path/to/file.ext`

**Action:**
[Specific implementation]

**Verify:** [Command or check]

**Done:** [Acceptance criteria]

---

### Task 3: [Checkpoint if needed]

**Type:** checkpoint:human-verify

**What was built:** [What Claude built] - server running at [URL]

**How to verify:** Visit [URL] and verify: [visual checks only]

**Resume signal:** Type "approved" or describe issues

---

## Verification

Before declaring plan complete:
- [ ] [Specific test command]
- [ ] [Build/type check passes]
- [ ] [Behavior verification]

## Success Criteria

- All tasks completed
- All verification checks pass
- No errors or warnings introduced
- [Plan-specific criteria]

## Must-Haves (Goal-Backward Verification)

**Observable Truths:**
- [Truth that must be verifiable after execution]
- [Another observable behavior]

**Required Artifacts:**
- `path/to/file.ts` - [What it provides]
- `path/to/another.ts` - [What it provides]

**Key Links:**
- From `component.tsx` to `/api/endpoint` via fetch call
- From API route to database via prisma query
```

---

## Parallel Execution Support

**Wave assignment:** Plans are grouped into execution waves based on dependencies.

```
Wave 1: Plans 01, 02, 03 (no dependencies, parallel)
Wave 2: Plans 04, 05 (depend on Wave 1, parallel)
Wave 3: Plan 06 (depends on Wave 2, sequential)
```

**Dependency tracking via M Relations:**
```javascript
// Mark plan dependency
await mosic_create_document("M Relation", {
  from_doctype: "MTask",
  from_name: plan_04_id,
  to_doctype: "MTask",
  to_name: plan_01_id,
  relation_type: "Depends"
});
```

**File conflict detection:** Plans modifying same files cannot run in parallel.

---

## Task Types

| Type | Use For | Behavior |
|------|---------|----------|
| Standard | Everything Claude can do independently | Fully autonomous |
| `checkpoint:human-verify` | Visual/functional verification | Pauses, awaits user response |
| `checkpoint:decision` | Implementation choices | Pauses, presents options |
| `checkpoint:human-action` | Truly unavoidable manual steps (rare) | Pauses for user action |

---

## Scope Guidance

**Plan sizing:**
- 2-3 tasks per plan
- ~50% context usage maximum
- Complex phases: Multiple focused plans, not one large plan

**When to split:**
- Different subsystems (auth vs API vs UI)
- >3 tasks
- Risk of context overflow
- TDD candidates - separate plans

**Vertical slices preferred:**
```
PREFER: Plan 01 = User (model + API + UI)
        Plan 02 = Product (model + API + UI)

AVOID:  Plan 01 = All models
        Plan 02 = All APIs
        Plan 03 = All UIs
```

---

## User Setup (External Services)

When a plan introduces external services requiring human configuration:

**MTask checklist includes:**
- [ ] Configure [service] API keys in environment
- [ ] Set up [service] webhook endpoint
- [ ] Verify [service] connection

**Linked M Page documents:**
```markdown
## User Setup Required

### Environment Variables

| Variable | Source |
|----------|--------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Signing secret |

### Dashboard Configuration

1. **Create webhook endpoint**
   - Location: Stripe Dashboard → Developers → Webhooks
   - URL: `https://[your-domain]/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`

### Verification

```bash
# Check env vars are set
grep STRIPE .env.local

# Verify build passes
npm run build
```
```

---

<mosic_operations>

**Create plan task:**
```javascript
// Create MTask for the plan
const task = await mosic_create_document("MTask", {
  title: `${phase}-${plan} Plan: ${description}`,
  description: objective,
  task_list: task_list_id,
  workspace: workspace_id,
  priority: "Medium",
  check_list: [
    { title: "Task 1 complete", checked: false },
    { title: "Task 2 complete", checked: false },
    { title: "Verification passes", checked: false }
  ]
});

// Create linked page with detailed plan content
await mosic_create_entity_page("MTask", task.name, {
  title: `${phase}-${plan} Plan Details`,
  icon: "lucide:file-text",
  content: planContent,
  page_type: "Document"
});

// Add tags
await mosic_batch_add_tags_to_document("MTask", task.name, {
  workspace_id,
  tags: ["gsd-managed", "plan", `phase-${phase}`, `wave-${wave}`]
});
```

**Track dependencies:**
```javascript
// Create dependency relation
await mosic_create_document("M Relation", {
  from_doctype: "MTask",
  from_name: dependent_plan_id,
  to_doctype: "MTask",
  to_name: prerequisite_plan_id,
  relation_type: "Depends"
});
```

**Get plan for execution:**
```javascript
const task = await mosic_get_task(task_id, { description_format: "markdown" });
const pages = await mosic_get_entity_pages("MTask", task_id);
const planPage = pages.find(p => p.title.includes("Plan Details"));
const content = await mosic_get_page(planPage.name, { content_format: "markdown" });
```

**Mark plan complete:**
```javascript
await mosic_complete_task(task_id);
```

</mosic_operations>

<guidelines>

- Always use structured content for Claude parsing
- Include wave assignment for parallel execution
- Track dependencies via M Relations
- Prefer vertical slices over horizontal layers
- 2-3 tasks per plan, ~50% context max
- Group checkpoints with related tasks in same plan

</guidelines>
