# Planner Subagent Prompt Pattern

System prompt template for spawning planner subagents.

**Usage:** Passed to subagent when delegating plan creation
**Agent Type:** gsd-planner-subagent
**Tags:** ["gsd-managed", "agent-prompt", "planner"]

> **Note:** Planning methodology is in the gsd-planner agent. This template passes planning context only.

---

## Template

```markdown
<planning_context>

**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project Context:**
- Project ID: {mosic_project_id}
- Task List ID: {mosic_task_list_id}
- Workspace ID: {mosic_workspace_id}

**From Mosic:**
- Project state (via mosic_get_project)
- Roadmap page content
- Requirements page content
- Phase context page (if exists)
- Research page (if exists)

**Gap Closure (if --gaps mode):**
- Verification report page
- UAT session page with gaps

</planning_context>

<mosic_integration>
Plans will be created as MTasks with linked M Pages.

When creating plans:
1. Create MTask in phase task list
2. Create linked M Page with detailed plan content
3. Add tags: ["gsd-managed", "plan", "phase-XX", "wave-N"]
4. Create M Relations for dependencies between plans
</mosic_integration>

<downstream_consumer>
Output consumed by /gsd:execute-phase
Plans must be executable prompts with:
- Tasks in structured format
- Verification criteria
- must_haves for goal-backward verification
- Wave assignment for parallel execution
</downstream_consumer>

<quality_gate>
Before returning PLANNING COMPLETE:
- [ ] MTasks created in phase task list
- [ ] Each task has linked M Page with details
- [ ] Tasks are specific and actionable
- [ ] Dependencies tracked via M Relations
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

---

## Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{phase_number}` | From roadmap/arguments | `5` or `2.1` |
| `{mosic_project_id}` | From config | UUID |
| `{mosic_task_list_id}` | Phase task list | UUID |
| `{mosic_workspace_id}` | From config | UUID |

---

## Context Loading from Mosic

```javascript
// Load project context
const project = await mosic_get_project(project_id, { include_task_lists: true });
const pages = await mosic_get_entity_pages("MProject", project_id);

// Load phase context
const taskList = await mosic_get_task_list(task_list_id, { include_tasks: true });
const phasePages = await mosic_get_entity_pages("MTask List", task_list_id);

// Get relevant pages
const roadmap = pages.find(p => p.title === "Roadmap");
const requirements = pages.find(p => p.title === "Requirements");
const context = phasePages.find(p => p.title.includes("Context"));
const research = phasePages.find(p => p.title.includes("Research"));

// Load content as markdown for LLM
const roadmapContent = await mosic_get_page(roadmap.name, { content_format: "markdown" });
```

---

## Usage

**From /gsd:plan-phase (standard mode):**
```python
Task(
  prompt=filled_template,
  subagent_type="gsd-planner",
  description="Plan Phase {phase}"
)
```

**From /gsd:plan-phase --gaps (gap closure mode):**
```python
Task(
  prompt=filled_template,  # with mode: gap_closure
  subagent_type="gsd-planner",
  description="Plan gaps for Phase {phase}"
)
```

---

## Output Handling

Subagent output is:
1. Validated for task count and structure
2. Converted to MTask + M Page in Mosic
3. Dependencies tracked via M Relations
4. Wave assignment recorded in tags

```javascript
// Create plan task
const task = await mosic_create_document("MTask", {
  title: `${phase}-${plan} Plan: ${description}`,
  task_list: task_list_id,
  workspace: workspace_id,
  check_list: acceptanceCriteria
});

// Create linked page
await mosic_create_entity_page("MTask", task.name, {
  title: `${phase}-${plan} Plan Details`,
  content: planContent
});

// Track dependencies
await mosic_create_document("M Relation", {
  from_doctype: "MTask",
  from_name: task.name,
  to_doctype: "MTask",
  to_name: prerequisite_task_id,
  relation_type: "Depends"
});
```
