# Roadmap Page Content Pattern

Content structure for the MProject's roadmap documentation page in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "Roadmap", icon: "lucide:map" })`
**Page Type:** Document
**Icon:** lucide:map
**Tags:** ["gsd-managed", "roadmap"]

---

## Content Structure (Initial Roadmap v1.0)

```markdown
# Roadmap: [Project Name]

## Overview

[One paragraph describing the journey from start to finish]

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: [Name]** - [One-line description]
- [ ] **Phase 2: [Name]** - [One-line description]
- [ ] **Phase 3: [Name]** - [One-line description]
- [ ] **Phase 4: [Name]** - [One-line description]

## Phase Details

### Phase 1: [Name]
**Goal**: [What this phase delivers]
**Depends on**: Nothing (first phase)
**Requirements**: [REQ-01, REQ-02, REQ-03]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
  3. [Observable behavior from user perspective]
**Task List:** [Link to MTask List in Mosic]

### Phase 2: [Name]
**Goal**: [What this phase delivers]
**Depends on**: Phase 1
**Requirements**: [REQ-04, REQ-05]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
**Task List:** [Link to MTask List]

### Phase 2.1: Critical Fix (INSERTED)
**Goal**: [Urgent work inserted between phases]
**Depends on**: Phase 2
**Success Criteria** (what must be TRUE):
  1. [What the fix achieves]
**Task List:** [Link to MTask List]

### Phase 3: [Name]
**Goal**: [What this phase delivers]
**Depends on**: Phase 2
**Requirements**: [REQ-06, REQ-07, REQ-08]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
  3. [Observable behavior from user perspective]
**Task List:** [Link to MTask List]

## Progress

**Execution Order:**
Phases execute in numeric order: 2 → 2.1 → 2.2 → 3 → 3.1 → 4

| Phase | Tasks Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. [Name] | 0/3 | Not started | - |
| 2. [Name] | 0/2 | Not started | - |
| 3. [Name] | 0/2 | Not started | - |
| 4. [Name] | 0/1 | Not started | - |
```

---

<guidelines>

**Initial planning (v1.0):**
- Phase count depends on depth setting (quick: 3-5, standard: 5-8, comprehensive: 8-12)
- Each phase delivers something coherent
- Each phase corresponds to an MTask List in Mosic
- Tasks within phases are MTasks in the corresponding MTask List
- No time estimates (this isn't enterprise PM)
- Progress derived from MTask completion status

**Success criteria:**
- 2-5 observable behaviors per phase (from user's perspective)
- Cross-checked against requirements during roadmap creation
- Flow downstream to `must_haves` in task planning
- Verified after execution
- Format: "User can [action]" or "[Thing] works/exists"

**After milestones ship:**
- Collapse completed milestones in summary section
- Add new milestone sections for upcoming work
- Keep continuous phase numbering (never restart at 01)

</guidelines>

<status_values>
- `Not started` - Haven't begun
- `In progress` - Currently working
- `Complete` - Done (add completion date)
- `Deferred` - Pushed to later (with reason)
</status_values>

---

## Milestone-Grouped Roadmap (After v1.0 Ships)

After completing first milestone, reorganize with milestone groupings:

```markdown
# Roadmap: [Project Name]

## Milestones

- **v1.0 MVP** - Phases 1-4 (shipped YYYY-MM-DD)
- **v1.1 [Name]** - Phases 5-6 (in progress)
- **v2.0 [Name]** - Phases 7-10 (planned)

## Phases

### v1.0 MVP (Phases 1-4) - SHIPPED YYYY-MM-DD

[Summary of completed phases]

### v1.1 [Name] (In Progress)

**Milestone Goal:** [What v1.1 delivers]

#### Phase 5: [Name]
**Goal**: [What this phase delivers]
**Depends on**: Phase 4
**Task List:** [Link to MTask List]

[... remaining v1.1 phases ...]

### v2.0 [Name] (Planned)

**Milestone Goal:** [What v2.0 delivers]

[... v2.0 phases ...]

## Progress

| Phase | Milestone | Tasks Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | YYYY-MM-DD |
| 2. Features | v1.0 | 2/2 | Complete | YYYY-MM-DD |
| 5. Security | v1.1 | 0/2 | Not started | - |
```

**Notes:**
- Milestone status: shipped, in progress, planned
- Completed milestones summarized
- Current/future milestones expanded
- Continuous phase numbering (01-99)
- Progress table includes milestone column

---

<mosic_operations>

**Create roadmap page:**
```javascript
await mosic_create_entity_page("MProject", project_id, {
  title: "Roadmap",
  icon: "lucide:map",
  content: roadmapContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "roadmap"]
});
```

**Create phase (MTask List):**
```javascript
await mosic_create_document("MTask List", {
  title: `Phase ${num}: ${name}`,
  description: phaseGoal,
  project: project_id,
  workspace: workspace_id,
  prefix: `P${num}`
});
```

**Get roadmap progress from live data:**
```javascript
// Get all task lists (phases) for project
const project = await mosic_get_project(project_id, { include_task_lists: true });

// Calculate progress per phase
for (const taskList of project.task_lists) {
  const phase = await mosic_get_task_list(taskList.name, { include_tasks: true });
  const complete = phase.tasks.filter(t => t.done).length;
  const total = phase.tasks.length;
  console.log(`${taskList.title}: ${complete}/${total}`);
}
```

**Update roadmap page:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

</mosic_operations>

<mosic_hierarchy>

The roadmap maps to Mosic hierarchy as follows:

```
MProject (GSD Project)
├── M Page: Roadmap (this document)
├── M Page: Project State
├── M Page: Requirements
│
├── MTask List: Phase 1 (01-foundation)
│   ├── MTask: Plan 01-01
│   ├── MTask: Plan 01-02
│   └── M Page: Phase 1 Summary
│
├── MTask List: Phase 2 (02-features)
│   ├── MTask: Plan 02-01
│   └── M Page: Phase 2 Summary
│
└── MTask List: Phase 3 (03-polish)
    ├── MTask: Plan 03-01
    └── M Page: Phase 3 Summary
```

</mosic_hierarchy>
