# Milestone Entry Page Content Pattern

Content structure for milestone completion documentation in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "v[X.Y] [Name] Milestone", icon: "lucide:flag" })`
**Page Type:** Document
**Icon:** lucide:flag
**Tags:** ["gsd-managed", "milestone", "v1.0"]

---

## Content Structure

```markdown
# v[X.Y] [Name] Milestone

**Status:** SHIPPED [YYYY-MM-DD]
**Phases completed:** [X-Y] ([Z] plans total)

## Delivered

[One sentence describing what shipped]

## Key Accomplishments

- [Major achievement 1]
- [Major achievement 2]
- [Major achievement 3]
- [Major achievement 4]

## Stats

- **Files created/modified:** [X]
- **Lines of code:** [Y] (primary language)
- **Phases:** [Z], Plans: [N], Tasks: [M]
- **Duration:** [D] days from start to ship

## Git Range

`feat(XX-XX)` → `feat(YY-YY)`

## What's Next

[Brief description of next milestone goals, or "Project complete"]

---
*Milestone completed: [date]*
```

---

<guidelines>

**When to create milestones:**
- Initial v1.0 MVP shipped
- Major version releases (v2.0, v3.0)
- Significant feature milestones (v1.1, v1.2)
- Before archiving planning (capture what was shipped)

**Don't create milestones for:**
- Individual phase completions (normal workflow)
- Work in progress (wait until shipped)
- Minor bug fixes that don't constitute a release

**Stats to include:**
- Count modified files: `git diff --stat feat(XX-XX)..feat(YY-YY) | tail -1`
- Count LOC: `find . -name "*.ts" -o -name "*.tsx" | xargs wc -l`
- Phase/plan/task counts from project structure
- Timeline from first phase commit to last phase commit

**Git range format:**
- First commit of milestone → last commit of milestone
- Example: `feat(01-01)` → `feat(04-01)` for phases 1-4

</guidelines>

<example>

```markdown
# v1.1 Security & Polish Milestone

**Status:** SHIPPED 2025-12-10
**Phases completed:** 5-6 (3 plans total)

## Delivered

Security hardening with Keychain integration and comprehensive error handling.

## Key Accomplishments

- Migrated API key storage from plaintext to macOS Keychain
- Implemented comprehensive error handling for network failures
- Added Sentry crash reporting integration
- Fixed memory leak in auto-refresh timer

## Stats

- **Files created/modified:** 23
- **Lines of code:** 650 (Swift)
- **Phases:** 2, Plans: 3, Tasks: 12
- **Duration:** 8 days from v1.0 to v1.1

## Git Range

`feat(05-01)` → `feat(06-02)`

## What's Next

v2.0 SwiftUI redesign with widget support

---
*Milestone completed: 2025-12-10*
```

</example>

<mosic_operations>

**Create milestone page:**
```javascript
await mosic_create_entity_page("MProject", project_id, {
  title: `v${version} ${name} Milestone`,
  icon: "lucide:flag",
  content: milestoneContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "milestone", `v${version}`]
});
```

**Link milestone to completed phases:**
```javascript
// Create relations to completed task lists
for (const taskListId of completedPhases) {
  await mosic_create_document("M Relation", {
    from_doctype: "M Page",
    from_name: milestone_page_id,
    to_doctype: "MTask List",
    to_name: taskListId,
    relation_type: "Related"
  });
}
```

**Query milestones:**
```javascript
const pages = await mosic_search_documents_by_tags({
  workspace_id,
  tags: ["milestone"],
  doctype: "M Page"
});
```

**Update project after milestone:**
```javascript
// Update roadmap page with milestone completion
const roadmapPages = await mosic_get_entity_pages("MProject", project_id);
const roadmap = roadmapPages.find(p => p.title === "Roadmap");
await mosic_update_content_blocks(roadmap.name, {
  blocks: updatedRoadmapContent
});
```

</mosic_operations>

<project_milestones_page>

If tracking multiple milestones, create a Project Milestones index page:

```markdown
# Project Milestones: [Project Name]

## Released

### v1.1 Security & Polish (Shipped: 2025-12-10)
Security hardening with Keychain integration and comprehensive error handling.
[View milestone details →](mosic://page/milestone-page-id)

### v1.0 MVP (Shipped: 2025-11-25)
Menu bar weather app with current conditions and 3-day forecast.
[View milestone details →](mosic://page/milestone-page-id)

## Upcoming

### v2.0 SwiftUI Redesign (Planned)
Complete UI rewrite with SwiftUI and widget support.
```

</project_milestones_page>
