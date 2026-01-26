# Milestone Archive Page Content Pattern

Content structure for comprehensive milestone archive documentation in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "v[X.Y] [Name] Archive", icon: "lucide:archive" })`
**Page Type:** Document
**Icon:** lucide:archive
**Tags:** ["gsd-managed", "milestone-archive", "v1.0"]

---

## Content Structure

```markdown
# Milestone v[VERSION]: [MILESTONE_NAME] Archive

**Status:** SHIPPED [DATE]
**Phases:** [PHASE_START]-[PHASE_END]
**Total Plans:** [TOTAL_PLANS]

## Overview

[MILESTONE_DESCRIPTION]

## Phases

### Phase [PHASE_NUM]: [PHASE_NAME]

**Goal**: [PHASE_GOAL]
**Depends on**: [DEPENDS_ON]
**Plans completed:** [PLAN_COUNT]

**Plans:**
- [x] [PHASE]-01: [PLAN_DESCRIPTION]
- [x] [PHASE]-02: [PLAN_DESCRIPTION]

**Summary:** [Brief phase summary from phase summary page]

---

### Phase [PHASE_NUM].1: [PHASE_NAME] (INSERTED)

**Goal**: [Urgent work inserted between phases]
**Depends on**: Phase [N]
**Plans completed:** 1

**Plans:**
- [x] [PHASE].1-01: [Description]

**Summary:** [Brief summary]

---

[... continue for all phases in milestone ...]

## Milestone Summary

### Decimal Phases

- Phase 2.1: Critical Security Patch (inserted after Phase 2 for urgent fix)
- Phase 5.1: Performance Hotfix (inserted after Phase 5 for production issue)

### Key Decisions

[Decisions made during this milestone:]

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| [Choice] | [Why] | [Result] |

### Issues Resolved

- [Issue resolved during milestone]
- [Another issue resolved]

### Issues Deferred

- [Issue] (deferred to [when/why])

### Technical Debt Incurred

- [Shortcut taken] (needs addressing in [future phase])

---
*Archived: [date]*
```

---

<guidelines>

**When to create milestone archives:**
- After completing all phases in a milestone (v1.0, v1.1, v2.0, etc.)
- Triggered by complete-milestone workflow
- Before planning next milestone work

**How to populate:**
- Extract phase details from MTask Lists
- Gather decisions from project overview and phase summaries
- Document decimal phases with (INSERTED) marker
- List issues resolved vs deferred
- Capture technical debt for future reference

**After archiving:**
- Update Roadmap page to show milestone as complete
- Update Project Overview with milestone accomplishments
- Continue phase numbering in next milestone (never restart at 01)

</guidelines>

<mosic_operations>

**Create milestone archive:**
```javascript
await mosic_create_entity_page("MProject", project_id, {
  title: `v${version} ${name} Archive`,
  icon: "lucide:archive",
  content: archiveContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "milestone-archive", `v${version}`]
});
```

**Gather milestone data:**
```javascript
// Get all phases (task lists) in milestone range
const project = await mosic_get_project(project_id, { include_task_lists: true });
const milestonePhases = project.task_lists.filter(tl => {
  const phaseNum = parseInt(tl.title.match(/Phase (\d+)/)?.[1] || 0);
  return phaseNum >= startPhase && phaseNum <= endPhase;
});

// Get summaries for each phase
for (const phase of milestonePhases) {
  const pages = await mosic_get_entity_pages("MTask List", phase.name);
  const summary = pages.find(p => p.title.includes("Summary"));
  // Include summary content in archive
}
```

**Link archive to phases:**
```javascript
// Create relations to archived task lists
for (const phase of milestonePhases) {
  await mosic_create_document("M Relation", {
    from_doctype: "M Page",
    from_name: archive_page_id,
    to_doctype: "MTask List",
    to_name: phase.name,
    relation_type: "Related"
  });
}
```

**Update roadmap after archive:**
```javascript
// Mark milestone as shipped in roadmap page
const pages = await mosic_get_entity_pages("MProject", project_id);
const roadmap = pages.find(p => p.title === "Roadmap");
await mosic_update_content_blocks(roadmap.name, {
  blocks: updatedRoadmapWithShippedMilestone
});
```

</mosic_operations>
