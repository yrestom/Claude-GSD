---
name: gsd:research-phase
description: Research how to implement a phase (standalone - usually use /gsd:plan-phase instead)
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Bash
  - Task
---

<objective>
Research how to implement a phase. Spawns gsd-phase-researcher agent with phase context.

**Note:** This is a standalone research command. For most workflows, use `/gsd:plan-phase` which integrates research automatically.

**Use this command when:**
- You want to research without planning yet
- You want to re-research after planning is complete
- You need to investigate before deciding if a phase is feasible

**Orchestrator role:** Parse phase, validate against roadmap, check existing research, gather context, spawn researcher agent, present results.

**Why subagent:** Research burns context fast (WebSearch, Context7 queries, source verification). Fresh 200k context for investigation. Main context stays lean for user interaction.
</objective>

<context>
Phase number: $ARGUMENTS (required)

Normalize phase input in step 1 before any directory lookups.
</context>

<process>

## 0. Resolve Model Profile

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-phase-researcher | opus | sonnet | haiku |

Store resolved model for use in Task calls below.

## 1. Normalize and Validate Phase

```bash
# Normalize phase number (8 → 08, but preserve decimals like 2.1 → 02.1)
if [[ "$ARGUMENTS" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$ARGUMENTS")
elif [[ "$ARGUMENTS" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
else
  PHASE="$ARGUMENTS"
fi

grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

**If not found:** Error and exit. **If found:** Extract phase number, name, description.

## 2. Check Existing Research

```bash
ls .planning/phases/${PHASE}-*/RESEARCH.md 2>/dev/null
```

**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for response.

**If doesn't exist:** Continue.

## 3. Gather Phase Context

```bash
grep -A20 "Phase ${PHASE}:" .planning/ROADMAP.md
cat .planning/REQUIREMENTS.md 2>/dev/null
cat .planning/phases/${PHASE}-*/*-CONTEXT.md 2>/dev/null
grep -A30 "### Decisions Made" .planning/STATE.md 2>/dev/null
```

Present summary with phase description, requirements, prior decisions.

## 4. Spawn gsd-phase-researcher Agent

Research modes: ecosystem (default), feasibility, implementation, comparison.

```markdown
<research_type>
Phase Research — investigating HOW to implement a specific phase well.
</research_type>

<key_insight>
The question is NOT "which library should I use?"

The question is: "What do I not know that I don't know?"

For this phase, discover:
- What's the established architecture pattern?
- What libraries form the standard stack?
- What problems do people commonly hit?
- What's SOTA vs what Claude's training thinks is SOTA?
- What should NOT be hand-rolled?
</key_insight>

<objective>
Research implementation approach for Phase {phase_number}: {phase_name}
Mode: ecosystem
</objective>

<context>
**Phase description:** {phase_description}
**Requirements:** {requirements_list}
**Prior decisions:** {decisions_if_any}
**Phase context:** {context_md_content}
</context>

<downstream_consumer>
Your RESEARCH.md will be loaded by `/gsd:plan-phase` which uses specific sections:
- `## Standard Stack` → Plans use these libraries
- `## Architecture Patterns` → Task structure follows these
- `## Don't Hand-Roll` → Tasks NEVER build custom solutions for listed problems
- `## Common Pitfalls` → Verification steps check for these
- `## Code Examples` → Task actions reference these patterns

Be prescriptive, not exploratory. "Use X" not "Consider X or Y."
</downstream_consumer>

<quality_gate>
Before declaring complete, verify:
- [ ] All domains investigated (not just some)
- [ ] Negative claims verified with official docs
- [ ] Multiple sources for critical claims
- [ ] Confidence levels assigned honestly
- [ ] Section names match what plan-phase expects
</quality_gate>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

## 5. Handle Agent Return

**`## RESEARCH COMPLETE`:** Display summary, proceed to Mosic sync, then offer: Plan phase, Dig deeper, Review full, Done.

**`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation.

**`## RESEARCH INCONCLUSIVE`:** Show what was attempted, offer: Add context, Try different mode, Manual.

## 5.5. Sync Research to Mosic (Deep Integration)

**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true AND research completed successfully:**

Display:
```
◆ Syncing research to Mosic...
```

### Step 5.5.1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE}\"]")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
RESEARCH_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.research")
PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PHASE}\"]")
```

### Step 5.5.2: Check for Existing Research Page

```
# Search for existing research page linked to this phase
existing_pages = mosic_get_entity_pages("MTask List", TASK_LIST_ID, {
  include_subtree: false
})

existing_research_page = null
FOR each page in existing_pages:
  IF page.title contains "Research":
    existing_research_page = page.name
    BREAK
```

### Step 5.5.3: Create or Update Research Page

```
research_content = read_file("${PHASE_DIR}/${PHASE}-RESEARCH.md")

IF existing_research_page:
  # Update existing page
  mosic_update_document("M Page", existing_research_page, {
    status: "Published",
    content: convert_to_editorjs(research_content)
  })
  page_id = existing_research_page
ELSE:
  # Create new Research page linked to phase task list
  research_page = mosic_create_entity_page("MTask List", TASK_LIST_ID, {
    workspace_id: workspace_id,
    title: "Phase " + PHASE + " Research",
    page_type: "Document",
    icon: mosic.page_icons.research,  # "lucide:search"
    status: "Published",
    content: convert_to_editorjs(research_content),
    relation_type: "Related"
  })
  page_id = research_page.name
```

### Step 5.5.4: Tag the Research Page

```
mosic_batch_add_tags_to_document("M Page", page_id, [
  GSD_MANAGED_TAG,
  RESEARCH_TAG,
  PHASE_TAG
])
```

### Step 5.5.5: Update config.json

```bash
# Update config.json with:
# mosic.pages["phase-NN-research"] = page_id
# mosic.last_sync = current timestamp
```

Display:
```
✓ Research synced to Mosic
  Page: https://mosic.pro/app/page/[page_id]
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Research saved locally."
  - Add to mosic.pending_sync array for retry
  - Continue (don't block)
```

**If mosic.enabled = false:** Skip Mosic sync.

## 6. Spawn Continuation Agent

```markdown
<objective>
Continue research for Phase {phase_number}: {phase_name}
</objective>

<prior_state>
Research file: @.planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + continuation_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Continue research Phase {phase}"
)
```

</process>

<success_criteria>
- [ ] Phase validated against roadmap
- [ ] Existing research checked
- [ ] gsd-phase-researcher spawned with context
- [ ] Checkpoints handled correctly
- [ ] Mosic sync (if enabled):
  - [ ] Research page created or updated linked to phase task list
  - [ ] Tags applied (gsd-managed, research, phase-NN)
  - [ ] config.json updated with page mapping
- [ ] User knows next steps
</success_criteria>
