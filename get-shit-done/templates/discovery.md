# Discovery Page Content Pattern

Content structure for library/option decision research in Mosic.

**Created via:** `mosic_create_entity_page("MTask List", task_list_id, { title: "[Phase] Discovery", icon: "lucide:compass" })`
**Page Type:** Document
**Icon:** lucide:compass
**Tags:** ["gsd-managed", "discovery", "phase-XX"]

**Purpose:** Answer "which library/option should we use" questions during mandatory discovery in plan-phase. For deep ecosystem research ("how do experts build this"), use research.md pattern instead.

---

## Content Structure

```markdown
# [Topic] Discovery

**Phase:** [phase name]
**Topic:** [discovery-topic]
**Date:** [YYYY-MM-DD]
**Confidence:** [HIGH | MEDIUM | LOW]

## Summary

[2-3 paragraph executive summary - what was researched, what was found, what's recommended]

## Primary Recommendation

[What to do and why - be specific and actionable]

## Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| [Option A] | [pros] | [cons] | [reason] |
| [Option B] | [pros] | [cons] | [reason] |

## Key Findings

### [Category 1]
- [Finding with source URL and relevance to our case]

### [Category 2]
- [Finding with source URL and relevance]

## Code Examples

[Relevant implementation patterns, if applicable]

```typescript
// Example usage of recommended approach
```

## Metadata

**Confidence breakdown:**
- [Why this confidence level - based on source quality and verification]

**Sources:**
- [Primary authoritative sources used]

**Open questions:**
- [What couldn't be determined or needs validation during implementation]

**Validation checkpoints:**
- [If confidence is LOW or MEDIUM, list specific things to verify during implementation]

---
*Discovery completed: [date]*
*Ready for planning: [yes/no]*
```

---

<discovery_protocol>

**Source Priority:**
1. **Official Docs** - Authoritative, current
2. **WebSearch** - For comparisons, trends (verify findings)
3. **Training knowledge** - Mark as LOW confidence, needs validation

**Quality Checklist:**
- [ ] All claims have authoritative sources
- [ ] Negative claims verified with official documentation
- [ ] API syntax/configuration from official docs
- [ ] WebSearch findings cross-checked
- [ ] Recent updates/changelogs checked for breaking changes
- [ ] Alternative approaches considered

**Confidence Levels:**
- HIGH: Official docs confirm
- MEDIUM: WebSearch + official docs confirm
- LOW: WebSearch only or training knowledge only (mark for validation)

</discovery_protocol>

<guidelines>

**When to use discovery:**
- Technology choice unclear (library A vs B)
- Best practices needed for unfamiliar integration
- API/library investigation required
- Single decision pending

**When NOT to use:**
- Established patterns (CRUD, auth with known library)
- Implementation details (defer to execution)
- Questions answerable from existing project context

**When to use RESEARCH page instead:**
- Niche/complex domains (3D, games, audio, shaders)
- Need ecosystem knowledge, not just library choice
- "How do experts build this" questions

</guidelines>

<mosic_operations>

**Create discovery page:**
```javascript
await mosic_create_entity_page("MTask List", task_list_id, {
  title: `${phaseName} Discovery: ${topic}`,
  icon: "lucide:compass",
  content: discoveryContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "discovery", `phase-${phase}`]
});
```

**Read discovery for planning:**
```javascript
const pages = await mosic_get_entity_pages("MTask List", task_list_id);
const discovery = pages.find(p => p.title.includes("Discovery"));
const content = await mosic_get_page(discovery.name, { content_format: "markdown" });
```

**Update discovery with findings:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

</mosic_operations>
