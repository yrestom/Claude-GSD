---
name: gsd:settings
description: Configure GSD workflow toggles, model profile, and Mosic integration
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - ToolSearch
---

<objective>
Allow users to configure GSD settings including workflow agents, model profile, and Mosic integration.

Updates `config.json` with:
- Workflow preferences (research, plan_check, verifier)
- Model profile selection (quality, balanced, budget)
- Mosic integration settings (enable/disable, workspace, sync options)
</objective>

<process>

## 1. Validate Environment

```bash
ls config.json 2>/dev/null
```

**If not found:** Error - run `/gsd:new-project` first.

## 2. Read Current Config

```bash
cat config.json
```

Parse current values:
- `workflow.research` — spawn researcher during plan-phase (default: true)
- `workflow.plan_check` — spawn plan checker during plan-phase (default: true)
- `workflow.verifier` — spawn verifier during execute-phase (default: true)
- `model_profile` — which model each agent uses (default: `balanced`)
- `mosic.enabled` — Mosic integration enabled (default: false)
- `mosic.workspace_id` — Mosic workspace ID
- `mosic.space_id` — Mosic space ID
- `mosic.sync_on_commit` — sync to Mosic on commits (default: true)
- `mosic.auto_detect` — auto-detect project in Mosic (default: true)

## 3. Present Main Settings Menu

Use AskUserQuestion:

```
AskUserQuestion([
  {
    question: "Which settings would you like to configure?",
    header: "Settings",
    multiSelect: true,
    options: [
      { label: "Workflow Agents", description: "Configure research, plan check, and verification agents" },
      { label: "Model Profile", description: "Set quality/balanced/budget model usage" },
      { label: "Mosic Integration", description: "Configure cloud sync with Mosic" }
    ]
  }
])
```

Route to selected sections below.

---

## 4A. Workflow Agent Settings

If "Workflow Agents" selected:

```
AskUserQuestion([
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research phase goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (verifies plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify plans meet phase goals" },
      { label: "No", description: "Skip plan verification" }
    ]
  },
  {
    question: "Spawn Execution Verifier? (verifies phase completion)",
    header: "Verifier",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify must-haves after execution" },
      { label: "No", description: "Skip post-execution verification" }
    ]
  },
  {
    question: "Test-Driven Development mode?",
    header: "TDD",
    multiSelect: false,
    options: [
      { label: "Auto (Recommended)", description: "Planner decides per-task using TDD heuristic" },
      { label: "Prefer TDD", description: "Use TDD for all eligible tasks (skips UI/config)" },
      { label: "Off", description: "Never use TDD, all tasks use standard execution" }
    ]
  }
])
```

**Pre-select based on current config values.**

---

## 4B. Model Profile Settings

If "Model Profile" selected:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except verification (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for execution/verification" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/verification (lowest cost)" }
    ]
  }
])
```

---

## 4C. Mosic Integration Settings

If "Mosic Integration" selected:

### Step 1: Show Current Status

Display current Mosic status:
```
───────────────────────────────────────────────────────────────
MOSIC INTEGRATION STATUS
───────────────────────────────────────────────────────────────

| Setting        | Current Value |
|----------------|---------------|
| Enabled        | {true/false} |
| Workspace ID   | {workspace_id or "Not set"} |
| Space ID       | {space_id or "Not set"} |
| Project ID     | {project_id or "Not linked"} |
| Sync on Commit | {true/false} |
| Auto Detect    | {true/false} |
| Last Sync      | {timestamp or "Never"} |
| Pending Syncs  | {count} items |

───────────────────────────────────────────────────────────────
```

### Step 2: Present Options

```
AskUserQuestion([
  {
    question: "What would you like to configure?",
    header: "Mosic Settings",
    multiSelect: true,
    options: [
      { label: "Enable/Disable", description: "Turn Mosic integration on or off" },
      { label: "Set Workspace", description: "Configure workspace and space IDs" },
      { label: "Sync Preferences", description: "Configure when to sync" },
      { label: "Test Connection", description: "Verify Mosic MCP connection" },
      { label: "Link Project", description: "Link to existing Mosic project" },
      { label: "View Sync Queue", description: "Show pending sync items" }
    ]
  }
])
```

### Enable/Disable Mosic

If "Enable/Disable" selected:

```
AskUserQuestion([
  {
    question: "Enable Mosic integration?",
    header: "Mosic",
    multiSelect: false,
    options: [
      { label: "Enable", description: "Sync project state to Mosic cloud" },
      { label: "Disable", description: "Keep all data local only" }
    ]
  }
])
```

If enabling and workspace not set:
```
Mosic integration requires a workspace ID.
Please provide your Mosic workspace ID (found in Mosic settings):
```

### Set Workspace

If "Set Workspace" selected:

```
Current workspace: {workspace_id or "Not set"}
Current space: {space_id or "Not set"}

Enter workspace ID (or press Enter to keep current):
```

After workspace ID provided, attempt to fetch workspaces and spaces:

```
# Use ToolSearch to load Mosic tools
ToolSearch("mosic workspace")

# List available workspaces
workspaces = mosic_list_workspaces()

# If workspace found, list spaces
spaces = mosic_get_workspace(workspace_id, { include_spaces: true })
```

Present space selection if multiple spaces available:
```
AskUserQuestion([
  {
    question: "Select a space for this project:",
    header: "Space",
    multiSelect: false,
    options: [
      // dynamically populated from spaces
      { label: "{space.title}", description: "{space.description}" }
    ]
  }
])
```

### Sync Preferences

If "Sync Preferences" selected:

```
AskUserQuestion([
  {
    question: "When should GSD sync to Mosic?",
    header: "Sync Timing",
    multiSelect: true,
    options: [
      { label: "On Commit", description: "Sync after each git commit" },
      { label: "On Phase Complete", description: "Sync when phases complete" },
      { label: "Manual Only", description: "Only sync when explicitly requested" }
    ]
  },
  {
    question: "Auto-detect existing Mosic project?",
    header: "Auto Detect",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Search for matching project by name" },
      { label: "No", description: "Always create new project" }
    ]
  }
])
```

### Test Connection

If "Test Connection" selected:

```
◆ Testing Mosic connection...
```

```
# Load Mosic tools
ToolSearch("mosic workspace")

# Test API connection
TRY:
  workspaces = mosic_list_workspaces()

  IF workspace_id is set:
    workspace = mosic_get_workspace(workspace_id)

    IF project_id is set:
      project = mosic_get_project(project_id)

  DISPLAY:
  ✓ Mosic connection successful

  | Test               | Result |
  |--------------------|--------|
  | API Connection     | ✓ Connected |
  | Workspace Access   | ✓ {workspace.title} |
  | Project Access     | ✓ {project.title} / ✗ Not linked |
  | MCP Tools          | ✓ {count} tools available |

CATCH error:
  ✗ Mosic connection failed: {error}

  Troubleshooting:
  1. Check .mcp.json has mosic_pro configured
  2. Verify Mosic API credentials
  3. Ensure workspace_id is correct
```

### Link Project

If "Link Project" selected:

```
# Search for existing projects in workspace
ToolSearch("mosic project")

projects = mosic_search({
  workspace_id: workspace_id,
  doctypes: ["MProject"],
  query: "{project_name from config.json or MProject}"
})
```

If projects found:
```
AskUserQuestion([
  {
    question: "Found existing Mosic projects. Link to one?",
    header: "Link Project",
    multiSelect: false,
    options: [
      { label: "{project.title}", description: "ID: {project.name}" },
      { label: "Create New", description: "Don't link, will create on next sync" }
    ]
  }
])
```

If linked:
```
# Store project_id in config
mosic.project_id = selected_project.name

# Analyze existing structure
task_lists = mosic_get_project(project_id, { include_task_lists: true })

# Map existing task lists to local phases
FOR each task_list:
  IF task_list.title matches "Phase X:":
    mosic.task_lists["phase-XX"] = task_list.name
```

### View Sync Queue

If "View Sync Queue" selected:

```
PENDING_SYNCS = config.mosic.pending_sync

IF PENDING_SYNCS.length == 0:
  No pending syncs. All data is synchronized.
ELSE:
  ───────────────────────────────────────────────────────────────
  PENDING SYNC QUEUE ({count} items)
  ───────────────────────────────────────────────────────────────

  | Item | Type | Action | Error |
  |------|------|--------|-------|
  {for each item in pending_sync}
  | {item.local_path} | {item.doctype} | {item.action} | {item.error} |

  ---

  Options:
  - Retry all: Attempt to sync pending items now
  - Clear queue: Discard pending syncs
  - View details: Show full error messages
```

---

## 5. Update Config

Merge all settings into existing config.json:

```json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget",
  "workflow": {
    "research": true/false,
    "plan_check": true/false,
    "verifier": true/false,
    "tdd": "auto" | true | false
  },
  "mosic": {
    ...existing_mosic_config,
    "enabled": true/false,
    "workspace_id": "xxx" | null,
    "space_id": "xxx" | null,
    "project_id": "xxx" | null,
    "sync_on_commit": true/false,
    "auto_detect": true/false
  }
}
```

Write updated config to `config.json`.

---

## 6. Confirm Changes

Display summary of all changes made:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Workflow Settings

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Execution Verifier   | {On/Off} |
| TDD Mode             | {Auto/Prefer TDD/Off} |

## Mosic Integration

| Setting              | Value |
|----------------------|-------|
| Enabled              | {Yes/No} |
| Workspace            | {workspace_id or "Not set"} |
| Space                | {space_id or "Not set"} |
| Project              | {project_id or "Not linked"} |
| Sync on Commit       | {Yes/No} |

───────────────────────────────────────────────────────────────

These settings apply to future GSD commands.

Quick commands:
- /gsd:set-profile <profile> — switch model profile
- /gsd:plan-phase --research — force research
- /gsd:plan-phase --skip-research — skip research
- /gsd:plan-phase --skip-verify — skip plan check
- /gsd:settings — return to this menu
```

</process>

<success_criteria>
- [ ] Current config read
- [ ] User presented with settings menu
- [ ] Selected settings sections configured
- [ ] Config updated with all changes
- [ ] Changes confirmed to user
- [ ] Mosic settings (if configured):
  - [ ] Enable/disable option presented
  - [ ] Workspace/space IDs configurable
  - [ ] Sync preferences configurable
  - [ ] Connection test available
  - [ ] Project linking available
</success_criteria>
