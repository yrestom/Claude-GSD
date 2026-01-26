# Verification Report Page Content Pattern

Content structure for phase goal verification results in Mosic.

**Created via:** `mosic_create_entity_page("MTask List", task_list_id, { title: "[Phase] Verification", icon: "lucide:shield-check" })`
**Page Type:** Document
**Icon:** lucide:shield-check
**Tags:** ["gsd-managed", "verification", "phase-XX"]

---

## Content Structure

```markdown
# Phase [X]: [Name] Verification Report

**Phase Goal:** [goal from roadmap]
**Verified:** [timestamp]
**Status:** passed | gaps_found | human_needed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | [truth from must_haves] | VERIFIED | [what confirmed it] |
| 2 | [truth from must_haves] | FAILED | [what's wrong] |
| 3 | [truth from must_haves] | UNCERTAIN | [why can't verify] |

**Score:** [N]/[M] truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/Chat.tsx` | Message list component | EXISTS + SUBSTANTIVE | Exports ChatList, renders Message[], no stubs |
| `src/app/api/chat/route.ts` | Message CRUD | STUB | File exists but POST returns placeholder |
| `prisma/schema.prisma` | Message model | EXISTS + SUBSTANTIVE | Model defined with all fields |

**Artifacts:** [N]/[M] verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Chat.tsx | /api/chat | fetch in useEffect | WIRED | Line 23: `fetch('/api/chat')` with response handling |
| ChatInput | /api/chat POST | onSubmit handler | NOT WIRED | onSubmit only calls console.log |
| /api/chat POST | database | prisma.message.create | NOT WIRED | Returns hardcoded response, no DB call |

**Wiring:** [N]/[M] connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| [REQ-01]: [description] | SATISFIED | - |
| [REQ-02]: [description] | BLOCKED | API route is stub |
| [REQ-03]: [description] | NEEDS HUMAN | Can't verify WebSocket programmatically |

**Coverage:** [N]/[M] requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app/api/chat/route.ts | 12 | `// TODO: implement` | Warning | Indicates incomplete |
| src/components/Chat.tsx | 45 | `return <div>Placeholder</div>` | Blocker | Renders no content |
| src/hooks/useChat.ts | - | File missing | Blocker | Expected hook doesn't exist |

**Anti-patterns:** [N] found ([blockers] blockers, [warnings] warnings)

## Human Verification Required

[If no human verification needed:]
None - all verifiable items checked programmatically.

[If human verification needed:]

### 1. [Test Name]
**Test:** [What to do]
**Expected:** [What should happen]
**Why human:** [Why can't verify programmatically]

### 2. [Test Name]
**Test:** [What to do]
**Expected:** [What should happen]
**Why human:** [Why can't verify programmatically]

## Gaps Summary

[If no gaps:]
**No gaps found.** Phase goal achieved. Ready to proceed.

[If gaps found:]

### Critical Gaps (Block Progress)

1. **[Gap name]**
   - Missing: [what's missing]
   - Impact: [why this blocks the goal]
   - Fix: [what needs to happen]

2. **[Gap name]**
   - Missing: [what's missing]
   - Impact: [why this blocks the goal]
   - Fix: [what needs to happen]

### Non-Critical Gaps (Can Defer)

1. **[Gap name]**
   - Issue: [what's wrong]
   - Impact: [limited impact because...]
   - Recommendation: [fix now or defer]

## Recommended Fix Plans

[If gaps found, generate fix plan recommendations:]

### Fix Plan 1: [Fix Name]

**Objective:** [What this fixes]

**Tasks:**
1. [Task to fix gap 1]
2. [Task to fix gap 2]
3. [Verification task]

**Estimated scope:** Small | Medium

---

### Fix Plan 2: [Fix Name]

**Objective:** [What this fixes]

**Tasks:**
1. [Task]
2. [Task]

**Estimated scope:** Small | Medium

---

## Verification Metadata

**Verification approach:** Goal-backward (derived from phase goal)
**Must-haves source:** Plan task must_haves
**Automated checks:** [N] passed, [M] failed
**Human checks required:** [N]
**Total verification time:** [duration]

---
*Verified: [timestamp]*
*Verifier: Claude (subagent)*
```

---

<guidelines>

**Status values:**
- `passed` - All must-haves verified, no blockers
- `gaps_found` - One or more critical gaps found
- `human_needed` - Automated checks pass but human verification required

**Evidence types:**
- For EXISTS: "File at path, exports X"
- For SUBSTANTIVE: "N lines, has patterns X, Y, Z"
- For WIRED: "Line N: code that connects A to B"
- For FAILED: "Missing because X" or "Stub because Y"

**Severity levels:**
- Blocker: Prevents goal achievement, must fix
- Warning: Indicates incomplete but doesn't block
- Info: Notable but not problematic

**Fix plan generation:**
- Only generate if gaps_found
- Group related fixes into single plans
- Keep to 2-3 tasks per plan
- Include verification task in each plan

</guidelines>

<mosic_operations>

**Create verification report:**
```javascript
await mosic_create_entity_page("MTask List", task_list_id, {
  title: `Phase ${num} Verification`,
  icon: "lucide:shield-check",
  content: reportContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("M Page", page_id, {
  workspace_id,
  tags: ["gsd-managed", "verification", `phase-${num}`]
});
```

**Create fix tasks from gaps:**
```javascript
for (const gap of criticalGaps) {
  await mosic_create_document("MTask", {
    title: `Fix: ${gap.name}`,
    description: `Missing: ${gap.missing}\nImpact: ${gap.impact}`,
    task_list: task_list_id,
    workspace: workspace_id,
    priority: "High"
  });
}
```

**Update phase status based on verification:**
```javascript
if (status === "passed") {
  await mosic_update_document("MTask List", task_list_id, {
    status: "Completed"
  });
}
```

**Query verification status:**
```javascript
const pages = await mosic_get_entity_pages("MTask List", task_list_id);
const verification = pages.find(p => p.title.includes("Verification"));
const content = await mosic_get_page(verification.name, { content_format: "markdown" });
```

</mosic_operations>
