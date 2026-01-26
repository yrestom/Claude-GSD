---
name: gsd:map-codebase
description: Analyze codebase with parallel mapper agents to produce .planning/codebase/ documents
argument-hint: "[optional: specific area to map, e.g., 'api' or 'auth']"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Task
  - ToolSearch
---

<objective>
Analyze existing codebase using parallel gsd-codebase-mapper agents to produce structured codebase documents.

Each mapper agent explores a focus area and **writes documents directly** to `.planning/codebase/`. The orchestrator only receives confirmations, keeping context usage minimal.

Output: .planning/codebase/ folder with 7 structured documents about the codebase state.

Optionally creates Architecture page in Mosic project for team visibility.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/map-codebase.md
</execution_context>

<context>
Focus area: $ARGUMENTS (optional - if provided, tells agents to focus on specific subsystem)

**Load project state if exists:**
Check for .planning/STATE.md - loads context if project already initialized

**This command can run:**
- Before /gsd:new-project (brownfield codebases) - creates codebase map first
- After /gsd:new-project (greenfield codebases) - updates codebase map as code evolves
- Anytime to refresh codebase understanding
</context>

<when_to_use>
**Use map-codebase for:**
- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip map-codebase for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>
1. Check if .planning/codebase/ already exists (offer to refresh or skip)
2. Create .planning/codebase/ directory structure
3. Spawn 4 parallel gsd-codebase-mapper agents:
   - Agent 1: tech focus → writes STACK.md, INTEGRATIONS.md
   - Agent 2: arch focus → writes ARCHITECTURE.md, STRUCTURE.md
   - Agent 3: quality focus → writes CONVENTIONS.md, TESTING.md
   - Agent 4: concerns focus → writes CONCERNS.md
4. Wait for agents to complete, collect confirmations (NOT document contents)
5. Verify all 7 documents exist with line counts
6. Commit codebase map
7. Sync to Mosic (if enabled)
8. Offer next steps (typically: /gsd:new-project or /gsd:plan-phase)
</process>

<mosic_sync>
**Sync codebase documentation to Mosic:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing codebase documentation to Mosic...
```

### Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
```

### Create Architecture Documentation Page

```
# Load Mosic tools
ToolSearch("mosic page create entity")

IF PROJECT_ID is not null:
  # Read the generated codebase documents
  ARCHITECTURE=$(cat .planning/codebase/ARCHITECTURE.md)
  STACK=$(cat .planning/codebase/STACK.md)
  STRUCTURE=$(cat .planning/codebase/STRUCTURE.md)
  INTEGRATIONS=$(cat .planning/codebase/INTEGRATIONS.md)
  CONVENTIONS=$(cat .planning/codebase/CONVENTIONS.md)
  TESTING=$(cat .planning/codebase/TESTING.md)
  CONCERNS=$(cat .planning/codebase/CONCERNS.md)

  # Create comprehensive Architecture page
  architecture_page = mosic_create_entity_page("MProject", PROJECT_ID, {
    workspace_id: WORKSPACE_ID,
    title: "Codebase Architecture",
    page_type: "Document",
    icon: "lucide:layout",
    status: "Published",
    content: convert_to_editorjs({
      sections: [
        { title: "Architecture Overview", content: ARCHITECTURE },
        { title: "Tech Stack", content: STACK },
        { title: "Project Structure", content: STRUCTURE },
        { title: "External Integrations", content: INTEGRATIONS },
        { title: "Code Conventions", content: CONVENTIONS },
        { title: "Testing Strategy", content: TESTING },
        { title: "Known Concerns", content: CONCERNS }
      ]
    }),
    relation_type: "Related"
  })

  # Tag the architecture page
  mosic_batch_add_tags_to_document("M Page", architecture_page.name, [
    GSD_MANAGED_TAG
  ])

  # Store page ID in config
  # mosic.pages["codebase-architecture"] = architecture_page.name

ELSE:
  # Project not yet created - queue for later sync
  config.mosic.pending_sync.push({
    type: "codebase_architecture",
    action: "create",
    local_path: ".planning/codebase/"
  })
```

### Create Individual Component Pages (optional, for large codebases)

If codebase is large (>50 files or >5000 LOC):

```
# Create separate pages for each major section
FOR each document in [ARCHITECTURE, STACK, STRUCTURE, INTEGRATIONS, CONVENTIONS, TESTING, CONCERNS]:
  page = mosic_create_entity_page("MProject", PROJECT_ID, {
    workspace_id: WORKSPACE_ID,
    title: document.title,
    page_type: "Document",
    icon: document.icon,
    status: "Published",
    content: convert_to_editorjs(document.content),
    relation_type: "Related"
  })

  mosic_add_tag_to_document("M Page", page.name, GSD_MANAGED_TAG)
```

Display:
```
✓ Codebase documentation synced to Mosic
  Architecture: https://mosic.pro/app/page/{architecture_page.name}
  [IF component pages created:]
  + {count} component pages created
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Local codebase map created."
  - Add to mosic.pending_sync for retry
  - Continue to next steps (don't block)
```

**If mosic.enabled = false:** Skip to next steps.
</mosic_sync>

<success_criteria>
- [ ] .planning/codebase/ directory created
- [ ] All 7 codebase documents written by mapper agents
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors
- [ ] Mosic sync (if enabled):
  - [ ] Architecture page created in Mosic project
  - [ ] Page tagged with gsd-managed
  - [ ] Page linked to project via relation
  - [ ] config.json updated with page ID
- [ ] User knows next steps
</success_criteria>
