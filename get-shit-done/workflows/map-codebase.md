<purpose>
Orchestrate parallel codebase mapper agents to analyze codebase and produce structured pages in Mosic.

Each agent has fresh context, explores a specific focus area, and **creates pages directly in Mosic**. The orchestrator only receives confirmation, then writes a summary.

Output: Mosic pages about the codebase state linked to the project.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/codebase/` directory operations
</mosic_only>

<philosophy>
**Why dedicated mapper agents:**
- Fresh context per domain (no token contamination)
- Agents create pages directly in Mosic (no context transfer back to orchestrator)
- Orchestrator only summarizes what was created (minimal context usage)
- Faster execution (agents run simultaneously)

**Document quality over length:**
Include enough detail to be useful as reference. Prioritize practical examples (especially code patterns) over arbitrary brevity.

**Always include file paths:**
Documents are reference material for Claude when planning/executing. Always include actual file paths formatted with backticks: `src/services/user.ts`.
</philosophy>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic:**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- pages (page IDs)
- tags (tag IDs)
- model_profile (default: balanced)
```

```javascript
// Load project
project = mosic_get_project(project_id)

// Check for existing codebase pages
project_pages = mosic_get_entity_pages("MProject", project_id)
codebase_pages = project_pages.filter(p =>
  p.title.includes("Architecture") ||
  p.title.includes("Tech Stack") ||
  p.title.includes("Conventions") ||
  p.title.includes("Concerns")
)
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-codebase-mapper | sonnet | haiku | haiku |

Store resolved model for use in Task calls below.
</step>

<step name="check_existing">
Check if codebase pages already exist:

**If codebase pages exist:**

```
Codebase pages already exist:
[List pages found]

What's next?
1. Refresh - Delete existing and remap codebase
2. Update - Keep existing, only update specific pages
3. Skip - Use existing codebase map as-is
```

Wait for user response.

If "Refresh": Delete pages, continue to spawn_agents
If "Update": Ask which pages to update, continue to spawn_agents (filtered)
If "Skip": Exit workflow

**If no codebase pages exist:**
Continue to spawn_agents.
</step>

<step name="spawn_agents">
Spawn 4 parallel gsd-codebase-mapper agents.

Use Task tool with `subagent_type="gsd-codebase-mapper"`, `model="{mapper_model}"`, and `run_in_background=true` for parallel execution.

**Agent 1: Tech Focus**

```javascript
Task(
  prompt = `
Focus: tech

Analyze this codebase for technology stack and external integrations.

Create these pages in Mosic linked to project ${project_id}:
- "Tech Stack" - Languages, runtime, frameworks, dependencies, configuration
- "Integrations" - External APIs, databases, auth providers, webhooks

Workspace ID: ${workspace_id}
Project ID: ${project_id}

Explore thoroughly. Create pages directly in Mosic. Return confirmation only.
`,
  subagent_type = "gsd-codebase-mapper",
  model = mapper_model,
  run_in_background = true,
  description = "Map codebase tech stack"
)
```

**Agent 2: Architecture Focus**

```javascript
Task(
  prompt = `
Focus: arch

Analyze this codebase architecture and directory structure.

Create these pages in Mosic linked to project ${project_id}:
- "Architecture" - Pattern, layers, data flow, abstractions, entry points
- "Structure" - Directory layout, key locations, naming conventions

Workspace ID: ${workspace_id}
Project ID: ${project_id}

Explore thoroughly. Create pages directly in Mosic. Return confirmation only.
`,
  subagent_type = "gsd-codebase-mapper",
  model = mapper_model,
  run_in_background = true,
  description = "Map codebase architecture"
)
```

**Agent 3: Quality Focus**

```javascript
Task(
  prompt = `
Focus: quality

Analyze this codebase for coding conventions and testing patterns.

Create these pages in Mosic linked to project ${project_id}:
- "Conventions" - Code style, naming, patterns, error handling
- "Testing" - Framework, structure, mocking, coverage

Workspace ID: ${workspace_id}
Project ID: ${project_id}

Explore thoroughly. Create pages directly in Mosic. Return confirmation only.
`,
  subagent_type = "gsd-codebase-mapper",
  model = mapper_model,
  run_in_background = true,
  description = "Map codebase conventions"
)
```

**Agent 4: Concerns Focus**

```javascript
Task(
  prompt = `
Focus: concerns

Analyze this codebase for technical debt, known issues, and areas of concern.

Create this page in Mosic linked to project ${project_id}:
- "Technical Concerns" - Tech debt, bugs, security, performance, fragile areas

Workspace ID: ${workspace_id}
Project ID: ${project_id}

Explore thoroughly. Create page directly in Mosic. Return confirmation only.
`,
  subagent_type = "gsd-codebase-mapper",
  model = mapper_model,
  run_in_background = true,
  description = "Map codebase concerns"
)
```

Continue to collect_confirmations.
</step>

<step name="collect_confirmations">
Wait for all 4 agents to complete.

**Expected confirmation format from each agent:**
```
## Mapping Complete

**Focus:** {focus}
**Pages created:**
- {page_title} (ID: {page_id})
- {page_title} (ID: {page_id})

Ready for orchestrator summary.
```

Collect page IDs from agent returns.

If any agent failed, note the failure and continue with successful pages.

Continue to verify_output.
</step>

<step name="verify_output">
Verify all pages created successfully:

```javascript
// Refresh project pages
project_pages = mosic_get_entity_pages("MProject", project_id)
codebase_pages = project_pages.filter(p =>
  p.title.includes("Architecture") ||
  p.title.includes("Tech Stack") ||
  p.title.includes("Conventions") ||
  p.title.includes("Testing") ||
  p.title.includes("Concerns") ||
  p.title.includes("Structure") ||
  p.title.includes("Integrations")
)

console.log("Found " + codebase_pages.length + " codebase pages")
```

**Verification checklist:**
- All expected pages exist
- No empty pages (each should have content)

If any pages missing, note which agents may have failed.

Continue to tag_pages.
</step>

<step name="tag_pages">
**Tag all codebase pages:**

```javascript
for (page of codebase_pages) {
  mosic_batch_add_tags_to_document("M Page", page.name, [
    tags.gsd_managed,
    "codebase"
  ])
}
```

</step>

<step name="update_config">
**Update config.json with page IDs:**

```javascript
config.pages["codebase-architecture"] = architecture_page_id
config.pages["codebase-stack"] = stack_page_id
config.pages["codebase-conventions"] = conventions_page_id
config.pages["codebase-testing"] = testing_page_id
config.pages["codebase-concerns"] = concerns_page_id
config.pages["codebase-structure"] = structure_page_id
config.pages["codebase-integrations"] = integrations_page_id
config.last_sync = new Date().toISOString()

// Write config.json
```

**Confirm commit with user:**

Use AskUserQuestion:
- Question: "Commit codebase mapping to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
docs: map existing codebase to Mosic

Pages created:
- Architecture & Structure
- Tech Stack & Integrations
- Conventions & Testing
- Technical Concerns
EOF
)"
```

</step>

<step name="offer_next">
Present completion summary and next steps.

**Output format:**

```
Codebase mapping complete.

Created in Mosic:
- Architecture: https://mosic.pro/app/page/[id]
- Structure: https://mosic.pro/app/page/[id]
- Tech Stack: https://mosic.pro/app/page/[id]
- Integrations: https://mosic.pro/app/page/[id]
- Conventions: https://mosic.pro/app/page/[id]
- Testing: https://mosic.pro/app/page/[id]
- Concerns: https://mosic.pro/app/page/[id]

---

## ▶ Next Up

**Initialize project** — use codebase context for planning

`/gsd:new-project`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Re-run mapping: `/gsd:map-codebase`
- Review pages in Mosic

---
```

End workflow.
</step>

</process>

<success_criteria>
- [ ] Mosic context loaded (project, existing pages)
- [ ] 4 parallel gsd-codebase-mapper agents spawned
- [ ] Agents create pages directly in Mosic linked to project
- [ ] Confirmations collected from all agents
- [ ] All 7 codebase pages exist in Mosic
- [ ] All pages tagged with gsd_managed and codebase
- [ ] config.json updated with page IDs
- [ ] Clear completion summary with page URLs
- [ ] User offered clear next steps in GSD style
</success_criteria>
