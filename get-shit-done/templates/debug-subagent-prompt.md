# Debug Subagent Prompt Pattern

System prompt template for spawning debug/diagnosis subagents.

**Usage:** Passed to subagent when diagnosing UAT gaps or issues
**Agent Type:** gsd-debug-subagent
**Tags:** ["gsd-managed", "agent-prompt", "debug"]

> **Note:** Debugging methodology is in the gsd-debugger agent. This template passes problem context only.

---

## Template

```markdown
<objective>
Investigate issue: {issue_id}

**Summary:** {issue_summary}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: {true_or_false}
goal: {find_root_cause_only | find_and_fix}
</mode>

<mosic_context>
**Mosic Task ID:** {mosic_task_id}
**Mosic Project ID:** {mosic_project_id}
**UAT Page ID:** {mosic_uat_page_id}

Debug results will be written back to UAT page Gaps section.
If fix is applied, commit reference will be added.
</mosic_context>
```

---

## Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{issue_id}` | Orchestrator-assigned | `auth-screen-dark` |
| `{issue_summary}` | User description | `Auth screen is too dark` |
| `{expected}` | From symptoms | `See logo clearly` |
| `{actual}` | From symptoms | `Screen is dark` |
| `{errors}` | From symptoms | `None in console` |
| `{reproduction}` | From symptoms | `Open /auth page` |
| `{timeline}` | From symptoms | `After recent deploy` |
| `{goal}` | Orchestrator sets | `find_and_fix` |

---

## Context Loading from Mosic

```javascript
// Load UAT page with gaps
const pages = await mosic_get_entity_pages("MTask List", task_list_id);
const uat = pages.find(p => p.title.includes("UAT"));
const uatContent = await mosic_get_page(uat.name, { content_format: "markdown" });

// Parse gaps from content
const gaps = parseGaps(uatContent);
const targetGap = gaps.find(g => g.id === issue_id);

// Fill template with gap context
const template = fillTemplate({
  issue_id: targetGap.id,
  issue_summary: targetGap.brief,
  expected: targetGap.truth,
  actual: targetGap.reason,
  // ...
});
```

---

## Usage

**From /gsd:debug:**
```python
Task(
  prompt=filled_template,
  subagent_type="gsd-debugger",
  description="Debug {slug}"
)
```

**From diagnose-issues (UAT):**
```python
Task(
  prompt=template,
  subagent_type="gsd-debugger",
  description="Debug UAT gap {gap_id}"
)
```

---

## Output Format

Subagent returns structured diagnosis:

```
ROOT_CAUSE: [Single sentence explaining why this happens]

ARTIFACTS:
- path/to/file.ts (line ~N) - [what's wrong here]
- path/to/file.ts (line ~N) - [what's wrong here]

MISSING:
- [Specific thing that needs to be added or changed]
- [Specific thing that needs to be added or changed]

CONFIDENCE: [HIGH | MEDIUM | LOW]
REASONING: [Why you believe this is the root cause]
```

---

## Output Handling

```javascript
// Update UAT page with diagnosis
const updatedGaps = gaps.map(g => {
  if (g.id === issue_id) {
    return {
      ...g,
      root_cause: diagnosis.root_cause,
      artifacts: diagnosis.artifacts,
      missing: diagnosis.missing
    };
  }
  return g;
});

await mosic_update_content_blocks(uat_page_id, {
  blocks: formatGapsAsContent(updatedGaps)
});

// Create fix task if needed
if (goal === "find_and_fix") {
  await mosic_create_document("MTask", {
    title: `Fix: ${issue_summary}`,
    description: `Root cause: ${diagnosis.root_cause}\n\nMissing:\n${diagnosis.missing.join('\n')}`,
    task_list: task_list_id,
    workspace: workspace_id,
    priority: gap.severity === "blocker" ? "High" : "Medium"
  });
}
```

---

## Parallel Diagnosis

Multiple gaps can be diagnosed in parallel:
- Each gap gets its own debug agent
- Agents have isolated context (no cross-contamination)
- Results aggregated after all complete
- Duplicate root causes merged
