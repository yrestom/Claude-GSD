<purpose>
Execute a task and create the outcome summary page in Mosic.

**Supports two execution modes:**
- **Normal mode** (default): Execute all subtasks of a task, commit each, create summary
- **Subtask mode** (`**Execution Mode:** subtask`): Execute ONE specific subtask, defer commits to orchestrator. Used when `/gsd:execute-task` runs subtasks in parallel waves.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (task, plan page, context pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<critical_requirements>
**LOAD MOSIC TOOLS FIRST:**
Before using ANY Mosic MCP tool, call ToolSearch:
```
ToolSearch("mosic task page entity create document complete update comment")
```

Verify tools are available before proceeding. If ToolSearch fails, report error.
</critical_requirements>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic using references or discovery:**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- task_lists (phase mappings)
- pages (page IDs)
- tags (tag IDs)
- model_profile (default: balanced)
```

**Step 1: Check for `<mosic_references>` XML in your prompt (preferred path).**

The orchestrator may pass page IDs directly instead of embedding content:

```xml
<mosic_references>
<task id="{uuid}" identifier="{id}" title="{title}" />
<phase id="{uuid}" title="{title}" number="{N}" />
<workspace id="{uuid}" />
<plan_page id="{uuid}" />
<research_page id="{uuid}" />
<context_page id="{uuid}" />
<requirements_page id="{uuid}" />
<!-- Optional task-specific pages -->
<task_context_page id="{uuid}" />
<task_research_page id="{uuid}" />
</mosic_references>
```

**Step 2: Load content using IDs (direct) or discovery (fallback).**

```javascript
// --- PATH A: <mosic_references> present (lean orchestrator) ---
if (prompt.includes("<mosic_references>")) {
  refs = parse_mosic_references(prompt)

  task = mosic_get_task(refs.task.id, { description_format: "markdown" })
  workspace_id = refs.workspace.id

  // Load plan page by direct ID
  plan_content = ""
  if (refs.plan_page?.id) {
    plan_content = mosic_get_page(refs.plan_page.id, { content_format: "markdown" }).content
  }

  // Load phase context page by direct ID
  phase_context_content = ""
  if (refs.context_page?.id) {
    phase_context_content = mosic_get_page(refs.context_page.id, { content_format: "markdown" }).content
  }

  // Load phase research page by direct ID
  phase_research_content = ""
  if (refs.research_page?.id) {
    phase_research_content = mosic_get_page(refs.research_page.id, { content_format: "markdown" }).content
  }

  // Load requirements page by direct ID
  requirements_content = ""
  if (refs.requirements_page?.id) {
    requirements_content = mosic_get_page(refs.requirements_page.id, { content_format: "markdown" }).content
  }

  // Load task-specific pages by direct ID (if provided)
  task_context_content = ""
  if (refs.task_context_page?.id) {
    task_context_content = mosic_get_page(refs.task_context_page.id, { content_format: "markdown" }).content
  }

  task_research_content = ""
  if (refs.task_research_page?.id) {
    task_research_content = mosic_get_page(refs.task_research_page.id, { content_format: "markdown" }).content
  }

  // Get phase task list for metadata
  phase_task_list = mosic_get_task_list(refs.phase.id || task.task_list, { include_tasks: false })

  // Get task pages for plan discovery (if plan_page not in refs)
  task_pages = mosic_get_entity_pages("MTask", task.name)
}

// --- PATH B: No <mosic_references> — fallback to title-based discovery ---
else {
  // Get the task with full details
  task = mosic_get_task(task_id, { description_format: "markdown" })

  // Get task pages (plan, context, etc.)
  task_pages = mosic_get_entity_pages("MTask", task_id)
  plan_page = task_pages.find(p => p.title.includes("Plan"))

  // Get plan content if exists
  plan_content = ""
  if (plan_page) {
    plan_content = mosic_get_page(plan_page.name, { content_format: "markdown" }).content
  }

  // Get parent task list for phase context
  phase_task_list = mosic_get_task_list(task.task_list, { include_tasks: false })
  phase_pages = mosic_get_entity_pages("MTask List", task.task_list)

  // Load phase-level pages (context and research are on phase, not task)
  phase_context_page = phase_pages.find(p => p.title.includes("Context") || p.title.includes("Decisions"))
  phase_research_page = phase_pages.find(p => p.title.includes("Research"))

  phase_context_content = ""
  if (phase_context_page) {
    phase_context_content = mosic_get_page(phase_context_page.name, { content_format: "markdown" }).content
  }

  phase_research_content = ""
  if (phase_research_page) {
    phase_research_content = mosic_get_page(phase_research_page.name, { content_format: "markdown" }).content
  }

  // Load requirements page from config
  requirements_content = ""
  if (config.mosic?.pages?.requirements) {
    requirements_content = mosic_get_page(config.mosic.pages.requirements, { content_format: "markdown" }).content
  }

  // Task-specific context (discovered from task pages)
  task_context_page = task_pages.find(p => p.title.includes("Context"))
  task_context_content = ""
  if (task_context_page) {
    task_context_content = mosic_get_page(task_context_page.name, { content_format: "markdown" }).content
  }

  task_research_page = task_pages.find(p => p.title.includes("Research"))
  task_research_content = ""
  if (task_research_page) {
    task_research_content = mosic_get_page(task_research_page.name, { content_format: "markdown" }).content
  }
}
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-executor | opus | sonnet | sonnet |

Store resolved model for use in Task calls below.
</step>

<step name="identify_task">
Validate task exists and is ready to execute:

```javascript
if (task.done) {
  console.log("Task already complete: " + task.identifier)
  exit(0)
}

console.log("Executing task: " + task.identifier + " - " + task.title)
```

<if mode="yolo">
```
⚡ Auto-approved: Execute ${task.identifier}

Starting execution...
```

Proceed directly to parse_segments step.
</if>

<if mode="interactive">
```
Found task to execute: ${task.identifier}
${task.title}

Proceed with execution?
```

Wait for confirmation before proceeding.
</if>
</step>

<step name="record_start_time">
Record execution start time for performance tracking:

```bash
PLAN_START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_START_EPOCH=$(date +%s)
```

Store in variables for duration calculation at completion.
</step>

<step name="parse_segments">
**Intelligent segmentation: Parse task into execution segments.**

Tasks are divided into segments by checkpoints. Each segment is routed to optimal execution context.

**1. Check for checkpoints in plan content:**

Parse plan_content for checkpoint markers.

**2. Analyze execution strategy:**

**If NO checkpoints found:**
- **Fully autonomous task** - execute directly
- Fresh context, execute all work, create summary
- Main context: Just orchestration (~5% usage)

**If checkpoints found:**
- Parse into segments
- Route each segment appropriately

**3. Execution patterns:**

**Pattern A: Fully autonomous (no checkpoints)**
```
Execute all work → create summary page → mark complete
```

**Pattern B: Segmented with verify-only checkpoints**
```
Segment 1: Execute → report back
Checkpoint: User verifies → continue
Segment 2: Execute → report back
Aggregate results → summary page → mark complete
```

**Pattern C: Decision-dependent (must stay in main)**
```
Checkpoint 1 (decision): User decides → continue in main
Execute remaining work with decision
No segmentation benefit - execute entirely in main
```

</step>

<step name="load_context">
Process loaded content into execution context. All content was loaded in `load_mosic_context` step.

```javascript
execution_instructions = plan_content || task.description
```

This IS the execution instructions. Follow it exactly.

**Context hierarchy (use all that exist):**
1. **Task context** (`task_context_content`): Task-specific decisions — highest priority.
2. **Phase context** (`phase_context_content`): User's vision and decisions for the entire phase — from `/gsd:discuss-phase`. Honor these decisions throughout execution.
3. **Phase research** (`phase_research_content`): Technical findings and recommendations — from `/gsd:research-phase`. Reference for implementation patterns.

**Self-extract user decisions (when NOT already provided by orchestrator):**

Skip this extraction if your prompt already contains a `<user_decisions>` XML block — the orchestrator has pre-extracted decisions for you.

Otherwise, follow `<user_decision_extraction>` in `@~/.claude/get-shit-done/workflows/context-extraction.md`.
Input: `task_context_content`, `phase_context_content`, `phase_research_content`, `task_research_content` (all loaded in `load_mosic_context` step).
Output: `locked_decisions`, `deferred_ideas`, `discretion_areas`.

**Self-extract requirements (when NOT already provided by orchestrator):**

Skip if your prompt already contains a `<phase_requirements>` XML block.

Otherwise, follow `<requirements_extraction>` in `@~/.claude/get-shit-done/workflows/context-extraction.md`.
Input: `requirements_content`, `plan_content`, current phase.
Output: `phase_requirements[]`.

**Self-detect frontend work (when NOT already provided by orchestrator):**

Skip if your prompt already contains a `<frontend_design_context>` XML block.

Otherwise, follow `<frontend_detection>` in `@~/.claude/get-shit-done/workflows/context-extraction.md`.
Use keyword list from `@~/.claude/get-shit-done/references/detection-constants.md`.
Scope text: `task.title + task.description + plan_content`.
If `is_frontend`: extract `## For Executors` section from frontend-design.md.

**Self-detect TDD tasks (when NOT already provided by orchestrator):**

Skip if your prompt already contains a `<tdd_execution_context>` XML block.

Otherwise, follow `<tdd_detection>` **For Executors** in `@~/.claude/get-shit-done/workflows/context-extraction.md`.
Input: `plan_content`, `task.tags`, `config.workflow.tdd`.
Output: `has_tdd` boolean + `tdd_execution_context` string.
</step>

<step name="detect_execution_mode">
**Check if running in subtask mode:**

```javascript
// Subtask mode is indicated by the orchestrator prompt
subtask_mode = prompt.includes("**Execution Mode:** subtask")
commit_deferred = prompt.includes("**Commit Mode:** deferred")

// Review mode: orchestrator forces deferred commits for review gate
review_enabled = prompt.includes("**Review Mode:** enabled")
if (review_enabled && !commit_deferred) {
  // Normal mode but review is on — defer commits to orchestrator
  commit_deferred = true
}

if (subtask_mode) {
  // Execute ONLY the single specified subtask
  // DO NOT commit — record modified files for orchestrator
  // DO NOT create summary page
  // DO NOT mark tasks complete
  // Return structured SUBTASK COMPLETE/FAILED result
}
```

</step>

<step name="execute">
Execute subtask(s) in the plan. **Deviations are normal** - handle them automatically using embedded rules.

**If subtask mode:** Execute ONLY the single specified subtask, then skip to returning results. Do NOT iterate over other subtasks.

**If normal mode:** Execute all subtasks sequentially as below.

1. Read the @context files listed in the plan

2. For each subtask (or the single subtask in subtask mode):

   **If `type="auto"`:**

   **Before executing:** Check if subtask has `tdd="true"` attribute:
   - If yes: Follow TDD execution flow - RED → GREEN → REFACTOR cycle
   - If no: Standard implementation

   - Work toward subtask completion
   - **If CLI/API returns authentication error:** Handle as authentication gate
   - **When you discover additional work not in plan:** Apply deviation rules automatically
   - Continue implementing, applying rules as needed
   - Run the verification
   - Confirm done criteria met
   - **If normal mode AND NOT commit_deferred:** Commit the subtask (see `<task_commit>` below)
   - **If subtask mode OR commit_deferred:** Record modified files via `git status --short` (NO commit)
   - Track subtask completion for summary/return
   - **If normal mode (regardless of commit_deferred):** Continue to next subtask
   - **If subtask mode:** Skip to structured return (single subtask only)

   **If `type="checkpoint:*"`:**

   - STOP immediately (do not continue to next subtask)
   - Execute checkpoint_protocol
   - Wait for user response
   - Verify if possible
   - Only after user confirmation: continue to next subtask

3. **If normal mode:** Run overall verification checks from verification section
4. **If normal mode:** Confirm all success criteria met
5. Document all deviations in summary/return
</step>

<authentication_gates>

## Handling Authentication Errors During Execution

**When you encounter authentication errors during `type="auto"` execution:**

This is NOT a failure. Authentication gates are expected and normal.

**Authentication gate protocol:**

1. **Recognize it's an auth gate** - Not a bug, just needs credentials
2. **STOP current execution** - Don't retry repeatedly
3. **Create dynamic checkpoint:human-action** - Present to user immediately
4. **Provide exact authentication steps** - CLI commands, where to get keys
5. **Wait for user to authenticate**
6. **Verify authentication works**
7. **Retry the original work**
8. **Continue normally**

</authentication_gates>

<deviation_rules>

## Automatic Deviation Handling

**While executing, you WILL discover work not in the plan.** This is normal.

Apply these rules automatically. Track all deviations for summary.

**RULE 1: Auto-fix bugs**
**RULE 2: Auto-add missing critical functionality**
**RULE 3: Auto-fix blocking issues**
**RULE 4: Ask about architectural changes**

See ~/.claude/get-shit-done/references/deviation-rules.md for full details.

</deviation_rules>

<task_commit>
## Task Commit Protocol

**If subtask mode OR commit_deferred:** Skip this entire protocol. Instead, run `git status --short` to record modified files and include them in your SUBTASK COMPLETE return. The orchestrator handles all git operations (including review gate when review mode is enabled).

**If normal mode (and NOT commit_deferred):** After each subtask completes (verification passed, done criteria met), commit immediately:

**1. Identify modified files:**
```bash
git status --short
```

**2. Stage only task-related files:**
Stage each file individually (NEVER use `git add .` or `git add -A`)

**3. Determine commit type:**
feat, fix, test, refactor, perf, docs, style, chore

**4. Craft commit message:**
Format: `{type}({task_identifier}): {concise description}`

**5. Record commit hash:**
```bash
TASK_COMMIT=$(git rev-parse --short HEAD)
```

</task_commit>

<step name="checkpoint_protocol">
When encountering `type="checkpoint:*"`:

**Critical: Claude automates everything with CLI/API before checkpoints.** Checkpoints are for verification and decisions, not manual work.

**Display checkpoint clearly:**

```
╔═══════════════════════════════════════════════════════╗
║  CHECKPOINT: [Type]                                   ║
╚═══════════════════════════════════════════════════════╝

Progress: {X}/{Y} subtasks complete
Subtask: [subtask name]

[Display subtask-specific content based on type]

────────────────────────────────────────────────────────
→ YOUR ACTION: [Resume signal instruction]
────────────────────────────────────────────────────────
```

**After displaying:** WAIT for user response. Do NOT hallucinate completion.

See ~/.claude/get-shit-done/references/checkpoints.md for complete guidance.
</step>

<step name="checkpoint_return_for_orchestrator">
**When spawned by an orchestrator (execute-phase):**

If you were spawned via Task tool and hit a checkpoint, you cannot directly interact with the user. Instead, RETURN to the orchestrator with structured checkpoint state.

**Return format:**

1. **Completed Subtasks table** - Subtasks done so far with commit hashes and files
2. **Current Subtask** - Which subtask you're on and what's blocking it
3. **Checkpoint Details** - User-facing content
4. **Awaiting** - What you need from the user

The orchestrator will:
1. Parse your structured return
2. Present checkpoint details to the user
3. Collect user's response
4. Spawn a FRESH continuation agent with your completed subtasks state
</step>

<step name="record_completion_time">
Record execution end time and calculate duration:

```bash
PLAN_END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_END_EPOCH=$(date +%s)

DURATION_SEC=$(( PLAN_END_EPOCH - PLAN_START_EPOCH ))
DURATION_MIN=$(( DURATION_SEC / 60 ))
```

</step>

<step name="subtask_mode_return">
**If in subtask mode OR commit_deferred, return structured result and STOP here. Skip all remaining steps.**

```markdown
## SUBTASK COMPLETE

**Subtask:** {subtask.identifier} - {subtask.title}
**Status:** passed | failed | partial
**Duration:** {time}

### Files Modified
{Run `git status --short` and list modified files}
- path/to/file1.ts
- path/to/file2.ts

### Verification Results
{What was verified and how}

### Deviations
{Any deviations from plan, or "None"}

### Issues
{Any issues encountered, or "None"}
```

**If subtask failed:**
```markdown
## SUBTASK FAILED

**Subtask:** {subtask.identifier} - {subtask.title}
**Status:** failed
**Reason:** {why it failed}

### Partial Work
- {what was completed}

### Files Modified (may need rollback)
- path/to/file.ts

### Recommendation
{retry | skip | abort_wave}
```

**CRITICAL: After returning, DO NOT execute create_summary_page, mark_task_complete, update_config, or offer_next steps.**
</step>

<step name="create_summary_page">
**Normal mode only. Skip this step in subtask mode.**

**Create summary page in Mosic linked to task:**

```javascript
summary_page = mosic_create_entity_page("MTask", task_id, {
  workspace_id: workspace_id,
  title: task.identifier + " Execution Summary",
  page_type: "Document",
  icon: "lucide:file-check",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: task.identifier + ": " + task.title + " Summary", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Completed:** " + format_date(now) + "\n**Duration:** " + DURATION }
      },
      {
        type: "header",
        data: { text: "Accomplishments", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: ACCOMPLISHMENTS
        }
      },
      {
        type: "header",
        data: { text: "Files Modified", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: FILES_MODIFIED.map(f => "`" + f + "`")
        }
      },
      {
        type: "header",
        data: { text: "Commits", level: 2 }
      },
      {
        type: "table",
        data: {
          content: [
            ["Subtask", "Commit", "Type"],
            ...commits.map(c => [c.subtask, c.hash, c.type])
          ]
        }
      },
      {
        type: "header",
        data: { text: "Deviations", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: DEVIATIONS || "None - executed exactly as planned" }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the summary page
mosic_batch_add_tags_to_document("M Page", summary_page.name, [
  tags.gsd_managed,
  tags.summary,
  tags["phase-" + PHASE_NUM]
])
```

</step>

<step name="mark_task_complete">
**Normal mode only. Skip this step in subtask mode.**

**Mark task complete in Mosic:**

```javascript
mosic_complete_task(task_id, true)

// Update task description with completion summary
// IMPORTANT: Task descriptions must use Editor.js format
// Append completion blocks to existing description blocks
existing_blocks = task.description.blocks || []
mosic_update_document("MTask", task_id, {
  description: {
    blocks: [
      ...existing_blocks,
      {
        type: "delimiter",
        data: {}
      },
      {
        type: "paragraph",
        data: { text: "**Completed**" }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: [
            "Duration: " + DURATION,
            "Commits: " + commit_count
          ]
        }
      },
      {
        type: "paragraph",
        data: { text: "[Summary](page/" + summary_page.name + ")" }
      }
    ]
  }
})

// Add completion comment
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  ref_doc: "MTask",
  ref_name: task_id,
  content: "<p><strong>Task Complete</strong></p>" +
    "<ul>" +
    "<li>Duration: " + DURATION + "</li>" +
    "<li>Subtasks: " + completed_subtasks + "/" + total_subtasks + "</li>" +
    "<li>Deviations: " + deviation_count + "</li>" +
    "</ul>" +
    "<p><a href=\"page/" + summary_page.name + "\">Summary</a></p>"
})
```

</step>

<step name="update_config">
**Normal mode only. Skip this step in subtask mode.**

**Update config.json with summary page ID:**

```javascript
config.pages[task.identifier + "-summary"] = summary_page.name
config.last_sync = new Date().toISOString()

// Write config.json
```

</step>

<step name="offer_next">
**Present completion and next steps:**

```
Task ${task.identifier} complete.
Summary: https://mosic.pro/app/page/[summary_page.name]

---

## ▶ Next Up

**Continue phase execution**

`/gsd:execute-phase ${PHASE_ARG}`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

</process>

<success_criteria>

**Normal mode:**
- [ ] Mosic context loaded (task, plan page, context)
- [ ] All subtasks executed
- [ ] All verifications pass
- [ ] Summary page created in Mosic linked to task
- [ ] Task marked complete in Mosic
- [ ] Completion comment added to task
- [ ] config.json updated with page ID
- [ ] User knows next step

**Subtask mode:**
- [ ] Mosic context loaded (task, plan page, context)
- [ ] Single specified subtask executed
- [ ] Subtask verification passes
- [ ] Modified files recorded (no git add/commit)
- [ ] Structured SUBTASK COMPLETE or SUBTASK FAILED returned to orchestrator
- [ ] No summary page created (orchestrator handles)
- [ ] No task marked complete (orchestrator handles)

</success_criteria>
