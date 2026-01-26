# Features Research Page Content Pattern

Content structure for domain features research pages in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "Features Research", icon: "lucide:list-checks" })`
**Page Type:** Document
**Icon:** lucide:list-checks
**Tags:** ["gsd-managed", "research-project", "features"]

---

## Content Structure

```markdown
# Feature Research

**Domain:** [domain type]
**Researched:** [date]
**Confidence:** [HIGH/MEDIUM/LOW]

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| [feature] | [user expectation] | LOW/MEDIUM/HIGH | [implementation notes] |
| [feature] | [user expectation] | LOW/MEDIUM/HIGH | [implementation notes] |
| [feature] | [user expectation] | LOW/MEDIUM/HIGH | [implementation notes] |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| [feature] | [why it matters] | LOW/MEDIUM/HIGH | [implementation notes] |
| [feature] | [why it matters] | LOW/MEDIUM/HIGH | [implementation notes] |
| [feature] | [why it matters] | LOW/MEDIUM/HIGH | [implementation notes] |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| [feature] | [surface appeal] | [actual problems] | [better approach] |
| [feature] | [surface appeal] | [actual problems] | [better approach] |

## Feature Dependencies

```
[Feature A]
    └──requires──> [Feature B]
                       └──requires──> [Feature C]

[Feature D] ──enhances──> [Feature A]

[Feature E] ──conflicts──> [Feature F]
```

### Dependency Notes

- **[Feature A] requires [Feature B]:** [why the dependency exists]
- **[Feature D] enhances [Feature A]:** [how they work together]
- **[Feature E] conflicts with [Feature F]:** [why they're incompatible]

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] [Feature] — [why essential]
- [ ] [Feature] — [why essential]
- [ ] [Feature] — [why essential]

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] [Feature] — [trigger for adding]
- [ ] [Feature] — [trigger for adding]

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] [Feature] — [why defer]
- [ ] [Feature] — [why defer]

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| [feature] | HIGH/MEDIUM/LOW | HIGH/MEDIUM/LOW | P1/P2/P3 |
| [feature] | HIGH/MEDIUM/LOW | HIGH/MEDIUM/LOW | P1/P2/P3 |
| [feature] | HIGH/MEDIUM/LOW | HIGH/MEDIUM/LOW | P1/P2/P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| [feature] | [how they do it] | [how they do it] | [our plan] |
| [feature] | [how they do it] | [how they do it] | [our plan] |

## Sources

- [Competitor products analyzed]
- [User research or feedback sources]
- [Industry standards referenced]

---
*Feature research for: [domain]*
*Researched: [date]*
```

---

<guidelines>

**Table Stakes:**
- These are non-negotiable for launch
- Users don't give credit for having them, but penalize for missing them
- Example: A community platform without user profiles is broken

**Differentiators:**
- These are where you compete
- Should align with the Core Value from project requirements
- Don't try to differentiate on everything

**Anti-Features:**
- Prevent scope creep by documenting what seems good but isn't
- Include the alternative approach
- Example: "Real-time everything" often creates complexity without value

**Feature Dependencies:**
- Critical for roadmap phase ordering
- If A requires B, B must be in an earlier phase
- Conflicts inform what NOT to combine in same phase

**MVP Definition:**
- Be ruthless about what's truly minimum
- "Nice to have" is not MVP
- Launch with less, validate, then expand

</guidelines>

<mosic_operations>

**Create features research page:**
```javascript
await mosic_create_entity_page("MProject", project_id, {
  title: "Features Research",
  icon: "lucide:list-checks",
  content: featuresContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "research-project", "features"]
});
```

**Read features for planning:**
```javascript
const pages = await mosic_get_entity_pages("MProject", project_id);
const features = pages.find(p => p.title === "Features Research");
const content = await mosic_get_page(features.name, { content_format: "markdown" });
```

**Update features research:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

**Find all features research:**
```javascript
const featurePages = await mosic_search_documents_by_tags({
  workspace_id,
  tags: ["research-project", "features"],
  doctype: "M Page"
});
```

</mosic_operations>
