# Tag Operations Reference

This is the single source of truth for how GSD agents handle tags in Mosic. All agents MUST follow the `resolve_tag` pattern — search first, create only if absent.

> See also: `@~/.claude/get-shit-done/references/content-formatting.md` for entity content formats.

---

## The `resolve_tag` Pattern (Search-First, Create-Last)

**ALWAYS use this pattern. Never directly create a tag without searching first.**

```javascript
FUNCTION resolve_tag(tag_title, workspace_id):
  results = mosic_search_tags({ workspace_id: workspace_id, query: tag_title })
  exact = results.find(t => t.title.toLowerCase() == tag_title.toLowerCase())
  IF exact:
    RETURN exact.name   // Use existing tag (its Mosic document name / UUID)
  ELSE:
    // Only create if no exact match exists
    new_tag = mosic_create_document("M Tag", {
      workspace_id: workspace_id,    // M Tag uses workspace_id (not workspace)
      title: tag_title,
      color: "#14B8A6"
    })
    RETURN new_tag.name
```

### Usage Examples

```javascript
// Single tag
mosic_add_tag_to_document("MTask", task_id,
  resolve_tag("oauth", workspace_id)
)

// Multiple tags (batch)
tag_ids = ["gsd-managed", "react-query", "phase-01"].map(t => resolve_tag(t, workspace_id))
mosic_batch_add_tags_to_document("M Page", page_id, tag_ids)

// Two-layer tagging (structural + topic)
structural = ["gsd-managed", "plan", "phase-01"].map(t => resolve_tag(t, workspace_id))
topic      = ["oauth2", "jwt"].map(t => resolve_tag(t, workspace_id))
mosic_batch_add_tags_to_document("MTask", task_id, structural + topic)
```

---

## Tag Quality Rules

**Good tags answer: "If someone searched this tag, would they expect THIS item?"**

| Rule | Good | Bad |
|------|------|-----|
| Specific over generic | `oauth2`, `stripe-payments` | `authentication`, `payments` |
| Lowercase, hyphenated | `user-auth`, `react-query` | `User Auth`, `ReactQuery` |
| Technology-specific | `jwt`, `websocket`, `frappe-orm` | `backend`, `code` |
| Domain-specific | `email-notifications`, `file-upload` | `notifications`, `feature` |
| Skip meta-labels | — | `implementation`, `system`, `module`, `update` |
| Skip structural duplicates | — | `frontend`, `backend` (covered by workspace context) |

**Minimum length:** 3 characters. **Format:** lowercase, hyphenated only.

---

## Two-Layer Tagging: Structural + Topic

Every entity should get **both** layers. Layer 1 is for namespace/housekeeping; Layer 2 is what makes tags useful for discovery.

### Layer 1: Structural Tags (always applied)

| Tag | When to Apply |
|-----|---------------|
| `gsd-managed` | Every entity created by GSD agents |
| `phase-01`, `phase-02` etc. | Entity belongs to this phase |
| `plan` | Plan task or plan detail page |
| `research` | Research page |
| `summary` | Completion summary page |
| `verification` | Verification report page |
| `debug` | Debug session page |
| `active` | Currently active debug session |
| `resolved` | Resolved debug session |
| `integration` | Integration check report |
| `codebase` | Codebase analysis page |
| `tdd` | Test-driven development task |

### Layer 2: Topic Tags (content-derived, meaningful)

Derive 2–5 per phase/entity from: phase title, technologies used, domain, key challenges.

Apply to: plan pages, research pages, task lists, AND individual tasks (not just research pages).

```javascript
// Layer 1: Structural (always applied, derived from context)
structural_tags = ["gsd-managed", "plan", "phase-01"].map(t => resolve_tag(t, workspace_id))

// Layer 2: Topic (derived from actual content, carried forward from research)
// phase_topic_tags comes from config.mosic.tags.phase_topic_tags["phase-01"] or derived inline
topic_tags = phase_topic_tags.map(t => resolve_tag(t, workspace_id))

// Apply both
mosic_batch_add_tags_to_document("MTask", task_id, structural_tags + topic_tags)
```

**When to derive topic tags inline** (when no prior research exists):

```javascript
// Derive from phase name / goal keywords
// e.g. "Phase 1: OAuth Authentication" → ["oauth", "jwt", "session-management"]
topic_titles = derive_topic_tags_from_phase(phase.title, phase.description)  // 2-4 tags
topic_tags   = topic_titles.map(t => resolve_tag(t, workspace_id))
```

---

## `workspace` vs `workspace_id` Field Names

This distinction is critical and a common source of bugs.

| Context | Correct field | Example |
|---------|--------------|---------|
| Document field when creating MTask | `workspace` | `mosic_create_document("MTask", { workspace: workspace_id, ... })` |
| Document field when creating MProject | `workspace` | `mosic_create_document("MProject", { workspace: workspace_id, ... })` |
| Document field when creating MTask List | `workspace` | `mosic_create_document("MTask List", { workspace: workspace_id, ... })` |
| Document field when creating M Relation | `workspace` | `mosic_create_document("M Relation", { workspace: workspace_id, ... })` |
| MCP function parameter (mosic_get_task, mosic_search_tags, mosic_create_entity_page, etc.) | `workspace_id` | `mosic_get_task(id, { workspace_id: "..." })` |
| M Tag document field (exception) | `workspace_id` | `mosic_create_document("M Tag", { workspace_id: workspace_id, ... })` |

### Quick check

```javascript
// WRONG — workspace_id as document field for MTask / MTask List / M Relation
mosic_create_document("MTask",      { workspace_id: workspace_id, ... })  // ✗
mosic_create_document("MTask List", { workspace_id: workspace_id, ... })  // ✗
mosic_create_document("M Relation", { workspace_id: workspace_id, ... })  // ✗

// CORRECT — workspace as document field
mosic_create_document("MTask",      { workspace: workspace_id, ... })  // ✓
mosic_create_document("MTask List", { workspace: workspace_id, ... })  // ✓
mosic_create_document("M Relation", { workspace: workspace_id, ... })  // ✓

// CORRECT — workspace_id as MCP function parameter (these are NOT document fields)
mosic_search_tags({ workspace_id: workspace_id, query: "plan" })           // ✓
mosic_create_entity_page("MProject", id, { workspace_id: workspace_id })   // ✓
mosic_create_document("M Tag", { workspace_id: workspace_id, title: "x" }) // ✓ (M Tag exception)
```
