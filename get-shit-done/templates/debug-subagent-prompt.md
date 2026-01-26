# Debug Subagent Prompt Template

Template for spawning gsd-debugger agent. The agent contains all debugging expertise - this template provides problem context only.

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

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>

<mosic_context>
<!-- Mosic integration context - populated when synced -->
**Mosic Task ID:** {mosic_task_id}
**Mosic Project ID:** {mosic_project_id}

When creating debug files, include Mosic frontmatter:
- mosic_page_id: Leave empty (populated on sync)
- mosic_source_task_id: Task that spawned this debug session
- mosic_tags: ["debug", "investigation", "gsd-managed"]

Debug sessions will be synced to Mosic as M Pages linked to source tasks.
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
| `{slug}` | Generated | `auth-screen-dark` |

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
Task(prompt=template, subagent_type="gsd-debugger", description="Debug UAT-001")
```

---

## Continuation

For checkpoints, spawn fresh agent with:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: {goal}
</mode>
```
