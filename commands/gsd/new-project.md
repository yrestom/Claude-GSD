---
name: gsd:new-project
description: Initialize a new project directly in Mosic MCP - single source of truth
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
  - mcp__mosic_pro__*
---

<objective>

Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

**CRITICAL: Mosic is the ONLY storage.** All project data lives in Mosic. The only local file is `config.json` for session context and Mosic entity ID references.

This is the most leveraged moment in any project. Deep questioning here means better plans, better execution, better outcomes. One command takes you from idea to ready-for-planning.

**Creates in Mosic:**
- MProject — project entity with metadata
- M Page "Project Overview" — project context (replaces PROJECT.md)
- M Page "Requirements" — scoped requirements (replaces REQUIREMENTS.md)
- M Page "Roadmap" — phase structure (replaces ROADMAP.md)
- M Pages for research — domain research (optional, replaces .planning/research/)
- MTask Lists — one per phase (replaces STATE.md tracking)

**Creates locally:**
- `config.json` — session context with Mosic entity IDs

**After this command:** Run `/gsd:plan-phase 1` to start execution.

</objective>

<execution_context>

@~/.claude/get-shit-done/references/questioning.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/templates/project.md
@~/.claude/get-shit-done/templates/requirements.md

</execution_context>

<process>

## Phase 1: Setup and Mosic Validation

**MANDATORY FIRST STEP — Execute these checks before ANY user interaction:**

1. **Check for existing project (via config.json):**
   ```bash
   if [ -f config.json ]; then
     EXISTING_PROJECT_ID=$(cat config.json 2>/dev/null | grep -o '"project_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
     if [ -n "$EXISTING_PROJECT_ID" ]; then
       echo "ERROR: Project already initialized (Mosic project: $EXISTING_PROJECT_ID). Use /gsd:progress"
       exit 1
     fi
   fi
   ```

2. **Verify Mosic MCP is available:**
   ```bash
   if [ -f .mcp.json ]; then
     MOSIC_AVAILABLE=$(grep -l "mosic" .mcp.json 2>/dev/null && echo "yes" || echo "no")
   else
     MOSIC_AVAILABLE="no"
   fi
   echo "Mosic MCP available: $MOSIC_AVAILABLE"
   ```

   **If Mosic NOT available:**
   Display error and abort:
   ```
   ERROR: Mosic MCP not configured.

   This command requires Mosic MCP as the primary storage backend.
   Please configure .mcp.json with mosic_pro server first.

   See: https://mosic.pro/docs/mcp-setup
   ```
   Exit command.

3. **Initialize git repo in THIS directory** (required even if inside a parent repo):
   ```bash
   if [ -d .git ] || [ -f .git ]; then
       echo "Git repo exists in current directory"
   else
       git init
       echo "Initialized new git repo"
   fi
   ```

4. **Detect existing code (brownfield detection):**
   ```bash
   CODE_FILES=$(find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" 2>/dev/null | grep -v node_modules | grep -v .git | head -20)
   HAS_PACKAGE=$([ -f package.json ] || [ -f requirements.txt ] || [ -f Cargo.toml ] || [ -f go.mod ] || [ -f Package.swift ] && echo "yes")
   ```

   **You MUST run all bash commands above using the Bash tool before proceeding.**

## Phase 2: Brownfield Offer

**If existing code detected:**

Check the results from setup step:
- If `CODE_FILES` is non-empty OR `HAS_PACKAGE` is "yes"

Use AskUserQuestion:
- header: "Existing Code"
- question: "I detected existing code in this directory. Would you like to map the codebase first?"
- options:
  - "Map codebase first" — Run /gsd:map-codebase to understand existing architecture (Recommended)
  - "Skip mapping" — Proceed with project initialization

**If "Map codebase first":**
```
Run `/gsd:map-codebase` first, then return to `/gsd:new-project`
```
Exit command.

**If "Skip mapping":** Continue to Phase 3.

**If no existing code detected:** Continue to Phase 3.

## Phase 3: Deep Questioning

**Display stage banner:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Open the conversation:**

Ask inline (freeform, NOT AskUserQuestion):

"What do you want to build?"

Wait for their response. This gives you the context needed to ask intelligent follow-up questions.

**Follow the thread:**

Based on what they said, ask follow-up questions that dig into their response. Use AskUserQuestion with options that probe what they mentioned — interpretations, clarifications, concrete examples.

Keep following threads. Each answer opens new threads to explore. Ask about:
- What excited them
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

Consult `questioning.md` for techniques:
- Challenge vagueness
- Make abstract concrete
- Surface assumptions
- Find edges
- Reveal motivation

**Check context (background, not out loud):**

As you go, mentally check the context checklist from `questioning.md`. If gaps remain, weave questions naturally. Don't suddenly switch to checklist mode.

**Decision gate:**

When you could write a clear project overview, use AskUserQuestion:

- header: "Ready?"
- question: "I think I understand what you're after. Ready to create the project in Mosic?"
- options:
  - "Create project" — Let's move forward
  - "Keep exploring" — I want to share more / ask me more

If "Keep exploring" — ask what they want to add, or identify gaps and probe naturally.

Loop until "Create project" selected.

## Phase 4: Create MProject and Overview Page in Mosic

**Display stage banner:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CREATING PROJECT IN MOSIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 1: Resolve Workspace

**Get workspace_id from CLAUDE.md or list available:**
```
# Check CLAUDE.md for documented workspace_id first
workspace_id = extract from CLAUDE.md "Workspace ID:" line

# If not found, list available workspaces
IF workspace_id is null:
  workspaces = mosic_list_workspaces({ include_stats: true })

  IF workspaces.count == 1:
    workspace_id = workspaces[0].name
  ELSE:
    Use AskUserQuestion to select workspace
```

### Step 2: Search for Existing Project (Handle Both New & Existing)

```
# Search by exact name match first
existing_projects = mosic_advanced_search({
  workspace_id: workspace_id,
  doctypes: ["MProject"],
  query: "[project_name]",
  limit: 10
})

# Also search for projects with similar names or GSD-managed tag
gsd_projects = mosic_search_documents_by_tags({
  workspace_id: workspace_id,
  tag_ids: [gsd_managed_tag_id],
  document_types: ["MProject"],
  search_query: "[project_name]"
}) IF gsd_managed_tag exists
```

### Step 3: Handle Existing Project Discovery

**If existing project found:**

```
# Analyze existing project structure
existing = mosic_get_project(project_id, {
  include_task_lists: true,
  include_comments: true
})

existing_pages = mosic_get_entity_pages("MProject", project_id, {
  include_subtree: true,
  include_content: false
})

existing_relations = mosic_get_document_relations("MProject", project_id)
```

Use AskUserQuestion:
- header: "Existing Project"
- question: "Found Mosic project '[name]' with [N] task lists, [M] pages. How to proceed?"
- options:
  - "Link & Sync" — Link to existing, sync missing elements only (Recommended)
  - "Link & Reset" — Link to existing, archive old content, start fresh
  - "Create New" — Create separate Mosic project

**If "Link & Sync" (Intelligent Merge):**
```
# Detect what exists vs what's missing
existing_elements = {
  has_overview: existing_pages.find(p => p.title.includes("Overview")),
  has_requirements: existing_pages.find(p => p.title.includes("Requirements")),
  has_roadmap: existing_pages.find(p => p.title.includes("Roadmap")),
  phase_lists: existing.task_lists.filter(tl => tl.title.includes("Phase"))
}

# Only create what's missing
IF NOT existing_elements.has_overview:
  create Overview page
IF NOT existing_elements.has_requirements:
  create Requirements page
# etc.

# Store existing IDs in config.json for mapping
```

**If "Link & Reset":**
```
# Archive existing content (soft delete)
FOR each task_list in existing.task_lists:
  mosic_update_document("MTask List", task_list.name, { is_archived: true })

FOR each page in existing_pages:
  mosic_update_document("M Page", page.name, { is_archived: true })

# Proceed with fresh creation
```

### Step 4: Create/Ensure GSD Tags Exist

**Tag infrastructure setup (idempotent):**
```
# Search for existing GSD tags
existing_tags = mosic_search_tags({ workspace_id, query: "gsd" })

# Define required tags with colors
required_tags = [
  { title: "gsd-managed", color: "#10B981", description: "Managed by GSD framework" },
  { title: "requirements", color: "#6366F1", description: "Requirements documentation" },
  { title: "research", color: "#8B5CF6", description: "Research and investigation" },
  { title: "plan", color: "#F59E0B", description: "Execution plans" },
  { title: "summary", color: "#22C55E", description: "Completion summaries" },
  { title: "verification", color: "#06B6D4", description: "Verification reports" },
  { title: "uat", color: "#EC4899", description: "User acceptance testing" },
  { title: "quick", color: "#78716C", description: "Quick tasks outside roadmap" },
  { title: "fix", color: "#EF4444", description: "Bug fixes and issue resolution" }
]

FOR each required_tag:
  existing = existing_tags.find(t => t.title == required_tag.title)
  IF existing:
    tag_ids[required_tag.title] = existing.name
  ELSE:
    new_tag = mosic_create_document("M Tag", {
      workspace_id: workspace_id,
      title: required_tag.title,
      color: required_tag.color,
      description: required_tag.description
    })
    tag_ids[required_tag.title] = new_tag.name

# Store tag IDs in config.json mosic.tags section

# Initialize topic tag registries (populated during research)
config.mosic.tags.topic_tags = {}
config.mosic.tags.phase_topic_tags = {}
```

### Step 5: Create MProject

**If creating new project:**
```
project = mosic_create_document("MProject", {
  workspace_id: workspace_id,
  space: space_id,  # Optional: place in specific space
  title: "[project_name]",
  description: "[from questioning - core value / what this is]",
  prefix: "[derived from project name, e.g., 'GSD']",
  icon: "lucide:rocket",
  color: "#10B981",
  status: "Backlog",
  priority: "Normal",
  start_date: "[today]",
  target_date: "[estimated based on scope, optional]"
})

project_id = project.name
```

**Tag the project:**
```
mosic_add_tag_to_document("MProject", project_id, tag_ids["gsd-managed"])
```

### Step 6: Create Project Overview Page

**Synthesize questioning into Overview page content:**

Content should include (from templates/project.md structure):
- What This Is (one-liner)
- Core Value (the ONE thing)
- Why It Matters (problem being solved)
- Who It's For (target user)
- Constraints (budget, timeline, tech)
- Key Decisions (from questioning)
- Requirements section (initialized as hypotheses)

```
overview_page = mosic_create_entity_page("MProject", project_id, {
  workspace_id: workspace_id,
  title: "Project Overview",
  page_type: "Document",
  icon: "lucide:book-open",
  status: "Published",
  content: "[PROJECT.md-style content in Editor.js format]",
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", overview_page.name, [
  tag_ids["gsd-managed"]
])
```

**For greenfield projects:**

Initialize requirements section as hypotheses in the Overview page:

```markdown
## Requirements

### Validated
(None yet — ship to validate)

### Active
- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Out of Scope
- [Exclusion 1] — [why]
- [Exclusion 2] — [why]
```

**For brownfield projects (existing codebase):**

Infer Validated requirements from existing code analysis.

Display:
```
✓ MProject created: [project_name]
  URL: https://mosic.pro/app/Project/[project_id]
✓ Overview page created
  URL: https://mosic.pro/app/page/[overview_page_id]
```

## Phase 5: Workflow Preferences (config.json)

**Round 1 — Core workflow settings (4 questions):**

```
questions: [
  {
    header: "Mode",
    question: "How do you want to work?",
    multiSelect: false,
    options: [
      { label: "YOLO (Recommended)", description: "Auto-approve, just execute" },
      { label: "Interactive", description: "Confirm at each step" }
    ]
  },
  {
    header: "Depth",
    question: "How thorough should planning be?",
    multiSelect: false,
    options: [
      { label: "Quick", description: "Ship fast (3-5 phases, 1-3 plans each)" },
      { label: "Standard", description: "Balanced scope and speed (5-8 phases, 3-5 plans each)" },
      { label: "Comprehensive", description: "Thorough coverage (8-12 phases, 5-10 plans each)" }
    ]
  },
  {
    header: "Execution",
    question: "Run plans in parallel?",
    multiSelect: false,
    options: [
      { label: "Parallel (Recommended)", description: "Independent plans run simultaneously" },
      { label: "Sequential", description: "One plan at a time" }
    ]
  },
  {
    header: "Git Tracking",
    question: "Commit config.json to git?",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Session config tracked in version control" },
      { label: "No", description: "Keep config.json local-only (add to .gitignore)" }
    ]
  }
]
```

**Round 2 — Workflow agents:**

These spawn additional agents during planning/execution. They add tokens and time but improve quality.

| Agent | When it runs | What it does |
|-------|--------------|--------------|
| **Researcher** | Before planning each phase | Investigates domain, finds patterns, surfaces gotchas |
| **Plan Checker** | After plan is created | Verifies plan actually achieves the phase goal |
| **Verifier** | After phase execution | Confirms must-haves were delivered |

All recommended for important projects. Skip for quick experiments.

```
questions: [
  {
    header: "Research",
    question: "Research before planning each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Investigate domain, find patterns, surface gotchas" },
      { label: "No", description: "Plan directly from requirements" }
    ]
  },
  {
    header: "Plan Check",
    question: "Verify plans will achieve their goals? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Catch gaps before execution starts" },
      { label: "No", description: "Execute plans without verification" }
    ]
  },
  {
    header: "Verifier",
    question: "Verify work satisfies requirements after each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Confirm deliverables match phase goals" },
      { label: "No", description: "Trust execution, skip verification" }
    ]
  },
  {
    header: "Model Profile",
    question: "Which AI models for planning agents?",
    multiSelect: false,
    options: [
      { label: "Balanced (Recommended)", description: "Sonnet for most agents — good quality/cost ratio" },
      { label: "Quality", description: "Opus for research/roadmap — higher cost, deeper analysis" },
      { label: "Budget", description: "Haiku where possible — fastest, lowest cost" }
    ]
  }
]
```

**Create config.json with all settings:**

```json
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true|false,
  "commit_docs": true|false,
  "model_profile": "quality|balanced|budget",
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false
  },
  "mosic": {
    "workspace_id": "[workspace_id]",
    "space_id": "[space_id or null]",
    "project_id": "[project_id]",
    "project_url": "https://mosic.pro/app/Project/[project_id]",
    "task_lists": {},
    "tasks": {},
    "pages": {
      "overview": "[overview_page_id]",
      "requirements": null,
      "roadmap": null,
      "research": {}
    },
    "tags": {
      "gsd_managed": "[tag_id]",
      "requirements": "[tag_id]",
      "research": "[tag_id]",
      "plan": "[tag_id]",
      "summary": "[tag_id]",
      "verification": "[tag_id]",
      "uat": "[tag_id]",
      "quick": "[tag_id]",
      "fix": "[tag_id]",
      "phase_tags": {},
      "topic_tags": {},
      "phase_topic_tags": {}
    },
    "last_sync": "[ISO timestamp]"
  }
}
```

**If commit_docs = No:**
- Set `commit_docs: false` in config.json
- Add `config.json` to `.gitignore` (create if needed)

**If commit_docs = Yes:**

Use AskUserQuestion to confirm:
- Question: "Commit GSD project config to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
chore: initialize GSD project config

Mode: [chosen mode]
Depth: [chosen depth]
Mosic project: [project_id]
EOF
)"
```

**Note:** Run `/gsd:settings` anytime to update these preferences.

## Phase 5.5: Resolve Model Profile

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-project-researcher | opus | sonnet | haiku |
| gsd-research-synthesizer | sonnet | sonnet | haiku |
| gsd-roadmapper | opus | sonnet | sonnet |

Store resolved models for use in Task calls below.

## Phase 6: Research Decision

Use AskUserQuestion:
- header: "Research"
- question: "Research the domain ecosystem before defining requirements?"
- options:
  - "Research first (Recommended)" — Discover standard stacks, expected features, architecture patterns
  - "Skip research" — I know this domain well, go straight to requirements

**If "Research first":**

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Researching [domain] ecosystem...
```

**Determine milestone context:**

Check if this is greenfield or subsequent milestone:
- If no "Validated" requirements in Overview page → Greenfield (building from scratch)
- If "Validated" requirements exist → Subsequent milestone (adding to existing app)

Display spawning indicator:
```
◆ Spawning 4 researchers in parallel...
  → Stack research
  → Features research
  → Architecture research
  → Pitfalls research
```

Spawn 4 parallel gsd-project-researcher agents with rich context.

**IMPORTANT: Research output goes to Mosic pages, NOT local files.**

Each researcher should create their output as a Mosic page linked to the project:

```
Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Stack dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]
</milestone_context>

<question>
What's the standard 2025 stack for [domain]?
</question>

<project_context>
[Project overview summary - core value, constraints, what they're building]
Mosic project_id: [project_id]
Mosic workspace_id: [workspace_id]
</project_context>

<downstream_consumer>
Your research feeds into roadmap creation. Be prescriptive:
- Specific libraries with versions
- Clear rationale for each choice
- What NOT to use and why
</downstream_consumer>

<output>
Create Mosic page using mosic_create_entity_page:
- entity_doctype: 'MProject'
- entity_name: [project_id]
- title: 'Research: Stack'
- page_type: 'Document'
- icon: 'lucide:layers'
- Add tags: gsd-managed, research

Return the page_id when done.
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Stack research")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Features dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]
</milestone_context>

<question>
What features do [domain] products have? What's table stakes vs differentiating?
</question>

<project_context>
[Project overview summary]
Mosic project_id: [project_id]
Mosic workspace_id: [workspace_id]
</project_context>

<output>
Create Mosic page using mosic_create_entity_page:
- entity_doctype: 'MProject'
- entity_name: [project_id]
- title: 'Research: Features'
- page_type: 'Document'
- icon: 'lucide:list-checks'
- Add tags: gsd-managed, research

Return the page_id when done.
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Features research")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Architecture dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]
</milestone_context>

<question>
How are [domain] systems typically structured? What are major components?
</question>

<project_context>
[Project overview summary]
Mosic project_id: [project_id]
Mosic workspace_id: [workspace_id]
</project_context>

<output>
Create Mosic page using mosic_create_entity_page:
- entity_doctype: 'MProject'
- entity_name: [project_id]
- title: 'Research: Architecture'
- page_type: 'Document'
- icon: 'lucide:git-branch'
- Add tags: gsd-managed, research

Return the page_id when done.
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Architecture research")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Pitfalls dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]
</milestone_context>

<question>
What do [domain] projects commonly get wrong? Critical mistakes?
</question>

<project_context>
[Project overview summary]
Mosic project_id: [project_id]
Mosic workspace_id: [workspace_id]
</project_context>

<output>
Create Mosic page using mosic_create_entity_page:
- entity_doctype: 'MProject'
- entity_name: [project_id]
- title: 'Research: Pitfalls'
- page_type: 'Document'
- icon: 'lucide:alert-triangle'
- Add tags: gsd-managed, research

Return the page_id when done.
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Pitfalls research")
```

After all 4 agents complete, spawn synthesizer to create Research Summary page:

```
Task(prompt="
<task>
Synthesize research outputs into a Research Summary page in Mosic.
</task>

<research_pages>
Fetch these pages from Mosic using mosic_get_entity_pages('MProject', '[project_id]'):
- Research: Stack
- Research: Features
- Research: Architecture
- Research: Pitfalls

Use content_format: 'markdown' for efficient retrieval.
</research_pages>

<output>
Create Mosic page using mosic_create_entity_page:
- entity_doctype: 'MProject'
- entity_name: [project_id]
- title: 'Research: Summary'
- page_type: 'Document'
- icon: 'lucide:file-text'
- Add tags: gsd-managed, research

Synthesize key findings from all research pages.
Return the page_id when done.
</output>
", subagent_type="gsd-research-synthesizer", model="{synthesizer_model}", description="Synthesize research")
```

**Update config.json with research page IDs:**

```json
{
  "mosic": {
    "pages": {
      "research": {
        "stack": "[stack_page_id]",
        "features": "[features_page_id]",
        "architecture": "[architecture_page_id]",
        "pitfalls": "[pitfalls_page_id]",
        "summary": "[summary_page_id]"
      }
    }
  }
}
```

Display research complete banner and key findings:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCH COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Key Findings

**Stack:** [from Summary page]
**Table Stakes:** [from Summary page]
**Watch Out For:** [from Summary page]

Research pages: https://mosic.pro/app/Project/[project_id] (see Pages tab)
```

**If "Skip research":** Continue to Phase 7.

## Phase 7: Define Requirements (Mosic Page)

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DEFINING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Load context from Mosic:**

Fetch Overview page and extract:
- Core value (the ONE thing that must work)
- Stated constraints (budget, timeline, tech limitations)
- Any explicit scope boundaries

```
overview = mosic_get_page(overview_page_id, { content_format: 'markdown' })
```

**If research exists:** Fetch Research: Features page for feature categories.

```
features_page = mosic_get_page(features_page_id, { content_format: 'markdown' })
```

**Present features by category:**

```
Here are the features for [domain]:

## Authentication
**Table stakes:**
- Sign up with email/password
- Email verification
- Password reset
- Session management

**Differentiators:**
- Magic link login
- OAuth (Google, GitHub)
- 2FA

**Research notes:** [any relevant notes]

---

## [Next Category]
...
```

**If no research:** Gather requirements through conversation instead.

Ask: "What are the main things users need to be able to do?"

For each capability mentioned:
- Ask clarifying questions to make it specific
- Probe for related capabilities
- Group into categories

**Scope each category:**

For each category, use AskUserQuestion:

- header: "[Category name]"
- question: "Which [category] features are in v1?"
- multiSelect: true
- options:
  - "[Feature 1]" — [brief description]
  - "[Feature 2]" — [brief description]
  - "[Feature 3]" — [brief description]
  - "None for v1" — Defer entire category

Track responses:
- Selected features → v1 requirements
- Unselected table stakes → v2 (users expect these)
- Unselected differentiators → out of scope

**Identify gaps:**

Use AskUserQuestion:
- header: "Additions"
- question: "Any requirements research missed? (Features specific to your vision)"
- options:
  - "No, research covered it" — Proceed
  - "Yes, let me add some" — Capture additions

**Validate core value:**

Cross-check requirements against Core Value from Overview page. If gaps detected, surface them.

**Create Requirements page in Mosic:**

```
requirements_page = mosic_create_entity_page("MProject", project_id, {
  workspace_id: workspace_id,
  title: "Requirements Specification",
  page_type: "Spec",
  icon: "lucide:list-checks",
  status: "Published",
  content: "[REQUIREMENTS.md-style content in Editor.js format]",
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", requirements_page.name, [
  tag_ids["gsd-managed"],
  tag_ids["requirements"]
])
```

**Requirements page content structure:**
- v1 Requirements grouped by category (checkboxes, REQ-IDs)
- v2 Requirements (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by roadmap)

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, CONTENT-02)

**Requirement quality criteria:**

Good requirements are:
- **Specific and testable:** "User can reset password via email link" (not "Handle password reset")
- **User-centric:** "User can X" (not "System does Y")
- **Atomic:** One capability per requirement (not "User can login and manage profile")
- **Independent:** Minimal dependencies on other requirements

**Present full requirements list:**

Show every requirement (not counts) for user confirmation:

```
## v1 Requirements

### Authentication
- [ ] **AUTH-01**: User can create account with email/password
- [ ] **AUTH-02**: User can log in and stay logged in across sessions
- [ ] **AUTH-03**: User can log out from any page

### Content
- [ ] **CONT-01**: User can create posts with text
- [ ] **CONT-02**: User can edit their own posts

[... full list ...]

---

Does this capture what you're building? (yes / adjust)
```

If "adjust": Return to scoping.

**Update config.json:**

```json
{
  "mosic": {
    "pages": {
      "requirements": "[requirements_page_id]"
    }
  }
}
```

**Commit config.json update (if commit_docs = true):**

Use AskUserQuestion to confirm:
- Question: "Commit requirements update to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
docs: add requirements to Mosic

[X] requirements across [N] categories
[Y] requirements deferred to v2
Page: https://mosic.pro/app/page/[requirements_page_id]
EOF
)"
```

## Phase 8: Create Roadmap (Mosic Task Lists + Pages)

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CREATING ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning roadmapper...
```

Spawn gsd-roadmapper agent with context:

```
Task(prompt="
<planning_context>

**Project Overview (from Mosic):**
Fetch using: mosic_get_page('[overview_page_id]', { content_format: 'markdown' })

**Requirements (from Mosic):**
Fetch using: mosic_get_page('[requirements_page_id]', { content_format: 'markdown' })

**Research Summary (from Mosic, if exists):**
Fetch using: mosic_get_page('[research_summary_page_id]', { content_format: 'markdown' })

**Config:**
- workspace_id: [workspace_id]
- project_id: [project_id]
- depth: [quick|standard|comprehensive]
- tag_ids: [tag_ids object]

</planning_context>

<instructions>
Create roadmap DIRECTLY IN MOSIC:

1. Derive phases from requirements (don't impose structure)
2. Map every v1 requirement to exactly one phase
3. Derive 2-5 success criteria per phase (observable user behaviors)
4. Validate 100% coverage

For EACH phase:
a) Create phase-specific tag:
   mosic_create_document('M Tag', {
     workspace_id,
     title: 'phase-NN',
     color: [gradient color],
     description: 'Phase NN: [name]'
   })

b) Create MTask List:
   // IMPORTANT: MTask List descriptions use HTML format
   mosic_create_document('MTask List', {
     workspace_id,
     project: project_id,
     title: 'Phase NN: [name]',
     description: '<p>[goal]</p><p><strong>Success Criteria:</strong></p><ul><li>[criterion 1]</li><li>[criterion 2]</li></ul>',
     prefix: 'PNN',
     status: 'Open'
   })

c) Tag the task list with gsd-managed and phase-NN

d) Create phase overview page linked to task list:
   mosic_create_entity_page('MTask List', task_list_id, {...})

e) Create Depends relations between phases if dependencies exist

5. Create Roadmap page linked to project with full roadmap overview:
   mosic_create_entity_page('MProject', project_id, {
     title: 'Project Roadmap',
     page_type: 'Spec',
     icon: 'lucide:map',
     content: [roadmap overview with all phases, requirements mapping, success criteria]
   })

6. Update Requirements page with traceability (which REQ maps to which phase)

7. Return JSON with all created IDs:
{
  "status": "ROADMAP_CREATED",
  "roadmap_page_id": "...",
  "phases": [
    {
      "number": 1,
      "name": "...",
      "task_list_id": "...",
      "tag_id": "...",
      "overview_page_id": "...",
      "requirements": ["AUTH-01", "AUTH-02"],
      "success_criteria": ["...", "..."]
    }
  ]
}
</instructions>
", subagent_type="gsd-roadmapper", model="{roadmapper_model}", description="Create roadmap")
```

**Handle roadmapper return:**

**If error or blocked:**
- Present blocker information
- Work with user to resolve
- Re-spawn when resolved

**If `ROADMAP_CREATED`:**

Fetch the created Roadmap page and present it nicely inline:

```
roadmap = mosic_get_page(roadmap_page_id, { content_format: 'markdown' })
```

```
---

## Proposed Roadmap

**[N] phases** | **[X] requirements mapped** | All v1 requirements covered

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | [Name] | [Goal] | [REQ-IDs] | [count] |
| 2 | [Name] | [Goal] | [REQ-IDs] | [count] |
| 3 | [Name] | [Goal] | [REQ-IDs] | [count] |
...

### Phase Details

**Phase 1: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]
3. [criterion]

**Phase 2: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]

[... continue for all phases ...]

---
```

**CRITICAL: Ask for approval:**

Use AskUserQuestion:
- header: "Roadmap"
- question: "Does this roadmap structure work for you?"
- options:
  - "Approve" — Continue
  - "Adjust phases" — Tell me what to change
  - "Review in Mosic" — Open roadmap page in browser

**If "Approve":** Continue to finalization.

**If "Adjust phases":**
- Get user's adjustment notes
- Re-spawn roadmapper with revision context
- Present revised roadmap
- Loop until user approves

**If "Review in Mosic":**
Display URL: `https://mosic.pro/app/page/[roadmap_page_id]`
Then re-ask.

**Update config.json with full mappings:**

```json
{
  "mosic": {
    "pages": {
      "roadmap": "[roadmap_page_id]"
    },
    "task_lists": {
      "phase-01": "[task_list_id]",
      "phase-02": "[task_list_id]"
    },
    "tags": {
      "phase_tags": {
        "phase-01": "[tag_id]",
        "phase-02": "[tag_id]"
      }
    },
    "last_sync": "[ISO timestamp]"
  }
}
```

**Commit config.json (if commit_docs = true):**

Use AskUserQuestion to confirm:
- Question: "Commit roadmap to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
docs: create roadmap in Mosic ([N] phases)

Phases:
1. [phase-name]: [requirements covered]
2. [phase-name]: [requirements covered]
...

All v1 requirements mapped to phases.
Project: https://mosic.pro/app/Project/[project_id]
EOF
)"
```

## Phase 9: Done

Present completion with next steps:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PROJECT INITIALIZED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**[Project Name]**

| Artifact       | Mosic URL                                    |
|----------------|----------------------------------------------|
| Project        | https://mosic.pro/app/Project/[project_id]   |
| Overview       | https://mosic.pro/app/page/[overview_id]     |
| Requirements   | https://mosic.pro/app/page/[requirements_id] |
| Roadmap        | https://mosic.pro/app/page/[roadmap_id]      |
| Research       | [N] pages (see project pages)                |

**[N] phases** | **[X] requirements** | Ready to build

**Local:** `config.json` (session context with Mosic IDs)

───────────────────────────────────────────────────────────────

## Phase Structure in Mosic

├─ Phase 01: [name] (P01-*)
├─ Phase 02: [name] (P02-*) → depends on P01
└─ Phase 03: [name] (P03-*) → depends on P02

───────────────────────────────────────────────────────────────

## Next Up

**Phase 1: [Phase Name]** — [Goal from Roadmap]

/gsd:discuss-phase 1 — gather context and clarify approach

<sub>/clear first → fresh context window</sub>

---

**Also available:**
- /gsd:plan-phase 1 — skip discussion, plan directly

───────────────────────────────────────────────────────────────
```

</process>

<output>

**Mosic (primary storage):**
- MProject with metadata
- M Page "Project Overview"
- M Page "Requirements Specification"
- M Page "Project Roadmap"
- M Pages for research (if selected)
  - Research: Stack
  - Research: Features
  - Research: Architecture
  - Research: Pitfalls
  - Research: Summary
- MTask Lists (one per phase)
- M Tags (gsd-managed, requirements, research, plan, summary, phase-NN)

**Local (session context only):**
- `config.json` — Mosic entity IDs and workflow preferences

</output>

<success_criteria>

- [ ] Mosic MCP availability verified
- [ ] Git repo initialized
- [ ] Brownfield detection completed
- [ ] Deep questioning completed (threads followed, not rushed)
- [ ] MProject created in Mosic
- [ ] GSD tags created/verified in Mosic
- [ ] Overview page created in Mosic (replaces PROJECT.md)
- [ ] config.json created with workflow settings and Mosic IDs
- [ ] Research completed in Mosic (if selected) — 4 parallel agents spawned → pages created
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category (v1/v2/out of scope)
- [ ] Requirements page created in Mosic with REQ-IDs
- [ ] gsd-roadmapper spawned with context
- [ ] Roadmap created directly in Mosic:
  - [ ] Roadmap page with full overview
  - [ ] MTask Lists created for each phase
  - [ ] Phase tags created (phase-01, phase-02, etc.)
  - [ ] Phase overview pages linked to task lists
  - [ ] Depends relations between phases (if dependencies)
  - [ ] Requirements page updated with traceability
- [ ] config.json updated with all Mosic IDs
- [ ] config.json committed (if commit_docs = true)
- [ ] User knows next step is `/gsd:discuss-phase 1`

**Single source of truth:** All project data lives in Mosic. config.json only stores references.

</success_criteria>
