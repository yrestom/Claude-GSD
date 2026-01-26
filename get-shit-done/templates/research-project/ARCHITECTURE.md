# Architecture Research Page Content Pattern

Content structure for domain architecture research pages in Mosic.

**Created via:** `mosic_create_entity_page("MProject", project_id, { title: "Architecture Research", icon: "lucide:boxes" })`
**Page Type:** Document
**Icon:** lucide:boxes
**Tags:** ["gsd-managed", "research-project", "architecture"]

---

## Content Structure

```markdown
# Architecture Research

**Domain:** [domain type]
**Researched:** [date]
**Confidence:** [HIGH/MEDIUM/LOW]

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        [Layer Name]                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ [Comp]  │  │ [Comp]  │  │ [Comp]  │  │ [Comp]  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
├───────┴────────────┴────────────┴────────────┴──────────────┤
│                        [Layer Name]                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    [Component]                       │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                        [Layer Name]                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ [Store]  │  │ [Store]  │  │ [Store]  │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| [name] | [what it owns] | [how it's usually built] |
| [name] | [what it owns] | [how it's usually built] |
| [name] | [what it owns] | [how it's usually built] |

## Recommended Project Structure

```
src/
├── [folder]/           # [purpose]
│   ├── [subfolder]/    # [purpose]
│   └── [file].ts       # [purpose]
├── [folder]/           # [purpose]
│   ├── [subfolder]/    # [purpose]
│   └── [file].ts       # [purpose]
├── [folder]/           # [purpose]
└── [folder]/           # [purpose]
```

### Structure Rationale

- **[folder]/:** [why organized this way]
- **[folder]/:** [why organized this way]

## Architectural Patterns

### Pattern 1: [Pattern Name]

**What:** [description]
**When to use:** [conditions]
**Trade-offs:** [pros and cons]

**Example:**
```typescript
// [Brief code example showing the pattern]
```

### Pattern 2: [Pattern Name]

**What:** [description]
**When to use:** [conditions]
**Trade-offs:** [pros and cons]

**Example:**
```typescript
// [Brief code example showing the pattern]
```

### Pattern 3: [Pattern Name]

**What:** [description]
**When to use:** [conditions]
**Trade-offs:** [pros and cons]

## Data Flow

### Request Flow

```
[User Action]
    ↓
[Component] → [Handler] → [Service] → [Data Store]
    ↓              ↓           ↓            ↓
[Response] ← [Transform] ← [Query] ← [Database]
```

### State Management

```
[State Store]
    ↓ (subscribe)
[Components] ←→ [Actions] → [Reducers/Mutations] → [State Store]
```

### Key Data Flows

1. **[Flow name]:** [description of how data moves]
2. **[Flow name]:** [description of how data moves]

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | [approach — usually monolith is fine] |
| 1k-100k users | [approach — what to optimize first] |
| 100k+ users | [approach — when to consider splitting] |

### Scaling Priorities

1. **First bottleneck:** [what breaks first, how to fix]
2. **Second bottleneck:** [what breaks next, how to fix]

## Anti-Patterns

### Anti-Pattern 1: [Name]

**What people do:** [the mistake]
**Why it's wrong:** [the problem it causes]
**Do this instead:** [the correct approach]

### Anti-Pattern 2: [Name]

**What people do:** [the mistake]
**Why it's wrong:** [the problem it causes]
**Do this instead:** [the correct approach]

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| [service] | [how to connect] | [gotchas] |
| [service] | [how to connect] | [gotchas] |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| [module A ↔ module B] | [API/events/direct] | [considerations] |

## Sources

- [Architecture references]
- [Official documentation]
- [Case studies]

---
*Architecture research for: [domain]*
*Researched: [date]*
```

---

<guidelines>

**System Overview:**
- Use ASCII diagrams for clarity
- Show major components and their relationships
- Don't over-detail — this is conceptual, not implementation

**Project Structure:**
- Be specific about folder organization
- Explain the rationale for grouping
- Match conventions of the chosen stack

**Patterns:**
- Include code examples where helpful
- Explain trade-offs honestly
- Note when patterns are overkill for small projects

**Scaling Considerations:**
- Be realistic — most projects don't need to scale to millions
- Focus on "what breaks first" not theoretical limits
- Avoid premature optimization recommendations

**Anti-Patterns:**
- Specific to this domain
- Include what to do instead
- Helps prevent common mistakes during implementation

</guidelines>

<mosic_operations>

**Create architecture research page:**
```javascript
await mosic_create_entity_page("MProject", project_id, {
  title: "Architecture Research",
  icon: "lucide:boxes",
  content: architectureContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "research-project", "architecture"]
});
```

**Read architecture for planning:**
```javascript
const pages = await mosic_get_entity_pages("MProject", project_id);
const arch = pages.find(p => p.title === "Architecture Research");
const content = await mosic_get_page(arch.name, { content_format: "markdown" });
```

**Update architecture research:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

**Find all architecture research:**
```javascript
const archPages = await mosic_search_documents_by_tags({
  workspace_id,
  tags: ["research-project", "architecture"],
  doctype: "M Page"
});
```

</mosic_operations>
