<purpose>
Single-subtask execution workflow for the gsd-executor agent.

Loads context from Mosic, executes ONE specified subtask, runs verification,
and returns structured results to the orchestrator.

The orchestrator (execute-task or execute-phase) handles commits, summary
creation, task completion, and state updates.
</purpose>

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
<!-- Subtask assigned to this executor (added by orchestrator) -->
<subtask id="{uuid}" identifier="{id}" title="{title}" />
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

  // Fallback: discover requirements page from project entity pages
  if (!requirements_content && !refs.requirements_page?.id) {
    project_pages = mosic_get_entity_pages("MProject", config.mosic.project_id, {
      include_subtree: false
    })
    req_page = project_pages.find(p => p.title.includes("Requirements"))
    if (req_page) {
      requirements_content = mosic_get_page(req_page.name, { content_format: "markdown" }).content
    }
  }

  if (!requirements_content) {
    console.log("WARNING: No requirements page found. Relying on plan specifications only.")
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

  // Load the specific subtask this executor is assigned to
  subtask = null
  if (refs.subtask?.id) {
    subtask = mosic_get_task(refs.subtask.id, { description_format: "markdown" })
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

  // Fallback: discover requirements page from project entity pages
  if (!requirements_content && !config.mosic?.pages?.requirements) {
    project_pages = mosic_get_entity_pages("MProject", config.mosic.project_id, {
      include_subtree: false
    })
    req_page = project_pages.find(p => p.title.includes("Requirements"))
    if (req_page) {
      requirements_content = mosic_get_page(req_page.name, { content_format: "markdown" }).content
    }
  }

  if (!requirements_content) {
    console.log("WARNING: No requirements page found. Relying on plan specifications only.")
  }

  // In Path B, subtask is not available via references
  subtask = null

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

</step>

<step name="record_start_time">
Record execution start time for performance tracking:

```bash
PLAN_START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_START_EPOCH=$(date +%s)
```

Store in variables for duration calculation at completion.
</step>


<step name="load_context">
Process loaded content into execution context. All content was loaded in `load_mosic_context` step.

```javascript
execution_instructions = plan_content || task.description

// Subtask-specific context: the subtask's own MTask description
subtask_instructions = subtask ? subtask.description : null
```

This IS the execution instructions. Follow it exactly.

**Subtask context (from subtask's MTask description):**
If `subtask_instructions` exists, use it alongside `execution_instructions` to understand:
- The specific subtask to execute (matching identifier from prompt)
- Wave assignment and file list metadata
- Planner's targeted instructions for this subtask

The plan page provides full context; the subtask description narrows focus.

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


<step name="execute">
Execute the single specified subtask. **Deviations are normal** — handle them automatically using embedded rules.

1. Read the @context files listed in the plan

2. Execute the subtask:

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
   - Record modified files via `git status --short` (NO commit)
   - Skip to structured return

   **If `type="checkpoint:*"`:**

   - STOP immediately
   - Return checkpoint to orchestrator

3. DO NOT commit — record modified files only
4. Skip to structured return
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
5. **Return checkpoint to orchestrator** with type `human-action`
6. A fresh agent will be spawned after the user authenticates

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


<step name="checkpoint_protocol">
When encountering `type="checkpoint:*"`:

**STOP immediately.** Do not continue execution.

Return a structured checkpoint result to the orchestrator:

1. **Subtask identifier** and what's blocking it
2. **Checkpoint type** (human-verify, decision, or human-action)
3. **Files modified so far** via `git status --short`
4. **What the user needs to do/provide**

The orchestrator will present the checkpoint to the user and spawn a fresh
continuation agent with the user's response.

See `~/.claude/get-shit-done/references/checkpoints.md` for checkpoint type details.
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

<step name="return_result">
**Return structured result to the orchestrator. This is always the final step.**

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
</step>


</process>

<success_criteria>
- [ ] Mosic context loaded (task, plan page, context)
- [ ] Single specified subtask executed
- [ ] Subtask verification passes
- [ ] Modified files recorded via `git status --short` (no git write operations)
- [ ] Structured SUBTASK COMPLETE or SUBTASK FAILED returned to orchestrator
- [ ] No commits made (orchestrator handles)
- [ ] No summary page created (orchestrator handles)
- [ ] No task marked complete (orchestrator handles)
</success_criteria>
