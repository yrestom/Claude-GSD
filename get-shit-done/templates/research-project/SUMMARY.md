# Research Summary Page Content Pattern

Content structure for project research summary pages in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "Research Summary", icon: "lucide:file-text" })`
**Page Type:** Document
**Icon:** lucide:file-text
**Tags:** ["gsd-managed", "research-project", "summary"]

---

## Content Structure

```markdown
# Project Research Summary

**Project:** [name]
**Domain:** [inferred domain type]
**Researched:** [date]
**Confidence:** [HIGH/MEDIUM/LOW]

## Executive Summary

[2-3 paragraph overview of research findings]

- What type of product this is and how experts build it
- The recommended approach based on research
- Key risks and how to mitigate them

## Key Findings

### Recommended Stack

[Summary from Stack Research page — 1-2 paragraphs]

**Core technologies:**
- [Technology]: [purpose] — [why recommended]
- [Technology]: [purpose] — [why recommended]
- [Technology]: [purpose] — [why recommended]

### Expected Features

[Summary from Features Research page]

**Must have (table stakes):**
- [Feature] — users expect this
- [Feature] — users expect this

**Should have (competitive):**
- [Feature] — differentiator
- [Feature] — differentiator

**Defer (v2+):**
- [Feature] — not essential for launch

### Architecture Approach

[Summary from Architecture Research page — 1 paragraph]

**Major components:**
1. [Component] — [responsibility]
2. [Component] — [responsibility]
3. [Component] — [responsibility]

### Critical Pitfalls

[Top 3-5 from Pitfalls Research page]

1. **[Pitfall]** — [how to avoid]
2. **[Pitfall]** — [how to avoid]
3. **[Pitfall]** — [how to avoid]

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: [Name]
**Rationale:** [why this comes first based on research]
**Delivers:** [what this phase produces]
**Addresses:** [features from research]
**Avoids:** [pitfall from research]

### Phase 2: [Name]
**Rationale:** [why this order]
**Delivers:** [what this phase produces]
**Uses:** [stack elements from research]
**Implements:** [architecture component]

### Phase 3: [Name]
**Rationale:** [why this order]
**Delivers:** [what this phase produces]

[Continue for suggested phases...]

### Phase Ordering Rationale

- [Why this order based on dependencies discovered]
- [Why this grouping based on architecture patterns]
- [How this avoids pitfalls from research]

### Research Flags

Phases likely needing deeper research during planning:
- **Phase [X]:** [reason — e.g., "complex integration, needs API research"]
- **Phase [Y]:** [reason — e.g., "niche domain, sparse documentation"]

Phases with standard patterns (skip research-phase):
- **Phase [X]:** [reason — e.g., "well-documented, established patterns"]

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | [HIGH/MEDIUM/LOW] | [reason] |
| Features | [HIGH/MEDIUM/LOW] | [reason] |
| Architecture | [HIGH/MEDIUM/LOW] | [reason] |
| Pitfalls | [HIGH/MEDIUM/LOW] | [reason] |

**Overall confidence:** [HIGH/MEDIUM/LOW]

### Gaps to Address

[Any areas where research was inconclusive or needs validation during implementation]

- [Gap]: [how to handle during planning/execution]
- [Gap]: [how to handle during planning/execution]

## Sources

### Primary (HIGH confidence)
- [Context7 library ID] — [topics]
- [Official docs URL] — [what was checked]

### Secondary (MEDIUM confidence)
- [Source] — [finding]

### Tertiary (LOW confidence)
- [Source] — [finding, needs validation]

---
*Research completed: [date]*
*Ready for roadmap: yes*
```

---

<guidelines>

**Executive Summary:**
- Write for someone who will only read this section
- Include the key recommendation and main risk
- 2-3 paragraphs maximum

**Key Findings:**
- Summarize, don't duplicate full research pages
- Reference related pages (Stack, Features, Architecture, Pitfalls)
- Focus on what matters for roadmap decisions

**Implications for Roadmap:**
- This is the most important section
- Directly informs roadmap creation
- Be explicit about phase suggestions and rationale
- Include research flags for each suggested phase

**Confidence Assessment:**
- Be honest about uncertainty
- Note gaps that need resolution during planning
- HIGH = verified with official sources
- MEDIUM = community consensus, multiple sources agree
- LOW = single source or inference

**Integration with roadmap creation:**
- This page is loaded as context during roadmap creation
- Phase suggestions here become starting point for roadmap
- Research flags inform phase planning

</guidelines>

<mosic_operations>

**Create research summary page:**
```javascript
const pages = await mosic_get_entity_pages("MProject", project_id);

await mosic_create_entity_page("MProject", project_id, {
  title: "Research Summary",
  icon: "lucide:file-text",
  content: summaryContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "research-project", "summary"]
});
```

**Read summary for roadmap creation:**
```javascript
const pages = await mosic_get_entity_pages("MProject", project_id);
const summary = pages.find(p => p.title === "Research Summary");
const content = await mosic_get_page(summary.name, { content_format: "markdown" });
```

**Update summary with new findings:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

**Find all research summaries:**
```javascript
const summaries = await mosic_search_documents_by_tags({
  workspace_id,
  tags: ["research-project", "summary"],
  doctype: "M Page"
});
```

</mosic_operations>
