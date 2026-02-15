# Phase Research Page Content Pattern

Content structure for comprehensive ecosystem research documentation in Mosic.

**Created via:** `mosic_create_entity_page("MTask List", task_list_id, { title: "[Phase] Research", icon: "lucide:search" })`
**Page Type:** Document
**Icon:** lucide:search
**Tags:** ["gsd-managed", "research", "phase-XX"]

**Purpose:** Document what Claude needs to know to implement a phase well - not just "which library" but "how do experts build this."

---

## Content Structure

```markdown
# Phase [X]: [Name] - Research

**Researched:** [date]
**Domain:** [primary technology/problem domain]
**Confidence:** [HIGH/MEDIUM/LOW]

## User Constraints (from Context Page)

**CRITICAL:** If a Context page exists from /gsd:discuss-phase, copy locked decisions here verbatim. These MUST be honored by the planner.

### Locked Decisions
[Copy from Context page `## Decisions` section - these are NON-NEGOTIABLE]
- [Decision 1]
- [Decision 2]

### Claude's Discretion
[Copy from Context page - areas where researcher/planner can choose]
- [Area 1]
- [Area 2]

### Deferred Ideas (OUT OF SCOPE)
[Copy from Context page `## Deferred Ideas` - do NOT research or plan these]
- [Deferred 1]
- [Deferred 2]

**If no Context page exists:** "No user constraints — all decisions at Claude's discretion"

## Summary

[2-3 paragraph executive summary]
- What was researched
- What the standard approach is
- Key recommendations

**Primary recommendation:** [one-liner actionable guidance]

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [name] | [ver] | [what it does] | [why experts use it] |
| [name] | [ver] | [what it does] | [why experts use it] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| [name] | [ver] | [what it does] | [use case] |
| [name] | [ver] | [what it does] | [use case] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| [standard] | [alternative] | [when alternative makes sense] |

**Installation:**
```bash
npm install [packages]
# or
yarn add [packages]
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── [folder]/        # [purpose]
├── [folder]/        # [purpose]
└── [folder]/        # [purpose]
```

### Pattern 1: [Pattern Name]
**What:** [description]
**When to use:** [conditions]
**Example:**
```typescript
// [code example from official docs]
```

### Pattern 2: [Pattern Name]
**What:** [description]
**When to use:** [conditions]
**Example:**
```typescript
// [code example]
```

### Anti-Patterns to Avoid
- **[Anti-pattern]:** [why it's bad, what to do instead]
- **[Anti-pattern]:** [why it's bad, what to do instead]

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| [problem] | [what you'd build] | [library] | [edge cases, complexity] |
| [problem] | [what you'd build] | [library] | [edge cases, complexity] |
| [problem] | [what you'd build] | [library] | [edge cases, complexity] |

**Key insight:** [why custom solutions are worse in this domain]

## Common Pitfalls

### Pitfall 1: [Name]
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Warning signs:** [how to detect early]

### Pitfall 2: [Name]
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Warning signs:** [how to detect early]

### Pitfall 3: [Name]
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Warning signs:** [how to detect early]

## Code Examples

Verified patterns from official sources:

### [Common Operation 1]
```typescript
// Source: [official docs URL]
[code]
```

### [Common Operation 2]
```typescript
// Source: [official docs URL]
[code]
```

### [Common Operation 3]
```typescript
// Source: [official docs URL]
[code]
```

## State of the Art (2024-2025)

What's changed recently:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| [old] | [new] | [date/version] | [what it means for implementation] |

**New tools/patterns to consider:**
- [Tool/Pattern]: [what it enables, when to use]
- [Tool/Pattern]: [what it enables, when to use]

**Deprecated/outdated:**
- [Thing]: [why it's outdated, what replaced it]

## Gap Analysis

**Status:** [CLEAR | NON-BLOCKING | BLOCKING]

### Blocking Gaps
[Gaps requiring user decision before planning can proceed. If none: "None identified."]

For each blocking gap:
- **Gap:** [What's missing or ambiguous]
- **Relates to:** [Which requirement or decision this affects]
- **Evidence checked:** [What was searched/verified to confirm this is genuinely unaddressed]
- **Impact if unresolved:** [What goes wrong if planner guesses]
- **Suggested resolution:** [Options for user to choose between]

### Non-Blocking Gaps
[Gaps the planner can handle with reasonable defaults. If none: "None — all requirements are actionable."]

For each non-blocking gap:
- **Gap:** [What's unclear]
- **Relates to:** [Which requirement or decision]
- **Default approach:** [What the planner should assume]

## Sources

### Primary (HIGH confidence)
- [Library documentation] - [topics fetched]
- [Official docs URL] - [what was checked]

### Secondary (MEDIUM confidence)
- [WebSearch verified with official source] - [finding + verification]

### Tertiary (LOW confidence - needs validation)
- [WebSearch only] - [finding, marked for validation during implementation]

## Metadata

**Research scope:**
- Core technology: [what]
- Ecosystem: [libraries explored]
- Patterns: [patterns researched]
- Pitfalls: [areas checked]

**Confidence breakdown:**
- Standard stack: [HIGH/MEDIUM/LOW] - [reason]
- Architecture: [HIGH/MEDIUM/LOW] - [reason]
- Pitfalls: [HIGH/MEDIUM/LOW] - [reason]
- Code examples: [HIGH/MEDIUM/LOW] - [reason]

**Research date:** [date]
**Valid until:** [estimate - 30 days for stable tech, 7 days for fast-moving]

---

*Phase: XX-name*
*Research completed: [date]*
*Ready for planning: [yes/no]*
```

---

<guidelines>

**When to create:**
- Before planning phases in niche/complex domains
- When Claude's training data is likely stale or sparse
- When "how do experts do this" matters more than "which library"

**User constraints (FIRST section):**
- Copy verbatim from Context page — do not paraphrase
- Locked decisions are non-negotiable for the planner
- Deferred ideas must NOT appear in research findings
- If no Context page exists, state "No user constraints"

**Content quality:**
- Standard stack: Specific versions, not just names
- Architecture: Include actual code examples from authoritative sources
- Don't hand-roll: Be explicit about what problems to NOT solve yourself
- Pitfalls: Include warning signs, not just "don't do this"
- Sources: Mark confidence levels honestly

**Gap analysis:**
- Cross-reference findings against requirements and decisions
- Classify gaps as BLOCKING (needs user input) or NON-BLOCKING (planner uses defaults)
- Use "search before claiming absence" — verify a gap is real before reporting it
- BLOCKING gaps trigger feedback loop to discussion; NON-BLOCKING gaps inform planner

**Integration with planning:**
- Research page linked to MTask List (phase)
- Standard stack informs library choices
- Don't hand-roll prevents custom solutions
- Pitfalls inform verification criteria
- Code examples can be referenced in task actions
- Gap analysis section gives planner awareness of ambiguities and recommended defaults

</guidelines>

<mosic_operations>

**Create research page:**
```javascript
await mosic_create_entity_page("MTask List", task_list_id, {
  title: `Phase ${num} Research`,
  icon: "lucide:search",
  content: researchContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "research", `phase-${num}`]
});
```

**Read research for planning:**
```javascript
const pages = await mosic_get_entity_pages("MTask List", task_list_id);
const research = pages.find(p => p.title.includes("Research"));
const content = await mosic_get_page(research.name, { content_format: "markdown" });
```

**Link research to plan tasks:**
```javascript
// Create M Relation between research page and plan tasks
await mosic_create_document("M Relation", {
  from_doctype: "M Page",
  from_name: research_page_id,
  to_doctype: "MTask",
  to_name: plan_task_id,
  relation_type: "Related"
});
```

</mosic_operations>
