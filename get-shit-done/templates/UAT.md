# UAT Session Page Content Pattern

Content structure for User Acceptance Testing session tracking in Mosic.

**Created via:** `mosic_create_entity_page("MTask List", task_list_id, { title: "[Phase] UAT", icon: "lucide:clipboard-check" })`
**Page Type:** Document
**Icon:** lucide:clipboard-check
**Tags:** ["gsd-managed", "uat", "phase-XX"]

---

## Content Structure

```markdown
# Phase [X]: [Name] - UAT Session

**Status:** testing | complete | diagnosed
**Source:** [List of summary pages being tested]
**Started:** [ISO timestamp]
**Updated:** [ISO timestamp]

## Current Test

<!-- OVERWRITE each test - shows where we are -->

**Number:** [N]
**Name:** [test name]
**Expected:** [what user should observe]
**Awaiting:** user response

## Tests

### 1. [Test Name]
**Expected:** [observable behavior - what user should see]
**Result:** [pending]

### 2. [Test Name]
**Expected:** [observable behavior]
**Result:** pass

### 3. [Test Name]
**Expected:** [observable behavior]
**Result:** issue
**Reported:** "[verbatim user response]"
**Severity:** major

### 4. [Test Name]
**Expected:** [observable behavior]
**Result:** skipped
**Reason:** [why skipped]

...

## Summary

- **Total:** [N]
- **Passed:** [N]
- **Issues:** [N]
- **Pending:** [N]
- **Skipped:** [N]

## Gaps

<!-- Issues found during UAT, used for gap planning -->

### Gap 1: [Brief description]
- **Truth:** "[expected behavior from test]"
- **Status:** failed
- **Reason:** "User reported: [verbatim response]"
- **Severity:** blocker | major | minor | cosmetic
- **Test:** [N]
- **Root cause:** [Filled by diagnosis]
- **Artifacts:** [Files involved, filled by diagnosis]
- **Missing:** [What needs to be added, filled by diagnosis]

### Gap 2: [Brief description]
...
```

---

<section_rules>

**Status section:**
- `status`: OVERWRITE - "testing", "complete", or "diagnosed"
- `source`: Set on creation - summary pages being tested
- `started`: Set on creation
- `updated`: OVERWRITE on every change

**Current Test:**
- OVERWRITE entirely on each test transition
- Shows which test is active and what's awaited
- On completion: "[testing complete]"

**Tests:**
- Each test: OVERWRITE result field when user responds
- `result` values: [pending], pass, issue, skipped
- If issue: add `reported` (verbatim) and `severity` (inferred)
- If skipped: add `reason` if provided

**Summary:**
- OVERWRITE counts after each response
- Tracks: total, passed, issues, pending, skipped

**Gaps:**
- APPEND only when issue found
- After diagnosis: fill `root_cause`, `artifacts`, `missing`
- This section feeds into gap planning

</section_rules>

<diagnosis_lifecycle>

**After testing complete (status: complete), if gaps exist:**

1. User runs diagnosis workflow
2. Debug agents investigate each gap
3. Each agent returns root cause
4. UAT page Gaps section updated with diagnosis
5. Status changes to "diagnosed"
6. Ready for gap planning with root causes

**After diagnosis gap entry looks like:**
```markdown
### Gap 1: Comment not refreshing
- **Truth:** "Comment appears immediately after submission"
- **Status:** failed
- **Reason:** "User reported: works but doesn't show until I refresh the page"
- **Severity:** major
- **Test:** 2
- **Root cause:** useEffect in CommentList.tsx missing commentCount dependency
- **Artifacts:** src/components/CommentList.tsx (useEffect missing dependency)
- **Missing:** Add commentCount to useEffect dependency array
```

</diagnosis_lifecycle>

<lifecycle>

**Creation:** When verify-work starts new session
- Extract tests from summary pages
- Set status to "testing"
- Current Test points to test 1
- All tests have result: [pending]

**During testing:**
- Present test from Current Test section
- User responds with pass confirmation or issue description
- Update test result (pass/issue/skipped)
- Update Summary counts
- If issue: append to Gaps section, infer severity
- Move Current Test to next pending test

**On completion:**
- Status → "complete"
- Current Test → "[testing complete]"
- Present summary with next steps

**Resume after context reset:**
1. Read status → know phase and state
2. Read Current Test → know where we are
3. Find first [pending] result → continue from there
4. Summary shows progress so far

</lifecycle>

<severity_guide>

Severity is INFERRED from user's natural language, never asked.

| User describes | Infer |
|----------------|-------|
| Crash, error, exception, fails completely, unusable | blocker |
| Doesn't work, nothing happens, wrong behavior, missing | major |
| Works but..., slow, weird, minor, small issue | minor |
| Color, font, spacing, alignment, visual, looks off | cosmetic |

Default: **major** (safe default, user can clarify if wrong)

</severity_guide>

<good_example>

```markdown
# Phase 4: Comments - UAT Session

**Status:** diagnosed
**Source:** 04-01 Summary, 04-02 Summary
**Started:** 2025-01-15T10:30:00Z
**Updated:** 2025-01-15T10:45:00Z

## Current Test

[testing complete]

## Tests

### 1. View Comments on Post
**Expected:** Comments section expands, shows count and comment list
**Result:** pass

### 2. Create Top-Level Comment
**Expected:** Submit comment via rich text editor, appears in list with author info
**Result:** issue
**Reported:** "works but doesn't show until I refresh the page"
**Severity:** major

### 3. Reply to a Comment
**Expected:** Click Reply, inline composer appears, submit shows nested reply
**Result:** pass

### 4. Visual Nesting
**Expected:** 3+ level thread shows indentation, left borders, caps at reasonable depth
**Result:** pass

### 5. Delete Own Comment
**Expected:** Click delete on own comment, removed or shows [deleted] if has replies
**Result:** pass

### 6. Comment Count
**Expected:** Post shows accurate count, increments when adding comment
**Result:** pass

## Summary

- **Total:** 6
- **Passed:** 5
- **Issues:** 1
- **Pending:** 0
- **Skipped:** 0

## Gaps

### Gap 1: Comment not appearing immediately
- **Truth:** "Comment appears immediately after submission in list"
- **Status:** failed
- **Reason:** "User reported: works but doesn't show until I refresh the page"
- **Severity:** major
- **Test:** 2
- **Root cause:** useEffect in CommentList.tsx missing commentCount dependency
- **Artifacts:** src/components/CommentList.tsx (useEffect missing dependency)
- **Missing:** Add commentCount to useEffect dependency array
```

</good_example>

<mosic_operations>

**Create UAT session page:**
```javascript
await mosic_create_entity_page("MTask List", task_list_id, {
  title: `Phase ${num} UAT`,
  icon: "lucide:clipboard-check",
  content: uatContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "uat", `phase-${num}`]
});
```

**Update UAT progress:**
```javascript
await mosic_update_content_blocks(page_id, {
  blocks: updatedContent
});
```

**Create gap tasks from UAT:**
```javascript
// For each gap found, create a fix task
for (const gap of gaps) {
  await mosic_create_document("MTask", {
    title: `Fix: ${gap.brief}`,
    description: `Root cause: ${gap.root_cause}\nMissing: ${gap.missing}`,
    task_list: task_list_id,
    workspace: workspace_id,
    priority: gap.severity === "blocker" ? "High" : "Medium"
  });
}
```

**Query UAT status:**
```javascript
const pages = await mosic_get_entity_pages("MTask List", task_list_id);
const uat = pages.find(p => p.title.includes("UAT"));
const content = await mosic_get_page(uat.name, { content_format: "markdown" });
```

</mosic_operations>
