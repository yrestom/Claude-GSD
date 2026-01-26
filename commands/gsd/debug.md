---
name: gsd:debug
description: Systematic debugging with persistent state across context resets
argument-hint: [issue description]
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
  - mcp__mosic_pro__*
---

<objective>
Debug issues using scientific method with subagent isolation.

**Orchestrator role:** Gather symptoms, spawn gsd-debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.
</objective>

<context>
User's issue: $ARGUMENTS

Check for active sessions:
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```

Check Mosic enabled:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```
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
| gsd-debugger | opus | sonnet | sonnet |

Store resolved model for use in Task calls below.

## 1. Check Active Sessions

If active sessions exist AND no $ARGUMENTS:
- List sessions with status, hypothesis, next action
- User picks number to resume OR describes new issue

If $ARGUMENTS provided OR user describes new issue:
- Continue to symptom gathering

## 2. Gather Symptoms (if new issue)

Use AskUserQuestion for each:

1. **Expected behavior** - What should happen?
2. **Actual behavior** - What happens instead?
3. **Error messages** - Any errors? (paste or describe)
4. **Timeline** - When did this start? Ever worked?
5. **Reproduction** - How do you trigger it?

After all gathered, confirm ready to investigate.

## 2.5 Create Debug Session in Mosic (if enabled)

**If Mosic enabled:**

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
FIX_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.fix")
```

### Create Debug Task

```
debug_task = mosic_create_document("MTask", {
  workspace_id: WORKSPACE_ID,
  project: PROJECT_ID,
  title: "Debug: " + slug,
  description: "## Symptoms\n\n**Expected:** " + expected + "\n\n**Actual:** " + actual + "\n\n**Errors:** " + errors + "\n\n**Timeline:** " + timeline + "\n\n**Reproduction:** " + reproduction,
  icon: "lucide:bug",
  status: "In Progress",
  priority: "High"
})

debug_task_id = debug_task.name
```

### Tag the Task

```
mosic_batch_add_tags_to_document("MTask", debug_task_id, [
  GSD_MANAGED_TAG,
  FIX_TAG
])
```

### Store in Debug File

Add to `.planning/debug/{slug}.md` frontmatter:
```yaml
mosic_task_id: [debug_task_id]
```

Display:
```
✓ Debug session created in Mosic
  Task: https://mosic.pro/app/MTask/[debug_task_id]
```

**Error handling:**

```
IF mosic sync fails:
  - Display warning: "Mosic sync failed: [error]. Continuing with local debug session."
  - Add to mosic.pending_sync array
  - Continue (don't block debugging)
```

## 3. Spawn gsd-debugger Agent

Fill prompt and spawn:

```markdown
<objective>
Investigate issue: {slug}

**Summary:** {trigger}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Debug {slug}"
)
```

## 4. Handle Agent Return

**If `## ROOT CAUSE FOUND`:**
- Display root cause and evidence summary
- Offer options:
  - "Fix now" - spawn fix subagent
  - "Plan fix" - suggest /gsd:plan-phase --gaps
  - "Manual fix" - done

**If Mosic enabled, sync root cause:**

```
# Create Debug Report page linked to task
debug_page = mosic_create_entity_page("MTask", debug_task_id, {
  workspace_id: WORKSPACE_ID,
  title: "Debug Report: " + slug,
  page_type: "Document",
  icon: "lucide:file-text",
  status: "Published",
  content: convert_to_editorjs(.planning/debug/{slug}.md content),
  relation_type: "Related"
})

mosic_batch_add_tags_to_document("M Page", debug_page.name, [
  GSD_MANAGED_TAG,
  FIX_TAG
])

# Update task with root cause summary
mosic_update_document("MTask", debug_task_id, {
  description: existing_description + "\n\n## Root Cause\n\n" + root_cause_summary
})
```

**If `## CHECKPOINT REACHED`:**
- Present checkpoint details to user
- Get user response
- Spawn continuation agent (see step 5)

**If Mosic enabled, add checkpoint comment:**

```
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: debug_task_id,
  content: "**Checkpoint:** " + checkpoint_type + "\n\n" + checkpoint_details
})
```

**If `## INVESTIGATION INCONCLUSIVE`:**
- Show what was checked and eliminated
- Offer options:
  - "Continue investigating" - spawn new agent with additional context
  - "Manual investigation" - done
  - "Add more context" - gather more symptoms, spawn again

**If Mosic enabled:**

```
# Add inconclusive comment
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: debug_task_id,
  content: "**Investigation Inconclusive**\n\nChecked:\n" + checked_items + "\n\nEliminated:\n" + eliminated_items
})

# Update task status to Blocked
mosic_update_document("MTask", debug_task_id, {
  status: "Blocked"
})
```

## 5. Spawn Continuation Agent (After Checkpoint)

When user responds to checkpoint, spawn fresh agent:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: find_and_fix
</mode>
```

```
Task(
  prompt=continuation_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Continue debug {slug}"
)
```

## 6. Sync Resolution to Mosic (if fix applied)

**If Mosic enabled and issue resolved:**

```
# Mark debug task as completed
mosic_complete_task(debug_task_id)

# Update debug page with resolution
mosic_update_content_blocks(debug_page.name, {
  blocks: [
    {
      type: "header",
      data: { text: "Resolution", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: "[resolution details from debug file]" }
    }
  ],
  append: true
})

# Add completion comment
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: debug_task_id,
  content: "Issue resolved. Fix applied via /gsd:debug"
})
```

Display:
```
✓ Debug session completed in Mosic
  Task: https://mosic.pro/app/MTask/[debug_task_id] (Completed)
  Report: https://mosic.pro/app/page/[debug_page.name]
```

**Error handling:**

```
IF mosic sync fails:
  - Display warning: "Mosic completion sync failed: [error]."
  - Add to mosic.pending_sync array:
    { type: "debug_complete", task_id: debug_task_id }
  - Continue (don't block)
```

</process>

<success_criteria>
- [ ] Active sessions checked
- [ ] Symptoms gathered (if new)
- [ ] gsd-debugger spawned with context
- [ ] Checkpoints handled correctly
- [ ] Root cause confirmed before fixing
- [ ] Mosic sync (if enabled):
  - [ ] MTask created for debug session
  - [ ] Tags applied (gsd-managed, fix)
  - [ ] Debug report page created on resolution
  - [ ] Task completed when issue resolved
  - [ ] Progress comments added at checkpoints
  - [ ] Sync failures handled gracefully (added to pending_sync)
</success_criteria>
