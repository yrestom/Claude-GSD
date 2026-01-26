---
name: gsd:new-milestone
description: Start a new milestone cycle — update project and route to requirements
argument-hint: "[milestone name, e.g., 'v1.1 Notifications']"
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
  - mcp__mosic_pro__*
---

<objective>
Start a new milestone through unified flow: questioning → research (optional) → requirements → roadmap.

This is the brownfield equivalent of new-project. The project exists in Mosic. This command gathers "what's next", updates the project, then continues through the full requirements → roadmap cycle.

**Mosic-only architecture:** All state stored in Mosic. Local config.json for session context only.

**Creates/Updates:**
- MProject in Mosic — updated with new milestone goals
- M Pages — research documents (optional, focuses on NEW features)
- M Page — requirements page scoped for this milestone
- MTask Lists — phases for this milestone
- config.json — local session context

**After this command:** Run `/gsd:plan-phase [N]` to start execution.
</objective>

<execution_context>
@~/.claude/get-shit-done/references/questioning.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/templates/project.md
@~/.claude/get-shit-done/templates/requirements.md
</execution_context>

<context>
Milestone name: $ARGUMENTS (optional - will prompt if not provided)

Load from Mosic MCP:
- config.json → workspace_id, project_id
- mosic_get_project(project_id, { include_task_lists: true }) → existing project
- mosic_get_entity_pages("MProject", project_id, { content_format: "markdown" }) → project docs
</context>

<process>

## Phase 1: Load Context from Mosic

```bash
WORKSPACE_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.project_id")
```

```
# Get project with task lists
project = mosic_get_project(PROJECT_ID, { include_task_lists: true })

# Get project documentation
project_pages = mosic_get_entity_pages("MProject", PROJECT_ID, {
  content_format: "markdown"
})

# Find key pages
overview_page = project_pages.find(p => p.title.includes("Overview"))
requirements_page = project_pages.find(p => p.title.includes("Requirements"))
milestones_page = project_pages.find(p => p.title.includes("Milestones"))

# Get completed phases (for numbering)
completed_phases = project.task_lists.filter(tl =>
  tl.status == "Completed" || tl.status == "Done"
)
```

## Phase 2: Gather Milestone Goals

**If milestone context exists (from /gsd:discuss-milestone):**
- Check for recent milestone context page
- Use features and scope from discussion
- Present summary for confirmation

**If no context:**
- Present what shipped in last milestone
- Ask: "What do you want to build next?"
- Use AskUserQuestion to explore features
- Probe for priorities, constraints, scope

## Phase 3: Determine Milestone Version

- Parse last version from milestones page or project metadata
- Suggest next version (v1.0 → v1.1, or v2.0 for major)
- Confirm with user

## Phase 4: Update Project in Mosic

```
# Update project with new milestone info
mosic_update_document("MProject", PROJECT_ID, {
  description: build_milestone_description({
    current_milestone: milestone_version,
    milestone_name: milestone_name,
    goal: milestone_goal,
    features: milestone_features
  })
})

# Create/update milestone overview page
milestone_overview = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Milestone v" + milestone_version + " Overview",
  page_type: "Document",
  icon: "lucide:rocket",
  status: "Published",
  content: build_milestone_overview_content({
    version: milestone_version,
    name: milestone_name,
    goal: milestone_goal,
    features: milestone_features
  }),
  relation_type: "Related"
})

# Tag the page
GSD_MANAGED_TAG = config.mosic.tags.gsd_managed
mosic_add_tag_to_document("M Page", milestone_overview.name, GSD_MANAGED_TAG)
```

## Phase 5: Update Session Context

Update config.json with milestone session:

```json
{
  "session": {
    "current_milestone": "v[X.Y]",
    "milestone_name": "[name]",
    "status": "defining_requirements",
    "last_activity": "[timestamp]"
  }
}
```

## Phase 6: Resolve Model Profile

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat config.json 2>/dev/null | jq -r ".model_profile // \"balanced\"")
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-project-researcher | opus | sonnet | haiku |
| gsd-research-synthesizer | sonnet | sonnet | haiku |
| gsd-roadmapper | opus | sonnet | sonnet |

## Phase 7: Research Decision

Use AskUserQuestion:
- header: "Research"
- question: "Research the domain ecosystem for new features before defining requirements?"
- options:
  - "Research first (Recommended)" — Discover patterns, expected features, architecture for NEW capabilities
  - "Skip research" — I know what I need, go straight to requirements

**If "Research first":**

Display stage banner and spawn 4 parallel researcher agents.

Research pages created as M Pages linked to project:

```
FOR each research_type in ["STACK", "FEATURES", "ARCHITECTURE", "PITFALLS"]:
  research_page = mosic_create_entity_page("MProject", PROJECT_ID, {
    workspace_id: WORKSPACE_ID,
    title: "Milestone v" + milestone_version + " Research - " + research_type,
    page_type: "Document",
    icon: "lucide:search",
    status: "Draft",
    content: research_content,
    relation_type: "Related"
  })

  mosic_batch_add_tags_to_document("M Page", research_page.name, [
    GSD_MANAGED_TAG,
    config.mosic.tags.research
  ])
```

Spawn synthesizer to create SUMMARY page linking all research.

**If "Skip research":** Continue to Phase 8.

## Phase 8: Define Requirements

Display stage banner. Gather requirements through conversation.

**Generate requirements page in Mosic:**

```
requirements_content = build_requirements_content({
  milestone: milestone_version,
  categories: requirement_categories,
  requirements: requirements_list,
  future: future_requirements,
  out_of_scope: exclusions
})

requirements_page = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Milestone v" + milestone_version + " Requirements",
  page_type: "Spec",
  icon: "lucide:list-checks",
  status: "Published",
  content: requirements_content,
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", requirements_page.name, [
  GSD_MANAGED_TAG,
  config.mosic.tags.requirements
])
```

## Phase 9: Create Roadmap

Display stage banner and spawn gsd-roadmapper agent.

**Determine starting phase number:**

```
# Find highest phase number from completed task lists
max_phase = completed_phases
  .map(tl => extract_phase_number(tl.title))
  .filter(n => !isNaN(n))
  .max() || 0

starting_phase = max_phase + 1
```

Roadmapper creates MTask Lists for each phase:

```
FOR each phase in roadmap:
  # Create phase tag
  phase_tag = mosic_create_document("M Tag", {
    workspace_id: WORKSPACE_ID,
    title: "phase-" + phase.number,
    color: "#3B82F6"
  })

  # Create MTask List
  task_list = mosic_create_document("MTask List", {
    workspace_id: WORKSPACE_ID,
    project: PROJECT_ID,
    title: "Phase " + phase.number + ": " + phase.name,
    description: phase.goal,
    icon: "lucide:layers",
    color: "#64748B",
    status: "Backlog",
    prefix: "P" + phase.number
  })

  # Tag the task list
  mosic_batch_add_tags_to_document("MTask List", task_list.name, [
    GSD_MANAGED_TAG,
    phase_tag.name
  ])

  # Create Depends relation to previous phase
  IF prev_task_list:
    mosic_create_document("M Relation", {
      workspace_id: WORKSPACE_ID,
      source_doctype: "MTask List",
      source_name: task_list.name,
      target_doctype: "MTask List",
      target_name: prev_task_list,
      relation_type: "Depends"
    })

  # Store mapping
  config.mosic.task_lists["phase-" + phase.number] = task_list.name
  config.mosic.tags.phase_tags["phase-" + phase.number] = phase_tag.name
  prev_task_list = task_list.name
```

**Present roadmap and get approval** before continuing.

## Phase 10: Update config.json

```json
{
  "mosic": {
    "project_id": "[PROJECT_ID]",
    "workspace_id": "[WORKSPACE_ID]",
    "task_lists": {
      "phase-6": "[task_list_id]",
      "phase-7": "[task_list_id]",
      "phase-8": "[task_list_id]"
    },
    "pages": {
      "milestone-v1.1-overview": "[page_id]",
      "milestone-v1.1-requirements": "[page_id]",
      "milestone-v1.1-research-summary": "[page_id]"
    },
    "tags": {
      "gsd_managed": "[tag_id]",
      "requirements": "[tag_id]",
      "research": "[tag_id]",
      "phase_tags": {
        "phase-6": "[tag_id]",
        "phase-7": "[tag_id]"
      }
    },
    "last_sync": "[timestamp]"
  },
  "session": {
    "current_milestone": "v1.1",
    "milestone_name": "[name]",
    "status": "ready",
    "starting_phase": 6,
    "last_activity": "[timestamp]"
  }
}
```

## Phase 11: Done

Present completion with next steps:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MILESTONE INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone v[X.Y]: [Name]**

| Artifact       | Location                                    |
|----------------|---------------------------------------------|
| Project        | https://mosic.pro/app/MProject/[PROJECT_ID] |
| Overview       | https://mosic.pro/app/page/[overview_id]    |
| Requirements   | https://mosic.pro/app/page/[requirements_id]|
| Research       | https://mosic.pro/app/page/[research_id]    |

**[N] phases** | **[X] requirements** | Ready to build ✓

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Phase [N]: [Phase Name]** — [Goal]

`/gsd:discuss-phase [N]` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase [N]` — skip discussion, plan directly

───────────────────────────────────────────────────────────────
```

</process>

<error_handling>
```
IF mosic operation fails:
  - Display warning: "Mosic operation failed: [error]. Retrying..."
  - Implement retry with exponential backoff
  - After 3 failures, add to config.mosic.pending_sync
  - Continue if possible (don't block)
```
</error_handling>

<success_criteria>
- [ ] Project context loaded from Mosic
- [ ] Milestone goals gathered from user
- [ ] MProject updated with milestone info
- [ ] Milestone overview page created
- [ ] Research completed (if selected) — pages created in Mosic
- [ ] Requirements gathered and page created
- [ ] Roadmapper spawned with phase numbering context
- [ ] MTask Lists created for each phase
- [ ] Depends relations created between phases
- [ ] Tags applied (gsd-managed, phase-NN)
- [ ] config.json updated with all mappings
- [ ] User knows next step is `/gsd:discuss-phase [N]`
</success_criteria>
