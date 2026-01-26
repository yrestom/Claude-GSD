---
name: gsd:list-phase-assumptions
description: Surface Claude's assumptions about a phase approach before planning
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - ToolSearch
---

<objective>
Analyze a phase and present Claude's assumptions about technical approach, implementation order, scope boundaries, risk areas, and dependencies.

Purpose: Help users see what Claude thinks BEFORE planning begins - enabling course correction early when assumptions are wrong.
Output: Conversational output only (no file creation) - ends with "What do you think?" prompt

Optionally syncs assumptions as page content to Mosic for team visibility.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/list-phase-assumptions.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)

**Load project state first:**
@.planning/STATE.md

**Load roadmap:**
@.planning/ROADMAP.md
</context>

<process>
1. Validate phase number argument (error if missing or invalid)
2. Check if phase exists in roadmap
3. Follow list-phase-assumptions.md workflow:
   - Analyze roadmap description
   - Surface assumptions about: technical approach, implementation order, scope, risks, dependencies
   - Present assumptions clearly
   - Prompt "What do you think?"
4. Gather feedback and offer next steps
5. Optionally sync assumptions to Mosic
</process>

<mosic_sync>
**Sync assumptions to Mosic (optional, after feedback gathered):**

After presenting assumptions and gathering feedback, check if user wants to preserve:

```
Would you like to save these assumptions to Mosic for team reference?
- Yes: Create assumptions page linked to phase
- No: Continue without saving
```

**If user chooses to save AND mosic.enabled = true:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE_NUM}\"]")
```

### Create Assumptions Page

```
# Load Mosic tools
ToolSearch("mosic page create")

IF TASK_LIST_ID is not null:
  # Create assumptions page as phase documentation
  assumptions_page = mosic_create_entity_page("MTask List", TASK_LIST_ID, {
    workspace_id: WORKSPACE_ID,
    title: "Phase " + PHASE_NUM + " Assumptions",
    page_type: "Document",
    icon: "lucide:lightbulb",
    status: "Draft",
    content: {
      blocks: [
        {
          type: "header",
          data: { text: "Claude's Assumptions for Phase " + PHASE_NUM, level: 1 }
        },
        {
          type: "paragraph",
          data: { text: "These assumptions were surfaced before planning began. Review and correct as needed." }
        },
        {
          type: "header",
          data: { text: "Technical Approach", level: 2 }
        },
        {
          type: "list",
          data: { items: [technical_approach_assumptions], style: "unordered" }
        },
        {
          type: "header",
          data: { text: "Implementation Order", level: 2 }
        },
        {
          type: "list",
          data: { items: [implementation_order_assumptions], style: "ordered" }
        },
        {
          type: "header",
          data: { text: "Scope Boundaries", level: 2 }
        },
        {
          type: "list",
          data: { items: [scope_assumptions], style: "unordered" }
        },
        {
          type: "header",
          data: { text: "Risk Areas", level: 2 }
        },
        {
          type: "list",
          data: { items: [risk_assumptions], style: "unordered" }
        },
        {
          type: "header",
          data: { text: "Dependencies", level: 2 }
        },
        {
          type: "list",
          data: { items: [dependency_assumptions], style: "unordered" }
        },
        {
          type: "header",
          data: { text: "User Feedback", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: "[To be added after discussion]" }
        }
      ]
    },
    relation_type: "Related"
  })

  # Tag the page
  GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
  PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PHASE_NUM}\"]")

  mosic_batch_add_tags_to_document("M Page", assumptions_page.name, [
    GSD_MANAGED_TAG,
    PHASE_TAG
  ])

  # Store page ID in config
  # mosic.pages["phase-" + PHASE_NUM + "-assumptions"] = assumptions_page.name
```

Display:
```
✓ Assumptions saved to Mosic
  Page: https://mosic.pro/app/page/{assumptions_page.name}
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Assumptions displayed locally only."
  - Continue (don't block)
```
</mosic_sync>

<success_criteria>

- Phase validated against roadmap
- Assumptions surfaced across five areas
- User prompted for feedback
- User knows next steps (discuss context, plan phase, or correct assumptions)
- Mosic sync (if user opts in and enabled):
  - [ ] Assumptions page created and linked to phase
  - [ ] Page tagged appropriately
  - [ ] Page URL provided to user
  </success_criteria>
