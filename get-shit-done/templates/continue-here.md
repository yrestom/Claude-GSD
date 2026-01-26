# Continue-Here Page Content Pattern

Content structure for session resumption tracking in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "Continue Here", icon: "lucide:play-circle" })`
**Page Type:** Document
**Icon:** lucide:play-circle
**Tags:** ["gsd-managed", "continue", "active"]

---

## Content Structure

```markdown
# Continue Here

**Phase:** [XX-name]
**Task:** [current] of [total]
**Status:** in_progress | blocked | almost_done
**Last updated:** [ISO timestamp]

## Current State

[Where exactly are we? What's the immediate context?]

## Completed Work

[What got done this session - be specific]

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done on it]

## Remaining Work

[What's left in this phase]

- Task 3: [name] - [what's left to do]
- Task 4: [name] - Not started
- Task 5: [name] - Not started

## Decisions Made

[Key decisions and why - so next session doesn't re-debate]

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]

## Blockers

[Anything stuck or waiting on external factors]

- [Blocker 1]: [status/workaround]

## Context

[Mental state, "vibe", anything that helps resume smoothly]

[What were you thinking about? What was the plan?
This is the "pick up exactly where you left off" context.]

## Next Action

[The very first thing to do when resuming]

**Start with:** [specific action]
```

---

<guidelines>

**Purpose:** Enable smooth session resumption after context reset.

**When to create:**
- End of session when work is paused mid-task
- When context will be lost (conversation ending)
- User requests handoff capture

**When NOT to create:**
- Work is at natural stopping point (phase complete)
- Project state page is sufficient

**Good content:**
- Be specific enough that a fresh Claude understands immediately
- Include WHY decisions were made, not just what
- The Next Action should be actionable without reading anything else

**Lifecycle:**
- Created at end of session
- Read at start of next session
- Deleted after resume (not permanent storage)
- Or archived if keeping history

</guidelines>

<mosic_operations>

**Create continue-here page:**
```javascript
await mosic_create_entity_page("MProject", project_id, {
  title: "Continue Here",
  icon: "lucide:play-circle",
  content: continueContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "continue", "active"]
});
```

**Read on session start:**
```javascript
const pages = await mosic_get_entity_pages("MProject", project_id);
const continueHere = pages.find(p => p.title === "Continue Here");
if (continueHere) {
  const content = await mosic_get_page(continueHere.name, { content_format: "markdown" });
  // Parse and use for resumption
}
```

**Update during session:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

**Delete after resume:**
```javascript
// Option 1: Delete if no longer needed
await mosic_delete_document("M Page", page_id);

// Option 2: Archive for history
await mosic_remove_tag_from_document("M Page", page_id, {
  workspace_id,
  tag: "active"
});
await mosic_add_tag_to_document("M Page", page_id, {
  workspace_id,
  tag: "archived"
});
```

**Find active continue-here:**
```javascript
const pages = await mosic_search_documents_by_tags({
  workspace_id,
  tags: ["continue", "active"],
  doctype: "M Page"
});
```

</mosic_operations>
