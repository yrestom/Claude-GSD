<purpose>
Execute a task and create the outcome summary page in Mosic.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (task, plan page, context pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic:**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- task_lists (phase mappings)
- pages (page IDs)
- tags (tag IDs)
- model_profile (default: balanced)
```

```javascript
// Get the task with full details
task = mosic_get_task(task_id, { description_format: "markdown" })

// Get task pages (plan, context, etc.)
task_pages = mosic_get_entity_pages("MTask", task_id)
plan_page = task_pages.find(p => p.title.includes("Plan"))

// Get plan content if exists
if (plan_page) {
  plan_content = mosic_get_page(plan_page.name, { content_format: "markdown" })
}

// Get parent task list for phase context
phase_task_list = mosic_get_task_list(task.task_list, { include_tasks: false })
phase_pages = mosic_get_entity_pages("MTask List", task.task_list)
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
Read plan and context from Mosic:

```javascript
// Plan content loaded in load_mosic_context step
execution_instructions = plan_content || task.description

// Check for context page
context_page = task_pages.find(p => p.title.includes("Context"))
if (context_page) {
  context_content = mosic_get_page(context_page.name, { content_format: "markdown" })
}
```

This IS the execution instructions. Follow it exactly.

**If context page exists:**
The context page provides the user's vision for this task — how they imagine it working, what's essential, and what's out of scope. Honor this context throughout execution.
</step>

<step name="execute">
Execute each subtask in the plan. **Deviations are normal** - handle them automatically using embedded rules.

1. Read the @context files listed in the plan

2. For each subtask:

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
   - **Commit the subtask** (see `<task_commit>` below)
   - Track subtask completion and commit hash for summary
   - Continue to next subtask

   **If `type="checkpoint:*"`:**

   - STOP immediately (do not continue to next subtask)
   - Execute checkpoint_protocol
   - Wait for user response
   - Verify if possible
   - Only after user confirmation: continue to next subtask

3. Run overall verification checks from verification section
4. Confirm all success criteria met
5. Document all deviations in summary
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

After each subtask completes (verification passed, done criteria met), commit immediately:

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

<step name="create_summary_page">
**Create summary page in Mosic linked to task:**

```javascript
summary_page = mosic_create_entity_page("MTask", task_id, {
  workspace_id: workspace_id,
  title: task.identifier + " Summary",
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
**Mark task complete in Mosic:**

```javascript
mosic_complete_task(task_id, true)

// Update task description with summary
mosic_update_document("MTask", task_id, {
  description: task.description + "\n\n---\n\n✅ **Completed**\n" +
    "- Duration: " + DURATION + "\n" +
    "- Commits: " + commit_count + "\n" +
    "[Summary](page/" + summary_page.name + ")"
})

// Add completion comment
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask",
  reference_name: task_id,
  content: "✅ **Task Complete**\n\n" +
    "- Duration: " + DURATION + "\n" +
    "- Subtasks: " + completed_subtasks + "/" + total_subtasks + "\n" +
    "- Deviations: " + deviation_count + "\n\n" +
    "[Summary](page/" + summary_page.name + ")"
})
```

</step>

<step name="update_config">
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
- [ ] Mosic context loaded (task, plan page, context)
- [ ] All subtasks executed
- [ ] All verifications pass
- [ ] Summary page created in Mosic linked to task
- [ ] Task marked complete in Mosic
- [ ] Completion comment added to task
- [ ] config.json updated with page ID
- [ ] User knows next step
</success_criteria>
