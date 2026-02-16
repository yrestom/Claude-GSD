---
name: gsd:execute-task
description: Execute a task's plan with subtask commits and summary creation
argument-hint: "[task-identifier]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<critical_requirements>
**LOAD MOSIC TOOLS FIRST:**
Before using ANY Mosic MCP tool, you MUST call:
```
ToolSearch("mosic task page entity create document complete update comment relation batch")
```

**RESPECT PARALLELIZATION CONFIG:**
Check `config.parallelization` before spawning agents. Parallel execution is conditional:

- **If parallel enabled AND task_level enabled:** Spawn agents in parallel for independent subtasks within the same wave. Cap at `max_concurrent_agents`.
- **If parallel disabled OR task_level disabled:** Spawn one agent per subtask sequentially (one at a time, wait for completion before next). Prevents concurrent file modifications, test conflicts, and build race conditions.
- **If wave has fewer subtasks than `min_subtasks_for_parallel`:** Execute sequentially (overhead not worth it).
- **File-overlap safety:** Subtasks touching the SAME files are NEVER run in parallel, regardless of config. They are placed in separate waves by the planner.

**TRUE PARALLEL EXECUTION (when enabled):**
To spawn agents in parallel within a wave, you MUST make all Task() calls in a SINGLE response message. A FOR loop does NOT create parallel execution.

**ORCHESTRATOR-MANAGED COMMITS (when parallel):**
Parallel agents do NOT commit. They return lists of modified files. The orchestrator commits sequentially after each wave completes to prevent git conflicts.

**ANTI-PATTERN — DO NOT DO THIS:**
Never override the parallelization formula with subjective reasoning like "tight coupling", "better coherence", or "subtasks reference each other." The planner already accounted for dependencies when assigning waves. If config says parallel and the formula evaluates to true, you MUST run parallel. The ONLY exception is file-overlap detected in step 4.
</critical_requirements>

<objective>
Execute a planned task by implementing all subtasks with atomic commits.

**Supports two execution strategies (determined by formula in step 5 — never by subjective judgment):**
- **Parallel** (when config enables it AND conditions met): Independent subtasks in the same wave run in parallel via separate agents, orchestrator handles commits. This is the PREFERRED mode when the formula evaluates to true.
- **Sequential** (when few subtasks OR parallelization disabled): One agent per subtask, executed one at a time with per-subtask commits

**Key differences from execute-phase:**
- Executes subtasks of a single parent task (not plan tasks)
- Creates single Summary Page linked to parent task
- Marks parent task and subtasks complete
- Returns to phase execution context after completion
- Parallelism is at subtask level (finer grained than execute-phase's plan level)

**Spawns:** gsd-executor for implementation work (one per subtask in both modes — parallel controls timing, not agent count)
**Output:** Summary Page + completed task with commit history
</objective>

<execution_context>
@./.claude/get-shit-done/references/ui-brand.md
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Task identifier: $ARGUMENTS (e.g., "AUTH-5" or task UUID)
</context>

<process>

## 0. Load Mosic Tools and Config

**CRITICAL FIRST STEP - Load Mosic MCP tools:**
```
ToolSearch("mosic task page entity create document complete update comment relation batch")
```

Verify tools are available before proceeding.

**Load config:**
```bash
CONFIG=$(cat config.json 2>/dev/null)
```

If missing: Error - run `/gsd:new-project` first.

```
workspace_id = config.mosic.workspace_id
project_id = config.mosic.project_id
model_profile = config.model_profile or "balanced"

# Load parallelization config
# IMPORTANT: config.parallelization can be:
#   - boolean `true`/`false` → treat as simple on/off (all sub-fields use defaults)
#   - object { enabled, task_level, max_concurrent_agents, ... } → read sub-fields
# When it's a boolean `true`, ALL parallel conditions are met with defaults.
IF typeof(config.parallelization) == "boolean":
  PARALLEL_ENABLED = config.parallelization
  PARALLEL_TASK_LEVEL = config.parallelization
  MAX_CONCURRENT = 3
  MIN_SUBTASKS_FOR_PARALLEL = 3
ELSE:
  PARALLEL_ENABLED = config.parallelization?.enabled ?? true
  PARALLEL_TASK_LEVEL = config.parallelization?.task_level ?? true
  MAX_CONCURRENT = config.parallelization?.max_concurrent_agents ?? 3
  MIN_SUBTASKS_FOR_PARALLEL = config.parallelization?.min_subtasks_for_parallel ?? 3

Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-executor | opus | sonnet | sonnet |
```

## 1. Load Task and Validate

```
# Extract task identifier
task_identifier = extract_identifier($ARGUMENTS)

# Load task from Mosic
IF task_identifier:
  task = mosic_get_task(task_identifier, {
    workspace_id: workspace_id,
    description_format: "markdown"
  })
ELSE:
  # Use active task from config
  task_id = config.mosic.session?.active_task
  IF not task_id:
    ERROR: "No task identifier provided and no active task. Provide task ID or run /gsd:task first."
  task = mosic_get_task(task_id, { description_format: "markdown" })

TASK_ID = task.name
TASK_IDENTIFIER = task.identifier
TASK_TITLE = task.title

IF task.done:
  Display: "Task {TASK_IDENTIFIER} is already complete."
  EXIT
```

Display:
```
-------------------------------------------
 GSD > EXECUTING TASK
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
```

## 2. Load Subtasks and Plan

```
# Get subtasks
subtasks = mosic_search_tasks({
  workspace_id: workspace_id,
  filters: { parent_task: TASK_ID }
})

IF subtasks.results.length == 0:
  ERROR: "No subtasks found for task " + TASK_IDENTIFIER + ". Run /gsd:plan-task first."

# Categorize subtasks by status
incomplete_subtasks = subtasks.results.filter(t => not t.done)
complete_subtasks = subtasks.results.filter(t => t.done)

IF incomplete_subtasks.length == 0:
  Display: "All subtasks already complete. Creating summary..."
  GOTO step 7

# Get plan page (ID only — executor loads content from Mosic)
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

plan_page = task_pages.find(p =>
  p.title.includes("Plan") or p.page_type == "Spec"
)

plan_page_id = plan_page ? plan_page.name : null

IF NOT plan_page:
  Display: "Warning: No plan page found. Proceeding with subtask execution."

# Discover task-specific context/research page IDs
task_context_page = task_pages.find(p => p.title.includes("Context"))
task_research_page = task_pages.find(p => p.title.includes("Research"))
task_context_page_id = task_context_page ? task_context_page.name : null
task_research_page_id = task_research_page ? task_research_page.name : null
```

Display:
```
Task: {TASK_IDENTIFIER}
- Total subtasks: {subtasks.results.length}
- Complete: {complete_subtasks.length}
- Remaining: {incomplete_subtasks.length}
```

## 3. Discover Phase Page IDs

```
# Get parent phase
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Derive phase number from config (reverse-lookup task_list_id)
PHASE = null
FOR each key, value in config.mosic.task_lists:
  IF value == phase_id:
    PHASE = key.replace("phase-", "")  # e.g., "phase-01" → "01"
    BREAK

# Discover phase page IDs (do NOT load content — executor loads from Mosic)
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

research_page = phase_pages.find(p => p.title.includes("Research"))
context_page = phase_pages.find(p => p.title.includes("Context"))

# Store IDs only — executor self-loads content via execute-plan.md workflow
research_page_id = research_page ? research_page.name : null
context_page_id = context_page ? context_page.name : null
requirements_page_id = config.mosic.pages.requirements or null
```

## 4. Group Subtasks by Wave and Detect File Overlaps

```
# Load full details for all incomplete subtasks
subtask_details_map = {}
FOR each subtask in incomplete_subtasks:
  st = mosic_get_task(subtask.name, { description_format: "markdown" })
  subtask_details_map[subtask.name] = st

# Extract wave metadata from subtask descriptions
# Wave is in the Metadata section: "**Wave:** N"
waves = {}
FOR each subtask in incomplete_subtasks:
  st = subtask_details_map[subtask.name]
  wave_num = extract_wave_from_description(st.description) or 1
  if (!waves[wave_num]) waves[wave_num] = []
  waves[wave_num].push(subtask)

# File-overlap safety check: verify no subtasks in the same wave share files
FOR each wave_num in waves:
  wave_subtasks = waves[wave_num]
  IF wave_subtasks.length > 1:
    all_files = {}
    FOR each subtask in wave_subtasks:
      st = subtask_details_map[subtask.name]
      subtask_files = extract_files_from_description(st.description)
      FOR each file in subtask_files:
        IF all_files[file]:
          # File overlap detected! Move this subtask to next wave
          overlap_subtask = subtask
          next_wave = wave_num + 1
          IF (!waves[next_wave]) waves[next_wave] = []
          waves[next_wave].push(overlap_subtask)
          waves[wave_num] = waves[wave_num].filter(s => s.name != overlap_subtask.name)
          Display: "File overlap detected: " + file + " — moved " + subtask.identifier + " to wave " + next_wave
        ELSE:
          all_files[file] = subtask.name
```

## 5. Determine Execution Strategy

**CRITICAL: This is a DETERMINISTIC formula. Do NOT override it with subjective reasoning.**
The planner already considered coupling, dependencies, and complexity when designing waves.
File-overlap safety (step 4) is the ONLY valid reason to break parallel within a wave.
If the formula says `use_parallel = true`, you MUST use parallel wave execution (step 6b).

```
# Determine if parallel execution is appropriate
# IMPORTANT: When config.parallelization is a simple boolean `true`, treat as fully enabled:
#   PARALLEL_ENABLED = true, PARALLEL_TASK_LEVEL = true
# Only read sub-fields when config.parallelization is an object.
use_parallel = PARALLEL_ENABLED
  AND PARALLEL_TASK_LEVEL
  AND incomplete_subtasks.length >= MIN_SUBTASKS_FOR_PARALLEL
  AND Object.values(waves).some(w => w.length > 1)  # At least one wave has multiple subtasks

# Update parent task status
mosic_update_document("MTask", TASK_ID, {
  status: "In Progress"
})

# Add execution started comment
execution_mode_label = use_parallel ? "parallel (wave-based)" : "sequential"
mosic_create_document("M Comment", {
  workspace: workspace_id,
  ref_doc: "MTask",
  ref_name: TASK_ID,
  content: "<p><strong>Execution Started</strong></p>" +
    "<p>Subtasks: " + incomplete_subtasks.length + "</p>" +
    "<p>Mode: " + execution_mode_label + "</p>" +
    (use_parallel ? "<p>Waves: " + Object.keys(waves).length + "</p>" : "")
})

# Mark subtasks as in progress
FOR each subtask in incomplete_subtasks:
  mosic_update_document("MTask", subtask.name, {
    status: "In Progress"
  })
```

Display:
```
-------------------------------------------
 GSD > EXECUTING TASK ({execution_mode_label})
-------------------------------------------

{TASK_IDENTIFIER}: {TASK_TITLE}
Subtasks: {incomplete_subtasks.length}
Mode: {execution_mode_label}
{IF use_parallel: "Waves: " + Object.keys(waves).length}

| Wave | Subtasks | Parallel |
|------|----------|----------|
{FOR wave_num in waves:
  "| " + wave_num + " | " + waves[wave_num].map(s => s.identifier).join(", ") + " | " + (waves[wave_num].length > 1 ? "Yes" : "No") + " |"
}
```

## 6. Execute Subtasks

```
# Build <mosic_references> block — IDs only, no content embedding.
# Executor self-loads all content from Mosic via execute-plan.md workflow.
mosic_refs = """
<mosic_references>
<task id="{TASK_ID}" identifier="{TASK_IDENTIFIER}" title="{TASK_TITLE}" />
<phase id="{phase_id}" title="{phase.title}" number="{PHASE}" />
<workspace id="{workspace_id}" />
<plan_page id="{plan_page_id}" />
<research_page id="{research_page_id}" />
<context_page id="{context_page_id}" />
<requirements_page id="{requirements_page_id}" />
<task_context_page id="{task_context_page_id}" />
<task_research_page id="{task_research_page_id}" />
</mosic_references>
"""

all_commits = []        # Collected across all waves
all_files_changed = []  # Collected across all waves
all_results = []        # Agent return results
all_failures = []       # Track failures across all waves
```

### 6a. Sequential Execution (when `use_parallel = false`)

**One agent per subtask, executed one at a time.** Each agent uses normal mode (self-commits) since there's no concurrent file access concern in sequential execution.

```
IF NOT use_parallel:
  FOR each subtask in incomplete_subtasks:
    st = subtask_details_map[subtask.name]

    Display: "Executing subtask " + st.identifier + ": " + st.title

    # Build single-subtask prompt (same structure as parallel's single-wave path)
    subtask_prompt = """
<objective>
Execute subtask """ + st.identifier + """: """ + st.title + """
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

""" + mosic_refs + """

**Subtask to Execute (ONLY THIS ONE):**
- **""" + st.identifier + """** (""" + st.name + """): """ + st.title + """
"""

    # Spawn ONE agent for THIS subtask (normal mode — agent self-commits)
    Task(
      prompt="First, read ./.claude/agents/gsd-executor.md for your role.\n\n" + subtask_prompt,
      subagent_type="general-purpose",
      model="{executor_model}",
      description="Subtask: " + st.identifier
    )

    # IMMEDIATELY process result before spawning next agent
    IF agent_result contains "EXECUTION COMPLETE" or agent_result contains "SUBTASK COMPLETE":
      commits = extract_commits(agent_result)
      files = parse_file_list(extract_file_list(agent_result))
      all_commits.push(...commits)
      all_files_changed.push(...files)
      all_results.push(agent_result)

      # Mark subtask complete
      mosic_complete_task(subtask.name)
      mosic_create_document("M Comment", {
        workspace: workspace_id,
        ref_doc: "MTask",
        ref_name: subtask.name,
        content: "<p><strong>Completed</strong></p>" +
          (commits.length > 0 ? "<p>Commit: <code>" + commits[0].hash + "</code></p>" : "")
      })

      Display: "Subtask " + st.identifier + " complete."

    ELIF agent_result contains "SUBTASK FAILED" or agent_result contains "EXECUTION FAILED":
      all_failures.push({ subtask: subtask, result: agent_result })
      Display: "Subtask " + st.identifier + " FAILED."
      Display: agent_result

      AskUserQuestion({
        questions: [{
          question: "Subtask " + st.identifier + " failed. How should we proceed?",
          header: "Failed",
          options: [
            { label: "Continue", description: "Skip this subtask, continue with remaining" },
            { label: "Retry", description: "Re-run this subtask" },
            { label: "Stop execution", description: "Abort remaining subtasks" }
          ],
          multiSelect: false
        }]
      })

      IF user_selection == "Stop execution":
        GOTO step 7  # Create partial summary with what completed so far
      IF user_selection == "Retry":
        # Re-run same subtask (loop iteration doesn't advance)
        REDO current iteration

    ELSE:
      # Unexpected output — treat as potential success, extract what we can
      commits = extract_commits(agent_result)
      files = parse_file_list(extract_file_list(agent_result))
      all_commits.push(...commits)
      all_files_changed.push(...files)
      all_results.push(agent_result)
      mosic_complete_task(subtask.name)

    # Continue to next subtask
```

### 6b. Parallel Wave Execution (when `use_parallel = true`)

```
IF use_parallel:
  FOR each wave_num in sorted(waves.keys()):
    wave_subtasks = waves[wave_num]

    Display: "## Wave " + wave_num + " — " + wave_subtasks.length + " subtask(s)"

    # 1. Determine if this wave runs parallel
    wave_parallel = wave_subtasks.length > 1

    # 2. Build prompts for subtasks in this wave
    wave_prompts = []
    FOR each subtask in wave_subtasks:
      st = subtask_details_map[subtask.name]

      IF wave_parallel:
        # Multi-subtask wave — use subtask mode with deferred commits
        subtask_prompt = """
<objective>
Execute subtask """ + st.identifier + """: """ + st.title + """
</objective>

**Execution Mode:** subtask
**Commit Mode:** deferred

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

""" + mosic_refs + """

**Subtask to Execute (ONLY THIS ONE):**
- **""" + st.identifier + """** (""" + st.name + """): """ + st.title + """

<commit_rules>
**DEFERRED COMMITS — DO NOT COMMIT.**
You are running in subtask mode as part of a parallel wave.
- Execute the subtask implementation
- Run verification
- Record modified files via `git status --short`
- DO NOT run `git add` or `git commit`
- The orchestrator will handle commits after all parallel agents complete

**Why:** Other agents may be running in parallel. Concurrent git operations cause conflicts.
</commit_rules>

<success_criteria>
- [ ] Subtask implementation matches description
- [ ] Verification criteria pass
- [ ] Modified files recorded
- [ ] No git add/commit operations performed
</success_criteria>

<output_format>
Return:

## SUBTASK COMPLETE

**Subtask:** """ + st.identifier + """
**Status:** passed | failed | partial

### Files Modified
- path/to/file.ts

### Verification Results
{pass/fail details}

### Deviations
{or "None"}

### Issues
{or "None"}
</output_format>
"""

      ELSE:
        # Single subtask in wave — use NORMAL mode (preserves checkpoints, self-commits)
        # No concurrency concern since this subtask runs alone in its wave
        subtask_prompt = """
<objective>
Execute subtask """ + st.identifier + """: """ + st.title + """
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

""" + mosic_refs + """

**Subtask to Execute (ONLY THIS ONE):**
- **""" + st.identifier + """** (""" + st.name + """): """ + st.title + """
"""

      wave_prompts.push({
        subtask: subtask,
        st: st,
        prompt: subtask_prompt
      })

    # 3. Spawn agents
    IF wave_parallel:
      # Spawn ALL agents in this wave in ONE response (true parallel)
      # Cap at MAX_CONCURRENT per batch
      batches = chunk(wave_prompts, MAX_CONCURRENT)

      FOR each batch in batches:
        # Make ALL Task() calls in ONE response message
        # Example for batch of 2:
        Task(
          prompt="First, read ./.claude/agents/gsd-executor.md for your role.\n\n" + batch[0].prompt,
          subagent_type="general-purpose",
          model="{executor_model}",
          description="Subtask: " + batch[0].st.identifier
        )
        Task(
          prompt="First, read ./.claude/agents/gsd-executor.md for your role.\n\n" + batch[1].prompt,
          subagent_type="general-purpose",
          model="{executor_model}",
          description="Subtask: " + batch[1].st.identifier
        )
        # ... (all tasks in batch in ONE response)
        # Wait for all agents in batch to complete before next batch

    ELSE:
      # Single subtask — run it alone in normal mode
      Task(
        prompt="First, read ./.claude/agents/gsd-executor.md for your role.\n\n" + wave_prompts[0].prompt,
        subagent_type="general-purpose",
        model="{executor_model}",
        description="Subtask: " + wave_prompts[0].st.identifier
      )

    # 4. Collect results from all agents in this wave
    # Task() results correspond to wave_prompts by spawn order
    wave_current_failures = []
    wave_results_passed = []
    FOR each (wp, agent_result) in zip(wave_prompts, wave_results):
      IF agent_result contains "## SUBTASK COMPLETE" or agent_result contains "## EXECUTION COMPLETE":
        files = parse_file_list(extract_file_list(agent_result))
        all_files_changed.push(...files)
        all_results.push(agent_result)

        IF NOT wave_parallel:
          # Normal-mode agent committed on its own — extract commit info
          commits = extract_commits(agent_result)
          all_commits.push(...commits)
          mosic_complete_task(wp.subtask.name)
          mosic_create_document("M Comment", {
            workspace: workspace_id,
            ref_doc: "MTask",
            ref_name: wp.subtask.name,
            content: "<p><strong>Completed</strong></p>" +
              (commits.length > 0 ? "<p>Commit: <code>" + commits[0].hash + "</code></p>" : "")
          })
        ELSE:
          # Parallel mode — collect for orchestrator-managed commits (section 6)
          wave_results_passed.push({
            subtask: wp.subtask,
            files_modified: files,
            result_text: agent_result
          })

      ELIF agent_result contains "## SUBTASK FAILED":
        wave_current_failures.push({ subtask: wp.subtask, result: agent_result })
        all_failures.push({ subtask: wp.subtask, result: agent_result })

    # 5. Handle failures in this wave
    IF wave_current_failures.length > 0:
      Display: "Wave " + wave_num + " had " + wave_current_failures.length + " failure(s)"
      FOR each failure in wave_current_failures:
        Display: failure.result

      AskUserQuestion({
        questions: [{
          question: "How should we proceed?",
          header: "Wave Failed",
          options: [
            { label: "Continue", description: "Skip failed subtasks, continue with remaining waves" },
            { label: "Retry failed", description: "Re-run only the failed subtasks" },
            { label: "Stop execution", description: "Abort remaining waves" }
          ],
          multiSelect: false
        }]
      })

      IF user_selection == "Stop execution":
        GOTO step_7_handle_executor_return  # Create partial summary
      IF user_selection == "Retry failed":
        # Re-run failed subtasks (in next wave iteration)
        retry_wave = max(wave_nums) + 1
        waves[retry_wave] = wave_current_failures.map(f => f.subtask)

    # 6. Orchestrator-managed commits (parallel waves only)
    # Single-subtask waves use normal mode — agent already committed
    IF wave_parallel:
      # Commit each subtask's changes sequentially to prevent git conflicts
      Display: "Committing wave " + wave_num + " results..."

      FOR each result in wave_results_passed:
        subtask = result.subtask
        files = result.files_modified

        # Stage files individually
        FOR each file in files:
          git add {file}

        # Determine commit type from result text content
        commit_type = infer_commit_type(result.result_text)
        git commit -m "{commit_type}({TASK_IDENTIFIER}): {subtask.title}"
        commit_hash = git rev-parse --short HEAD
        all_commits.push({ hash: commit_hash, message: commit_type + "(" + TASK_IDENTIFIER + "): " + subtask.title })

        # Mark subtask complete
        mosic_complete_task(subtask.name)
        mosic_create_document("M Comment", {
          workspace: workspace_id,
          ref_doc: "MTask",
          ref_name: subtask.name,
          content: "<p><strong>Completed</strong></p>" +
            "<p>Commit: <code>" + commit_hash + "</code></p>"
        })

    # 7. Run test verification after each wave (catch cross-subtask regressions)
    Display: "Running verification after wave " + wave_num + "..."
    # Run test suite if applicable to catch interference between parallel subtasks
    # If tests fail, report before proceeding to next wave

    Display: "Wave " + wave_num + " complete."

    # 8. Proceed to next wave
```

## 7. Handle Results and Create Summary

```
# --- Both modes: results already collected in execution loops (steps 6a/6b) ---
# all_commits, all_files_changed, all_results, all_failures already populated

# Calculate completion stats
completed_count = all_commits.length
failed_count = all_failures.length
total_count = incomplete_subtasks.length

# --- Create summary page (both modes) ---
summary_page = mosic_create_entity_page("MTask", TASK_ID, {
  workspace_id: workspace_id,
  title: TASK_IDENTIFIER + " Execution Summary",
  page_type: "Document",
  icon: "lucide:check-circle",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Task Execution Summary", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Task:** " + TASK_IDENTIFIER + " - " + TASK_TITLE }
      },
      {
        type: "paragraph",
        data: {
          text: "**Subtasks Completed:** " + completed_count + "/" + total_count +
            "\n**Execution Mode:** " + execution_mode_label +
            (use_parallel ? "\n**Waves:** " + Object.keys(waves).length : "")
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
            ["Hash", "Message"],
            ...all_commits.map(c => [c.hash, c.message])
          ]
        }
      },
      {
        type: "header",
        data: { text: "Files Changed", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: [...new Set(all_files_changed)].map(f => "`" + f + "`")
        }
      }
    ]
  },
  relation_type: "Related"
})

SUMMARY_PAGE_ID = summary_page.name

# Tag summary page
mosic_batch_add_tags_to_document("M Page", SUMMARY_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.summary
])

# Update task checklist if exists
task_with_checklists = mosic_get_task(TASK_ID, { include_checklists: true })
IF task_with_checklists.checklists:
  FOR each checklist in task_with_checklists.checklists:
    matching_subtask = complete_subtasks.concat(incomplete_subtasks).find(s =>
      s.title.toLowerCase().includes(checklist.title.toLowerCase()) or
      checklist.title.toLowerCase().includes(s.title.toLowerCase())
    )
    IF matching_subtask and matching_subtask.done:
      mosic_update_document("MTask CheckList", checklist.name, {
        done: true
      })

# Mark parent task complete (only if all subtasks passed)
IF failed_count == 0:
  mosic_complete_task(TASK_ID)

# Add completion comment
mosic_create_document("M Comment", {
  workspace: workspace_id,
  ref_doc: "MTask",
  ref_name: TASK_ID,
  content: "<p><strong>Execution Complete</strong></p>" +
    "<p>Subtasks: " + completed_count + "/" + total_count + "</p>" +
    "<p>Commits: " + all_commits.length + "</p>" +
    "<p>Mode: " + execution_mode_label + "</p>" +
    "<p><a href=\"https://mosic.pro/app/page/" + SUMMARY_PAGE_ID + "\">View Summary</a></p>"
})

# Create relation between plan and summary
IF plan_page:
  mosic_create_document("M Relation", {
    workspace: workspace_id,
    source_doctype: "M Page",
    source_name: plan_page.name,
    target_doctype: "M Page",
    target_name: SUMMARY_PAGE_ID,
    relation_type: "Related"
  })
```

## 8. Update Config

```
config.mosic.pages["task-" + TASK_IDENTIFIER + "-summary"] = SUMMARY_PAGE_ID
config.mosic.session.active_task = null
config.mosic.session.task_workflow_level = null
config.mosic.session.paused_for_task = false
config.mosic.session.last_action = "execute-task"
config.mosic.session.last_updated = new Date().toISOString()

write config.json
```

## 9. Present Results

```
Display:
"""
-------------------------------------------
 GSD > TASK COMPLETE
-------------------------------------------

**{TASK_IDENTIFIER}:** {TASK_TITLE}

{completed_count} subtask(s) completed ({failed_count} failed)
{all_commits.length} commit(s) created

### Commits
""" + all_commits.map(c => "- `" + c.hash + "` " + c.message).join("\n") + """

### Mosic Links
- Task: https://mosic.pro/app/MTask/{TASK_ID}
- Summary: https://mosic.pro/app/page/{SUMMARY_PAGE_ID}

---

## Next Up

Continue phase execution or add another task.

`/gsd:execute-phase` - continue with phase
`/gsd:task` - add another task
`/gsd:verify-task {TASK_IDENTIFIER}` - user acceptance test

<sub>`/clear` first -> fresh context window</sub>

---
"""
```

</process>

<error_handling>
```
IF executor fails mid-execution:
  # Get current state
  current_subtasks = mosic_search_tasks({
    workspace_id: workspace_id,
    filters: { parent_task: TASK_ID }
  })

  completed_count = current_subtasks.results.filter(t => t.done).length
  remaining_count = current_subtasks.results.filter(t => not t.done).length

  Display:
  """
  -------------------------------------------
   EXECUTION INTERRUPTED
  -------------------------------------------

  **{TASK_IDENTIFIER}:** {TASK_TITLE}

  Progress: {completed_count}/{current_subtasks.results.length} subtasks complete

  Remaining:
  """ + current_subtasks.results.filter(t => not t.done).map(t =>
    "- " + t.identifier + ": " + t.title
  ).join("\n") + """

  To resume: `/gsd:execute-task {TASK_IDENTIFIER}`
  """

  # Store state for resume
  config.mosic.session.active_task = TASK_ID
  config.mosic.session.last_action = "execute-task-interrupted"
  config.mosic.session.last_updated = new Date().toISOString()

  write config.json

IF mosic operation fails:
  Display: "Mosic operation failed: {error}"
  Display: "Task execution may have completed. Check Mosic and retry summary creation."
```
</error_handling>

<success_criteria>
- [ ] Task loaded from Mosic (by identifier or active task)
- [ ] Subtasks identified and loaded with full details
- [ ] Parallelization config loaded and respected
- [ ] Subtasks grouped by wave (from planner metadata)
- [ ] File-overlap safety enforced (overlapping subtasks never parallel)
- [ ] Phase and task context loaded for executor(s)
- [ ] Execution strategy determined (sequential vs parallel)
- [ ] Sequential mode: one agent per subtask, executed one at a time with per-subtask commits
- [ ] Parallel mode: wave-based execution with orchestrator-managed commits
- [ ] Parallel mode: post-wave test verification catches cross-subtask regressions
- [ ] Failed subtasks handled (continue/retry/stop options)
- [ ] Subtasks marked complete
- [ ] Summary page created linked to task
- [ ] Parent task marked complete (only if all subtasks passed)
- [ ] Task checklists updated
- [ ] Relation created between plan and summary
- [ ] config.json updated (cleared task workflow state)
- [ ] User informed with Mosic URLs and next steps
</success_criteria>
