---
name: gsd:discuss-phase
description: Gather phase context through adaptive questioning before planning
argument-hint: "<phase>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**How it works:**
1. Analyze the phase to identify gray areas (UI, UX, behavior, etc.)
2. Present gray areas — user selects which to discuss
3. Deep-dive each selected area until satisfied
4. Create CONTEXT.md with decisions that guide research and planning

**Output:** `{phase}-CONTEXT.md` — decisions clear enough that downstream agents can act without asking the user again
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/discuss-phase.md
@~/.claude/get-shit-done/templates/context.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)

**Load project state:**
@.planning/STATE.md

**Load roadmap:**
@.planning/ROADMAP.md
</context>

<process>
1. Validate phase number (error if missing or not in roadmap)
2. Check if CONTEXT.md exists (offer update/view/skip if yes)
3. **Analyze phase** — Identify domain and generate phase-specific gray areas
4. **Present gray areas** — Multi-select: which to discuss? (NO skip option)
5. **Deep-dive each area** — 4 questions per area, then offer more/next
6. **Write CONTEXT.md** — Sections match areas discussed
7. **Sync context to Mosic** — Create/update context page linked to phase
8. Offer next steps (research or plan)

**CRITICAL: Scope guardrail**
- Phase boundary from ROADMAP.md is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's its own phase. I'll note it for later."
- Capture deferred ideas — don't lose them, don't act on them

**Domain-aware gray areas:**
Gray areas depend on what's being built. Analyze the phase goal:
- Something users SEE → layout, density, interactions, states
- Something users CALL → responses, errors, auth, versioning
- Something users RUN → output format, flags, modes, error handling
- Something users READ → structure, tone, depth, flow
- Something being ORGANIZED → criteria, grouping, naming, exceptions

Generate 3-4 **phase-specific** gray areas, not generic categories.

**Probing depth:**
- Ask 4 questions per area before checking
- "More questions about [area], or move to next?"
- If more → ask 4 more, check again
- After all areas → "Ready to create context?"

**Do NOT ask about (Claude handles these):**
- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion

## Sync Context to Mosic (Step 7 - Deep Integration)

**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true AND CONTEXT.md was written:**

Display:
```
◆ Syncing context decisions to Mosic...
```

### Step 7.1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE}\"]")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PHASE}\"]")
```

### Step 7.2: Check for Existing Context Page

```
existing_pages = mosic_get_entity_pages("MTask List", TASK_LIST_ID, {
  include_subtree: false
})

existing_context_page = null
FOR each page in existing_pages:
  IF page.title contains "Context" OR page.title contains "Decisions":
    existing_context_page = page.name
    BREAK
```

### Step 7.3: Create or Update Context Page

```
context_content = read_file("${PHASE_DIR}/${PHASE}-CONTEXT.md")

IF existing_context_page:
  # Update existing page with new decisions
  mosic_update_document("M Page", existing_context_page, {
    status: "Published",
    content: convert_to_editorjs(context_content)
  })
  page_id = existing_context_page
ELSE:
  # Create new Context page linked to phase task list
  context_page = mosic_create_entity_page("MTask List", TASK_LIST_ID, {
    workspace_id: workspace_id,
    title: "Phase " + PHASE + " Context & Decisions",
    page_type: "Document",
    icon: "lucide:message-square",
    status: "Published",
    content: convert_to_editorjs(context_content),
    relation_type: "Related"
  })
  page_id = context_page.name
```

### Step 7.4: Tag the Context Page

```
mosic_batch_add_tags_to_document("M Page", page_id, [
  GSD_MANAGED_TAG,
  PHASE_TAG
])
```

### Step 7.5: Update Phase Task List Description

```
# Update the phase task list with key decisions summary
key_decisions = extract_key_decisions(context_content)

mosic_update_document("MTask List", TASK_LIST_ID, {
  description: existing_description + "\n\n## Key Decisions\n" + key_decisions
})
```

### Step 7.6: Update config.json

```bash
# Update config.json with:
# mosic.pages["phase-NN-context"] = page_id
# mosic.last_sync = current timestamp
```

Display:
```
✓ Context synced to Mosic
  Page: https://mosic.pro/app/page/[page_id]
  Decisions captured: [N] areas discussed
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Context saved locally."
  - Add to mosic.pending_sync array for retry
  - Continue (don't block)
```

**If mosic.enabled = false:** Skip Mosic sync.
</process>

<success_criteria>
- Gray areas identified through intelligent analysis
- User chose which areas to discuss
- Each selected area explored until satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures decisions, not vague vision
- Mosic sync (if enabled):
  - [ ] Context page created or updated linked to phase task list
  - [ ] Phase task list description updated with key decisions
  - [ ] Tags applied (gsd-managed, phase-NN)
  - [ ] config.json updated with page mapping
- User knows next steps
</success_criteria>
