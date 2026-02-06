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
- **If parallel disabled OR task_level disabled:** Spawn ONE agent for all subtasks (sequential). Prevents concurrent file modifications, test conflicts, and build race conditions.
- **If wave has fewer subtasks than `min_subtasks_for_parallel`:** Execute sequentially (overhead not worth it).
- **File-overlap safety:** Subtasks touching the SAME files are NEVER run in parallel, regardless of config. They are placed in separate waves by the planner.

**TRUE PARALLEL EXECUTION (when enabled):**
To spawn agents in parallel within a wave, you MUST make all Task() calls in a SINGLE response message. A FOR loop does NOT create parallel execution.

**ORCHESTRATOR-MANAGED COMMITS (when parallel):**
Parallel agents do NOT commit. They return lists of modified files. The orchestrator commits sequentially after each wave completes to prevent git conflicts.
</critical_requirements>

<objective>
Execute a planned task by implementing all subtasks with atomic commits.

**Supports two execution strategies:**
- **Sequential** (default when few subtasks or parallelization disabled): Single agent executes all subtasks with per-subtask commits
- **Parallel** (when enabled and conditions met): Independent subtasks in the same wave run in parallel via separate agents, orchestrator handles commits

**Key differences from execute-phase:**
- Executes subtasks of a single parent task (not plan tasks)
- Creates single Summary Page linked to parent task
- Marks parent task and subtasks complete
- Returns to phase execution context after completion
- Parallelism is at subtask level (finer grained than execute-phase's plan level)

**Spawns:** gsd-executor for implementation work (one per subtask in parallel mode, or one for all in sequential mode)
**Output:** Summary Page + completed task with commit history
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/workflows/execute-plan.md
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

# Get plan page
task_pages = mosic_get_entity_pages("MTask", TASK_ID, {
  include_subtree: false
})

plan_page = task_pages.find(p =>
  p.title.includes("Plan") or p.page_type == "Spec"
)

plan_content = ""
IF plan_page:
  plan_content = mosic_get_page(plan_page.name, {
    content_format: "markdown"
  }).content
ELSE:
  Display: "Warning: No plan page found. Proceeding with subtask execution."
```

Display:
```
Task: {TASK_IDENTIFIER}
- Total subtasks: {subtasks.results.length}
- Complete: {complete_subtasks.length}
- Remaining: {incomplete_subtasks.length}
```

## 3. Load Phase Context

```
# Get parent phase
phase_id = task.task_list
phase = mosic_get_task_list(phase_id, { include_tasks: false })

# Get phase pages for context
phase_pages = mosic_get_entity_pages("MTask List", phase_id, {
  include_subtree: false
})

research_page = phase_pages.find(p => p.title.includes("Research"))
context_page = phase_pages.find(p => p.title.includes("Context"))

research_content = ""
IF research_page:
  research_content = mosic_get_page(research_page.name, {
    content_format: "markdown"
  }).content

context_content = ""
IF context_page:
  context_content = mosic_get_page(context_page.name, {
    content_format: "markdown"
  }).content

# Load task-specific context
task_context_page = task_pages.find(p => p.title.includes("Context"))
task_research_page = task_pages.find(p => p.title.includes("Research"))

task_context_content = ""
IF task_context_page:
  task_context_content = mosic_get_page(task_context_page.name, {
    content_format: "markdown"
  }).content

task_research_content = ""
IF task_research_page:
  task_research_content = mosic_get_page(task_research_page.name, {
    content_format: "markdown"
  }).content
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

```
# Determine if parallel execution is appropriate
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
# Shared context for all prompts
shared_context = """
**Parent Task:** """ + TASK_IDENTIFIER + """ - """ + TASK_TITLE + """
**Parent Task ID:** """ + TASK_ID + """
**Phase:** """ + phase.title + """
**Workspace:** """ + workspace_id + """

**Plan Content:**
""" + (plan_content or "No plan page available.") + """

**Phase Research (if available):**
""" + (research_content or "No phase research.") + """

**Phase Context & Decisions (if available):**
""" + (context_content or "No phase context.") + """

**Task-Specific Context (if available):**
""" + (task_context_content or "No task-specific context.") + """

**Task-Specific Research (if available):**
""" + (task_research_content or "No task-specific research.") + """
"""

all_commits = []        # Collected across all waves
all_files_changed = []  # Collected across all waves
all_results = []        # Agent return results
all_failures = []       # Track failures across all waves
```

### 6a. Sequential Execution (when `use_parallel = false`)

```
IF NOT use_parallel:
  # Build full subtask list for single agent
  subtask_details = ""
  FOR each subtask in incomplete_subtasks:
    st = subtask_details_map[subtask.name]
    subtask_details += """

### Subtask: """ + st.identifier + """ - """ + st.title + """
**Status:** """ + st.status + """
**Description:**
""" + st.description + """

---
"""

  executor_prompt = """
<objective>
Execute task """ + TASK_IDENTIFIER + """: """ + TASK_TITLE + """

Implement all subtasks and then ask for user permission to create commits. Create summary when complete.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
""" + shared_context + """

**Subtasks to Execute:**
""" + subtask_details + """
</context>

<commit_rules>
**Per-Subtask Commits:**
After each subtask completes:
1. Stage only files modified by that subtask
2. Commit with format: `{type}(""" + TASK_IDENTIFIER + """): {subtask-name}`
3. Types: feat, fix, test, refactor, perf, chore
4. Record commit hash for summary
5. Always ask for user permission before you commit

**Never use:**
- `git add .`
- `git add -A`
- `git add src/` or any broad directory
- Never auto commit the changes

**Always stage files individually.**
</commit_rules>

<success_criteria>
For each subtask:
- [ ] Implementation matches description
- [ ] Verification criteria pass
- [ ] Commit created with proper format
- [ ] Subtask marked complete in Mosic

Overall:
- [ ] All subtasks executed
- [ ] Commits recorded for summary
- [ ] No regressions introduced
</success_criteria>

<output_format>
After execution, return:

## EXECUTION COMPLETE

**Task:** {TASK_IDENTIFIER}
**Subtasks Completed:** N/N

### Commits
| Hash | Message |
|------|---------|
| abc123 | feat(AUTH-5): implement login form |
| def456 | test(AUTH-5): add login tests |

### Summary
{What was accomplished}

### Files Changed
- path/to/file1.ts
- path/to/file2.ts

### Verification Results
{What was verified and how}
</output_format>
"""

  Task(
    prompt="First, read ~/.claude/agents/gsd-executor.md for your role.\n\n" + executor_prompt,
    subagent_type="general-purpose",
    model="{executor_model}",
    description="Execute: " + TASK_TITLE.substring(0, 30)
  )
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
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
""" + shared_context + """

**Subtask to Execute (ONLY THIS ONE):**

### Subtask: """ + st.identifier + """ - """ + st.title + """
**Description:**
""" + st.description + """
</context>

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
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
""" + shared_context + """

**Subtask to Execute (ONLY THIS ONE):**

### Subtask: """ + st.identifier + """ - """ + st.title + """
**Description:**
""" + st.description + """
</context>
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
          prompt="First, read ~/.claude/agents/gsd-executor.md for your role.\n\n" + batch[0].prompt,
          subagent_type="general-purpose",
          model="{executor_model}",
          description="Subtask: " + batch[0].st.identifier
        )
        Task(
          prompt="First, read ~/.claude/agents/gsd-executor.md for your role.\n\n" + batch[1].prompt,
          subagent_type="general-purpose",
          model="{executor_model}",
          description="Subtask: " + batch[1].st.identifier
        )
        # ... (all tasks in batch in ONE response)
        # Wait for all agents in batch to complete before next batch

    ELSE:
      # Single subtask — run it alone in normal mode
      Task(
        prompt="First, read ~/.claude/agents/gsd-executor.md for your role.\n\n" + wave_prompts[0].prompt,
        subagent_type="general-purpose",
        model="{executor_model}",
        description="Subtask: " + wave_prompts[0].st.identifier
      )

    # 4. Collect results from all agents in this wave
    wave_current_failures = []
    FOR each agent_result in wave_results:
      IF agent_result contains "## SUBTASK COMPLETE" or agent_result contains "## EXECUTION COMPLETE":
        files = extract_file_list(agent_result)
        all_files_changed.push(...parse_file_list(files))
        all_results.push(agent_result)

        IF NOT wave_parallel:
          # Normal-mode agent committed on its own — extract commit info
          commits = extract_commits(agent_result)
          all_commits.push(...commits)
          mosic_complete_task(wave_subtasks[0].name)
          mosic_create_document("M Comment", {
            workspace: workspace_id,
            ref_doc: "MTask",
            ref_name: wave_subtasks[0].name,
            content: "<p><strong>Completed</strong></p>" +
              (commits.length > 0 ? "<p>Commit: <code>" + commits[0].hash + "</code></p>" : "")
          })

      ELIF agent_result contains "## SUBTASK FAILED":
        wave_current_failures.push(agent_result)
        all_failures.push(agent_result)

    # 5. Handle failures in this wave
    IF wave_current_failures.length > 0:
      Display: "Wave " + wave_num + " had " + wave_current_failures.length + " failure(s)"
      FOR each failure in wave_current_failures:
        Display: failure

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

        # Determine commit type from result content
        commit_type = infer_commit_type(result)
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
# --- Sequential mode: parse single executor return ---
IF NOT use_parallel:
  IF executor_output contains "## EXECUTION COMPLETE":
    commits = extract_commits(executor_output)
    summary_text = extract_section(executor_output, "### Summary")
    files_changed = extract_section(executor_output, "### Files Changed")
    verification_results = extract_section(executor_output, "### Verification Results")

    # Mark subtasks complete
    FOR each subtask in incomplete_subtasks:
      mosic_complete_task(subtask.name)

      subtask_commit = commits.find(c => c.message.includes(subtask.title.substring(0, 20)))
      mosic_create_document("M Comment", {
        workspace: workspace_id,
        ref_doc: "MTask",
        ref_name: subtask.name,
        content: "<p><strong>Completed</strong></p>" +
          (subtask_commit ? "<p>Commit: <code>" + subtask_commit.hash + "</code></p>" : "")
      })

    all_commits = commits
    all_files_changed = parse_file_list(files_changed)
  ELSE:
    ERROR: "Executor did not return structured completion. Check output."

# --- Parallel mode: results already collected in wave loop (step 6b) ---
# all_commits, all_files_changed, all_results already populated

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
- [ ] Sequential mode: single agent executes all subtasks with per-subtask commits
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
