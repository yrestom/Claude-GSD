# Debug Session Page Content Pattern

Content structure for active debug session tracking in Mosic.

**Created via:** `mosic_create_entity_page("MTask", task_id, { title: "Debug: [Issue]", icon: "lucide:bug" })`
**Page Type:** Document
**Icon:** lucide:bug
**Tags:** ["gsd-managed", "debug", "active"]

---

## Content Structure

```markdown
# Debug: [Issue Brief]

**Status:** gathering | investigating | fixing | verifying | resolved
**Started:** [ISO timestamp]
**Updated:** [ISO timestamp]
**Trigger:** "[verbatim user input]"

## Current Focus

<!-- OVERWRITE on each update - always reflects NOW -->

**Hypothesis:** [current theory being tested]
**Test:** [how testing it]
**Expecting:** [what result means if true/false]
**Next action:** [immediate next step]

## Symptoms

<!-- Written during gathering, then immutable -->

**Expected:** [what should happen]
**Actual:** [what actually happens]
**Errors:** [error messages if any]
**Reproduction:** [how to trigger]
**Started:** [when it broke / always broken]

## Eliminated

<!-- APPEND only - prevents re-investigating after context reset -->

| Hypothesis | Evidence | When |
|------------|----------|------|
| [theory that was wrong] | [what disproved it] | [timestamp] |

## Evidence

<!-- APPEND only - facts discovered during investigation -->

| When | Checked | Found | Implication |
|------|---------|-------|-------------|
| [timestamp] | [what examined] | [what observed] | [what this means] |

## Resolution

<!-- OVERWRITE as understanding evolves -->

**Root cause:** [empty until found]
**Fix:** [empty until applied]
**Verification:** [empty until verified]
**Files changed:** [list of files modified]
**Commit:** [hash if committed]

---
*Debug session: [slug]*
*Created: [date]*
```

---

<section_rules>

**Status:**
- OVERWRITE - reflects current phase
- Values: gathering, investigating, fixing, verifying, resolved

**Current Focus:**
- OVERWRITE entirely on each update
- Always reflects what Claude is doing RIGHT NOW
- If Claude reads after context reset, knows exactly where to resume
- Fields: hypothesis, test, expecting, next_action

**Symptoms:**
- Written during initial gathering phase
- IMMUTABLE after gathering complete
- Reference point for what we're trying to fix

**Eliminated:**
- APPEND only - never remove entries
- Prevents re-investigating dead ends after context reset
- Critical for efficiency across session boundaries

**Evidence:**
- APPEND only - never remove entries
- Facts discovered during investigation
- Builds the case for root cause

**Resolution:**
- OVERWRITE as understanding evolves
- May update multiple times as fixes are tried
- Final state shows confirmed root cause and verified fix

</section_rules>

<lifecycle>

**Creation:** When /gsd:debug is called
- Create page linked to debug task
- Set status to "gathering"
- Current Focus: next_action = "gather symptoms"

**During symptom gathering:**
- Update Symptoms section as user answers questions
- Update Current Focus with each question
- When complete: status -> "investigating"

**During investigation:**
- OVERWRITE Current Focus with each hypothesis
- APPEND to Evidence with each finding
- APPEND to Eliminated when hypothesis disproved

**During fixing:**
- status -> "fixing"
- Update Resolution.root_cause when confirmed
- Update Resolution.fix when applied
- Update Resolution.files_changed

**During verification:**
- status -> "verifying"
- Update Resolution.verification with results
- If verification fails: status -> "investigating", try again

**On resolution:**
- status -> "resolved"
- Add "resolved" tag
- Remove "active" tag

</lifecycle>

<resume_behavior>

When Claude reads this page after context reset:

1. Parse status -> know phase
2. Read Current Focus -> know exactly what was happening
3. Read Eliminated -> know what NOT to retry
4. Read Evidence -> know what's been learned
5. Continue from next_action

The page IS the debugging brain. Claude should be able to resume perfectly from any interruption point.

</resume_behavior>

<mosic_operations>

**Create debug session:**
```javascript
// Create debug task
const task = await mosic_create_document("MTask", {
  title: `Debug: ${issueBrief}`,
  description: `Investigating: ${issueDescription}`,
  task_list: task_list_id,
  workspace: workspace_id,
  priority: "High"
});

// Create linked page
await mosic_create_entity_page("MTask", task.name, {
  title: `Debug: ${issueBrief}`,
  icon: "lucide:bug",
  content: debugContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "debug", "active"]
});
```

**Update investigation:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

**Mark resolved:**
```javascript
// Update tags
await mosic_remove_tag_from_document("M Page", page_id, {
  workspace_id,
  tag: "active"
});

await mosic_add_tag_to_document("M Page", page_id, {
  workspace_id,
  tag: "resolved"
});

// Complete task
await mosic_complete_task(task_id);
```

**Find active debug sessions:**
```javascript
const sessions = await mosic_search_documents_by_tags({
  workspace_id,
  tags: ["debug", "active"],
  doctype: "M Page"
});
```

</mosic_operations>
