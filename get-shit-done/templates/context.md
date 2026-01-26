# Phase Context Page Content Pattern

Content structure for capturing implementation decisions for a phase in Mosic.

**Created via:** `mosic_create_entity_page("MTask List", task_list_id, { title: "[Phase] Context", icon: "lucide:message-square" })`
**Page Type:** Document
**Icon:** lucide:message-square
**Tags:** ["gsd-managed", "context", "phase-XX"]

**Purpose:** Document decisions that downstream agents need. Researcher uses this to know WHAT to investigate. Planner uses this to know WHAT choices are locked vs flexible.

**Key principle:** Categories are NOT predefined. They emerge from what was actually discussed for THIS phase. A CLI phase has CLI-relevant sections, a UI phase has UI-relevant sections.

---

## Content Structure

```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

## Phase Boundary

[Clear statement of what this phase delivers - the scope anchor. This comes from roadmap and is fixed. Discussion clarifies implementation within this boundary.]

## Implementation Decisions

### [Area 1 that was discussed]
- [Specific decision made]
- [Another decision if applicable]

### [Area 2 that was discussed]
- [Specific decision made]

### [Area 3 that was discussed]
- [Specific decision made]

### Claude's Discretion
[Areas where user explicitly said "you decide" - Claude has flexibility here during planning/implementation]

## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion. Product references, specific behaviors, interaction patterns.]

[If none: "No specific requirements - open to standard approaches"]

## Deferred Ideas

[Ideas that came up during discussion but belong in other phases. Captured here so they're not lost, but explicitly out of scope for this phase.]

[If none: "None - discussion stayed within phase scope"]

---
*Phase: XX-name*
*Context gathered: [date]*
```

---

<good_examples>

**Example 1: Visual feature (Post Feed)**

```markdown
# Phase 3: Post Feed - Context

**Gathered:** 2025-01-20
**Status:** Ready for planning

## Phase Boundary

Display posts from followed users in a scrollable feed. Users can view posts and see engagement counts. Creating posts and interactions are separate phases.

## Implementation Decisions

### Layout style
- Card-based layout, not timeline or list
- Each card shows: author avatar, name, timestamp, full post content, reaction counts
- Cards have subtle shadows, rounded corners - modern feel

### Loading behavior
- Infinite scroll, not pagination
- Pull-to-refresh on mobile
- New posts indicator at top ("3 new posts") rather than auto-inserting

### Empty state
- Friendly illustration + "Follow people to see posts here"
- Suggest 3-5 accounts to follow based on interests

### Claude's Discretion
- Loading skeleton design
- Exact spacing and typography
- Error state handling

## Specific Ideas

- "I like how Twitter shows the new posts indicator without disrupting your scroll position"
- Cards should feel like Linear's issue cards - clean, not cluttered

## Deferred Ideas

- Commenting on posts - Phase 5
- Bookmarking posts - add to backlog

---
*Phase: 03-post-feed*
*Context gathered: 2025-01-20*
```

**Example 2: CLI tool (Database backup)**

```markdown
# Phase 2: Backup Command - Context

**Gathered:** 2025-01-20
**Status:** Ready for planning

## Phase Boundary

CLI command to backup database to local file or S3. Supports full and incremental backups. Restore command is a separate phase.

## Implementation Decisions

### Output format
- JSON for programmatic use, table format for humans
- Default to table, --json flag for JSON
- Verbose mode (-v) shows progress, silent by default

### Flag design
- Short flags for common options: -o (output), -v (verbose), -f (force)
- Long flags for clarity: --incremental, --compress, --encrypt
- Required: database connection string (positional or --db)

### Error recovery
- Retry 3 times on network failure, then fail with clear message
- --no-retry flag to fail fast
- Partial backups are deleted on failure (no corrupt files)

### Claude's Discretion
- Exact progress bar implementation
- Compression algorithm choice
- Temp file handling

## Specific Ideas

- "I want it to feel like pg_dump - familiar to database people"
- Should work in CI pipelines (exit codes, no interactive prompts)

## Deferred Ideas

- Scheduled backups - separate phase
- Backup rotation/retention - add to backlog

---
*Phase: 02-backup-command*
*Context gathered: 2025-01-20*
```

</good_examples>

<guidelines>

**This template captures DECISIONS for downstream agents.**

The output should answer: "What does the researcher need to investigate? What choices are locked for the planner?"

**Good content (concrete decisions):**
- "Card-based layout, not timeline"
- "Retry 3 times on network failure, then fail"
- "Group by year, then by month"
- "JSON for programmatic use, table for humans"

**Bad content (too vague):**
- "Should feel modern and clean"
- "Good user experience"
- "Fast and responsive"
- "Easy to use"

**Downstream consumers:**
- Researcher reads decisions to focus investigation
- Planner reads decisions to create specific tasks
- Neither should need to ask user again about captured decisions

</guidelines>

<mosic_operations>

**Create context page:**
```javascript
await mosic_create_entity_page("MTask List", task_list_id, {
  title: `Phase ${num} Context`,
  icon: "lucide:message-square",
  content: contextContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "context", `phase-${num}`]
});
```

**Read context for planning:**
```javascript
const pages = await mosic_get_entity_pages("MTask List", task_list_id);
const context = pages.find(p => p.title.includes("Context"));
const content = await mosic_get_page(context.name, { content_format: "markdown" });
```

**Update context with new decisions:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

</mosic_operations>
