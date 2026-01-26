---
name: gsd:map-codebase
description: Analyze codebase with parallel mapper agents and store results in Mosic
argument-hint: "[optional: specific area to map, e.g., 'api' or 'auth']"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Task
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Analyze existing codebase using parallel gsd-codebase-mapper agents and store structured documentation in Mosic.

Each mapper agent explores a focus area and produces analysis that gets stored as M Page documents in Mosic, linked to the project (if exists) or workspace.

Output: Codebase Architecture page in Mosic with comprehensive analysis.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/map-codebase.md
</execution_context>

<context>
Focus area: $ARGUMENTS (optional - if provided, tells agents to focus on specific subsystem)

**Config file:** config.json (local file with Mosic entity IDs)

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

**Skip map-codebase for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>

## Step 0: Load Configuration and Mosic Tools

```bash
# Load config.json (may not exist yet)
CONFIG=$(cat config.json 2>/dev/null || echo '{}')
WORKSPACE_ID=$(echo "$CONFIG" | jq -r '.mosic.workspace_id // empty')
PROJECT_ID=$(echo "$CONFIG" | jq -r '.mosic.project_id // empty')
```

Load Mosic tools:
```
ToolSearch("mosic page create entity document search")
```

**Handle missing workspace:**
```
IF WORKSPACE_ID is empty:
  PROMPT: "Enter your Mosic workspace ID:"
  WORKSPACE_ID = user_response

  # Create minimal config.json
  config = {
    "mosic": {
      "enabled": true,
      "workspace_id": WORKSPACE_ID,
      "tags": {
        "gsd_managed": "gsd-managed",
        "codebase": "codebase"
      },
      "pages": {}
    }
  }
  write config.json
```

---

## Step 1: Check for Existing Codebase Documentation

```
# Search for existing codebase architecture page
existing_pages = mosic_search_pages({
  workspace_id: WORKSPACE_ID,
  query: "Codebase Architecture",
  limit: 5
})

existing_architecture = existing_pages.find(p =>
  p.title.includes("Codebase Architecture") OR
  p.title.includes("Codebase Analysis")
)

IF existing_architecture:
  DISPLAY:
  """
  Existing codebase documentation found:
  https://mosic.pro/app/page/{existing_architecture.name}

  Options:
  1. "refresh" - Update existing documentation
  2. "new" - Create new analysis (archives old)
  3. "cancel" - Exit without changes
  """

  IF user_response == "cancel":
    EXIT

  IF user_response == "new":
    # Archive old page by updating title
    mosic_update_document("M Page", existing_architecture.name, {
      title: existing_architecture.title + " (Archived " + format_date(now) + ")"
    })
```

---

## Step 2: Analyze Codebase Structure

```bash
# Get basic codebase stats
FILE_COUNT=$(find . -type f -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" 2>/dev/null | wc -l)
LOC=$(find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" \) -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")
DIR_COUNT=$(find . -type d -not -path '*/\.*' -not -path '*/node_modules/*' 2>/dev/null | wc -l)

# Detect primary languages
LANGUAGES=$(find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" \) 2>/dev/null | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -5)
```

DISPLAY:
"""
Codebase Overview

Files: {FILE_COUNT}
Lines of Code: {LOC}
Directories: {DIR_COUNT}

Primary Languages:
{LANGUAGES}

Proceed with analysis? (yes/no)
"""

IF user_response != "yes":
  EXIT
```

---

## Step 3: Spawn Parallel Mapper Agents

```
DISPLAY: "Spawning 4 parallel mapper agents..."

# Agent 1: Tech Focus
Task(
  prompt="
<focus>tech</focus>
<workspace_id>" + WORKSPACE_ID + "</workspace_id>
<focus_area>" + ($ARGUMENTS || "entire codebase") + "</focus_area>

Analyze:
1. **Tech Stack** - Languages, frameworks, major dependencies
2. **External Integrations** - APIs, databases, third-party services

Output format:
Return JSON with sections: { stack: {...}, integrations: {...} }
",
  subagent_type="gsd-codebase-mapper",
  model="sonnet",
  description="Map: Tech Stack & Integrations"
)

# Agent 2: Architecture Focus
Task(
  prompt="
<focus>arch</focus>
<workspace_id>" + WORKSPACE_ID + "</workspace_id>
<focus_area>" + ($ARGUMENTS || "entire codebase") + "</focus_area>

Analyze:
1. **Architecture** - Patterns, layers, data flow
2. **Structure** - Directory layout, module organization

Output format:
Return JSON with sections: { architecture: {...}, structure: {...} }
",
  subagent_type="gsd-codebase-mapper",
  model="sonnet",
  description="Map: Architecture & Structure"
)

# Agent 3: Quality Focus
Task(
  prompt="
<focus>quality</focus>
<workspace_id>" + WORKSPACE_ID + "</workspace_id>
<focus_area>" + ($ARGUMENTS || "entire codebase") + "</focus_area>

Analyze:
1. **Conventions** - Naming, formatting, patterns used
2. **Testing** - Test framework, coverage areas, test patterns

Output format:
Return JSON with sections: { conventions: {...}, testing: {...} }
",
  subagent_type="gsd-codebase-mapper",
  model="sonnet",
  description="Map: Conventions & Testing"
)

# Agent 4: Concerns Focus
Task(
  prompt="
<focus>concerns</focus>
<workspace_id>" + WORKSPACE_ID + "</workspace_id>
<focus_area>" + ($ARGUMENTS || "entire codebase") + "</focus_area>

Analyze:
1. **Known Concerns** - Technical debt, complexity hotspots, potential issues

Output format:
Return JSON with sections: { concerns: {...} }
",
  subagent_type="gsd-codebase-mapper",
  model="sonnet",
  description="Map: Known Concerns"
)

# Wait for all agents to complete
DISPLAY: "Waiting for mapper agents..."
```

---

## Step 4: Collect and Merge Results

```
# Collect results from all agents
tech_results = agent_1_output
arch_results = agent_2_output
quality_results = agent_3_output
concerns_results = agent_4_output

# Merge into comprehensive analysis
codebase_analysis = {
  stack: tech_results.stack,
  integrations: tech_results.integrations,
  architecture: arch_results.architecture,
  structure: arch_results.structure,
  conventions: quality_results.conventions,
  testing: quality_results.testing,
  concerns: concerns_results.concerns
}

DISPLAY: "Analysis complete. Creating Mosic documentation..."
```

---

## Step 5: Create Architecture Page in Mosic

```
# Build comprehensive page content
page_content = {
  blocks: [
    {
      type: "header",
      data: { text: "Codebase Architecture", level: 1 }
    },
    {
      type: "paragraph",
      data: { text: "Generated: " + format_date(now) }
    },
    {
      type: "paragraph",
      data: { text: "**Files:** " + FILE_COUNT + " | **LOC:** " + LOC + " | **Directories:** " + DIR_COUNT }
    },

    # Tech Stack Section
    {
      type: "header",
      data: { text: "Tech Stack", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.stack) }
    },

    # Architecture Section
    {
      type: "header",
      data: { text: "Architecture", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.architecture) }
    },

    # Structure Section
    {
      type: "header",
      data: { text: "Project Structure", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.structure) }
    },

    # Integrations Section
    {
      type: "header",
      data: { text: "External Integrations", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.integrations) }
    },

    # Conventions Section
    {
      type: "header",
      data: { text: "Code Conventions", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.conventions) }
    },

    # Testing Section
    {
      type: "header",
      data: { text: "Testing Strategy", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.testing) }
    },

    # Concerns Section
    {
      type: "header",
      data: { text: "Known Concerns", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: format_section(codebase_analysis.concerns) }
    }
  ]
}

# Create page - link to project if exists, otherwise workspace-level
IF PROJECT_ID:
  architecture_page = mosic_create_entity_page("MProject", PROJECT_ID, {
    workspace_id: WORKSPACE_ID,
    title: "Codebase Architecture",
    page_type: "Document",
    icon: "lucide:layout",
    status: "Published",
    content: page_content,
    relation_type: "Related"
  })
ELSE:
  # Create standalone page in workspace
  architecture_page = mosic_create_document("M Page", {
    workspace_id: WORKSPACE_ID,
    title: "Codebase Architecture",
    page_type: "Document",
    icon: "lucide:layout",
    status: "Published",
    content: page_content
  })

ARCHITECTURE_PAGE_ID = architecture_page.name

DISPLAY: "Architecture page created: https://mosic.pro/app/page/" + ARCHITECTURE_PAGE_ID
```

---

## Step 6: Tag the Architecture Page

```
# Tag with gsd-managed and codebase
mosic_batch_add_tags_to_document("M Page", ARCHITECTURE_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.codebase
])

DISPLAY: "Tagged with: gsd-managed, codebase"
```

---

## Step 7: Create Component Pages (for large codebases)

```
IF FILE_COUNT > 50 OR LOC > 5000:
  DISPLAY: "Large codebase detected. Creating component pages..."

  component_pages = []

  # Create separate page for each major section
  sections = [
    { key: "stack", title: "Tech Stack", icon: "lucide:layers" },
    { key: "architecture", title: "Architecture Overview", icon: "lucide:git-branch" },
    { key: "structure", title: "Project Structure", icon: "lucide:folder-tree" },
    { key: "integrations", title: "External Integrations", icon: "lucide:plug" },
    { key: "conventions", title: "Code Conventions", icon: "lucide:file-code" },
    { key: "testing", title: "Testing Strategy", icon: "lucide:flask-conical" },
    { key: "concerns", title: "Known Concerns", icon: "lucide:alert-triangle" }
  ]

  FOR each section in sections:
    IF codebase_analysis[section.key]:
      page = mosic_create_document("M Page", {
        workspace_id: WORKSPACE_ID,
        title: section.title,
        page_type: "Document",
        icon: section.icon,
        status: "Published",
        content: {
          blocks: [
            { type: "header", data: { text: section.title, level: 1 } },
            { type: "paragraph", data: { text: format_section(codebase_analysis[section.key]) } }
          ]
        }
      })

      # Link to architecture page
      mosic_create_document("M Relation", {
        workspace_id: WORKSPACE_ID,
        source_doctype: "M Page",
        source_name: page.name,
        target_doctype: "M Page",
        target_name: ARCHITECTURE_PAGE_ID,
        relation_type: "Related"
      })

      mosic_add_tag_to_document("M Page", page.name, config.mosic.tags.codebase)

      component_pages.push(page)

  DISPLAY: "Created " + component_pages.length + " component pages"
```

---

## Step 8: Update config.json

```
config.mosic.pages["codebase-architecture"] = ARCHITECTURE_PAGE_ID

IF component_pages:
  FOR each page in component_pages:
    key = page.title.toLowerCase().replace(/\s+/g, '-')
    config.mosic.pages["codebase-" + key] = page.name

config.mosic.session = {
  "last_action": "map-codebase",
  "last_page": ARCHITECTURE_PAGE_ID,
  "last_updated": ISO_TIMESTAMP
}

write config.json
```

---

## Step 9: Display Completion

```
DISPLAY:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > CODEBASE MAPPED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files: {FILE_COUNT}
Lines of Code: {LOC}
Directories: {DIR_COUNT}

Mosic:
  Architecture: https://mosic.pro/app/page/{ARCHITECTURE_PAGE_ID}
  {IF component_pages: "+ " + component_pages.length + " component pages"}

Sections:
  - Tech Stack
  - Architecture
  - Project Structure
  - External Integrations
  - Code Conventions
  - Testing Strategy
  - Known Concerns

───────────────────────────────────────────────────────────────

## Next Up

{IF PROJECT_ID is null:}
Initialize GSD project with this codebase:

/gsd:new-project

{ELSE:}
Start planning work:

/gsd:plan-phase <phase>

<sub>/clear first - fresh context window</sub>

───────────────────────────────────────────────────────────────
"""
```

</process>

<success_criteria>
- [ ] Configuration loaded (workspace_id at minimum)
- [ ] Existing documentation checked (offer refresh/new)
- [ ] Codebase stats gathered (files, LOC, directories)
- [ ] 4 parallel mapper agents spawned
- [ ] Results collected and merged
- [ ] Architecture page created in Mosic
- [ ] Page tagged with gsd-managed, codebase
- [ ] Component pages created (for large codebases)
- [ ] Pages linked to project (if exists)
- [ ] config.json updated with page references
- [ ] User knows next steps
</success_criteria>
