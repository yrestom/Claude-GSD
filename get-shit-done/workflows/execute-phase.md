<purpose>
Execute all tasks in a phase using wave-based parallel execution. Orchestrator stays lean by delegating task execution to subagents.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, tasks, pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<core_principle>
The orchestrator's job is coordination, not execution. Each subagent loads the full execute-plan context itself. Orchestrator discovers tasks, analyzes dependencies, groups into waves, spawns agents, handles checkpoints, collects results.
</core_principle>

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
// Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

// Find the phase task list
phase_task_list = project.task_lists.find(tl =>
  tl.title.includes("Phase " + PHASE_ARG) ||
  tl.identifier.startsWith(PHASE_ARG + "-")
)

if (!phase_task_list) {
  console.log("ERROR: No phase matching '" + PHASE_ARG + "'")
  exit(1)
}

// Get phase with tasks
phase = mosic_get_task_list(phase_task_list.name, { include_tasks: true })

// Get phase pages for context
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name)
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-executor | opus | sonnet | sonnet |
| gsd-verifier | sonnet | sonnet | haiku |

Store resolved models for use in Task calls below.
</step>

<step name="validate_phase">
Confirm phase exists and has tasks:

```javascript
tasks = phase.tasks

if (tasks.length === 0) {
  console.log("ERROR: No tasks found in phase")
  exit(1)
}

// Filter tasks by completion status
incomplete_tasks = tasks.filter(t => !t.done)

// If --gaps-only flag: also filter for gap_closure tasks
if (GAPS_ONLY_FLAG) {
  incomplete_tasks = incomplete_tasks.filter(t =>
    t.title.includes("Fix:") || t.title.includes("Gap:")
  )
}

if (incomplete_tasks.length === 0) {
  console.log("No matching incomplete tasks")
  exit(0)
}

console.log("Found " + incomplete_tasks.length + " tasks to execute")
```

</step>

<step name="group_by_wave">
Read task metadata and group by wave number:

```javascript
// Group tasks by wave (from task metadata or sequence)
waves = {}
for (task of incomplete_tasks) {
  wave = task.metadata?.wave || 1
  if (!waves[wave]) waves[wave] = []
  waves[wave].push(task)
}

// Report wave structure
console.log("## Execution Plan\n")
console.log("**Phase " + PHASE_ARG + ": " + phase.title + "** — " +
  incomplete_tasks.length + " tasks across " + Object.keys(waves).length + " waves\n")

console.log("| Wave | Tasks | What it builds |")
console.log("|------|-------|----------------|")
for (wave_num in waves) {
  wave_tasks = waves[wave_num].map(t => t.identifier).join(", ")
  console.log("| " + wave_num + " | " + wave_tasks + " | ... |")
}
```

</step>

<step name="execute_waves">
Execute each wave in sequence. Autonomous tasks within a wave run in parallel.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each task's description. Extract what's being built and why it matters.

2. **Spawn all autonomous agents in wave simultaneously:**

   ```javascript
   for (task of waves[wave_num]) {
     // Get task plan page if exists
     task_pages = mosic_get_entity_pages("MTask", task.name)
     plan_page = task_pages.find(p => p.title.includes("Plan"))

     plan_content = plan_page ?
       mosic_get_page(plan_page.name, { content_format: "markdown" }) :
       task.description

     // Spawn executor agent
     Task(
       prompt = `
       <objective>
       Execute task ${task.identifier}: ${task.title}

       Commit each subtask atomically. Create summary page. Update task status.
       </objective>

       <execution_context>
       @~/.claude/get-shit-done/workflows/execute-plan.md
       @~/.claude/get-shit-done/templates/summary.md
       </execution_context>

       <context>
       Task: ${task.title}
       Description: ${task.description}

       Plan (if exists):
       ${plan_content}

       Config:
       workspace_id: ${workspace_id}
       task_id: ${task.name}
       </context>

       <success_criteria>
       - [ ] All subtasks executed
       - [ ] Each subtask committed individually
       - [ ] Summary page created in Mosic linked to task
       - [ ] Task marked complete in Mosic
       </success_criteria>
       `,
       subagent_type = "gsd-executor",
       model = executor_model
     )
   }
   ```

3. **Wait for all agents in wave to complete:**

   Task tool blocks until each agent finishes. All parallel agents return together.

4. **Report completion and what was built:**

   For each completed agent:
   - Verify task marked complete in Mosic
   - Read summary page to extract what was built
   - Note any issues or deviations

5. **Handle failures:**

   If any agent in wave fails:
   - Report which task failed and why
   - Ask user: "Continue with remaining waves?" or "Stop execution?"
   - If continue: proceed to next wave
   - If stop: exit with partial completion report

6. **Proceed to next wave**

</step>

<step name="checkpoint_handling">
Tasks with checkpoints require user interaction.

**Detection:** Check task metadata for `autonomous: false` or checkpoint indicators.

**Execution flow for checkpoint tasks:**

1. **Spawn agent for checkpoint task:**
   ```
   Task(prompt="{subagent-task-prompt}", subagent_type="gsd-executor", model="{executor_model}")
   ```

2. **Agent runs until checkpoint:**
   - Executes auto subtasks normally
   - Reaches checkpoint (e.g., auth gate, human verify)
   - Agent returns with structured checkpoint state

3. **Orchestrator presents checkpoint to user:**

   ```
   ## Checkpoint: [Type]

   **Task:** {identifier} {title}
   **Progress:** {completed}/{total} subtasks

   [Checkpoint Details section from agent return]

   [Awaiting section from agent return]
   ```

4. **User responds:**
   - "approved" / "done" → spawn continuation agent
   - Description of issues → spawn continuation agent with feedback
   - Decision selection → spawn continuation agent with choice

5. **Spawn continuation agent (NOT resume):**

   Fresh agent with previous state inlined.

6. **Repeat until task completes or user stops**

</step>

<step name="aggregate_results">
After all waves complete, aggregate results:

```javascript
// Calculate completion stats
completed_tasks = tasks.filter(t => t.done).length
total_tasks = tasks.length

console.log("## Phase " + PHASE_ARG + ": " + phase.title + " Execution Complete\n")
console.log("**Waves executed:** " + Object.keys(waves).length)
console.log("**Tasks completed:** " + completed_tasks + " of " + total_tasks)
```

</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed its TASKS.

**Spawn verifier:**

```javascript
Task(
  prompt = `Verify phase ${PHASE_ARG} goal achievement.

Phase: ${phase.title}
Goal: ${phase.description}

Check must_haves against actual codebase. Create verification page in Mosic.
Verify what actually exists in the code.`,
  subagent_type = "gsd-verifier",
  model = verifier_model
)
```

**Route by status:**

| Status | Action |
|--------|--------|
| `passed` | Continue to update_phase_status |
| `human_needed` | Present items to user, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/gsd:plan-phase {phase} --gaps` |

</step>

<step name="update_phase_status">
**Mark phase complete in Mosic:**

```javascript
// Update phase task list status
// IMPORTANT: MTask List descriptions use HTML format
mosic_update_document("MTask List", phase_task_list.name, {
  status: "Completed",
  description: phase.description + "<hr>" +
    "<p><strong>Phase Complete</strong></p>" +
    "<ul>" +
    "<li>Tasks: " + completed_tasks + "/" + total_tasks + "</li>" +
    "<li>Completed: " + format_date(now) + "</li>" +
    "</ul>"
})
```

</step>

<step name="create_phase_summary">
**Create phase summary page in Mosic:**

```javascript
phase_summary_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE_ARG + " Execution Summary",
  page_type: "Document",
  icon: "lucide:check-circle",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + PHASE_ARG + " Complete", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Waves executed:** " + wave_count }
      },
      {
        type: "paragraph",
        data: { text: "**Tasks completed:** " + completed_tasks + "/" + total_tasks }
      },
      {
        type: "header",
        data: { text: "Wave Summary", level: 2 }
      },
      {
        type: "table",
        data: {
          content: wave_summary_table
        }
      },
      {
        type: "header",
        data: { text: "Verification", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "Status: " + verification_status + "\nScore: " + verification_score }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the summary page
mosic_batch_add_tags_to_document("M Page", phase_summary_page.name, [
  tags.gsd_managed,
  tags.summary,
  tags["phase-" + PHASE_ARG]
])
```

</step>

<step name="add_completion_comment">
**Add phase completion comment:**

```javascript
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask List",
  reference_name: phase_task_list.name,
  content: "<p><strong>Phase Execution Complete</strong></p>" +
    "<ul>" +
    "<li>Waves: " + wave_count + "</li>" +
    "<li>Tasks: " + completed_tasks + "/" + total_tasks + "</li>" +
    "<li>Verification: " + verification_status + "</li>" +
    "</ul>" +
    "<p><a href=\"page/" + phase_summary_page.name + "\">Execution Summary</a></p>"
})
```

</step>

<step name="update_config">
**Update config.json with phase completion:**

```javascript
config.pages["phase-" + PHASE_ARG + "-summary"] = phase_summary_page.name
config.last_sync = new Date().toISOString()

// Write config.json
```

```bash
git add config.json
git commit -m "chore(phase-${PHASE_ARG}): complete phase execution"
```

</step>

<step name="offer_next">
Present next steps based on milestone status:

**If more phases remain:**
```
## ▶ Next Up

**Phase {X+1}: {Name}** — {Goal}

`/gsd:plan-phase {X+1}`

<sub>`/clear` first → fresh context window</sub>
```

**If milestone complete:**
```
MILESTONE COMPLETE!

All {N} phases executed.

`/gsd:complete-milestone`
```
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context (task metadata, spawning, results).
Subagents: Fresh 200k each (full workflow + execution).
No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
**Subagent fails mid-task:**
- Task won't be marked complete in Mosic
- Orchestrator detects incomplete status
- Reports failure, asks user how to proceed

**Dependency chain breaks:**
- Wave 1 task fails
- Wave 2 tasks depending on it will likely fail
- Orchestrator can still attempt them (user choice)
- Or skip dependent tasks entirely

**All agents in wave fail:**
- Something systemic (git issues, permissions, etc.)
- Stop execution
- Report for manual investigation

**Checkpoint fails to resolve:**
- User can't approve or provides repeated issues
- Ask: "Skip this task?" or "Abort phase execution?"
- Update task with partial progress
</failure_handling>

<resumption>
**Resuming interrupted execution:**

If phase execution was interrupted (context limit, user exit, error):

1. Run `/gsd:execute-phase {phase}` again
2. Load phase from Mosic
3. Filter for incomplete tasks (done = false)
4. Resumes from first incomplete task
5. Continues wave-based execution

**Mosic tracks:**
- Task completion status (done field)
- Task metadata (wave, autonomous)
- Any pending checkpoints (via comments)
</resumption>

<success_criteria>
- [ ] Mosic context loaded (project, phase task list, tasks, pages)
- [ ] Incomplete tasks identified and grouped by wave
- [ ] Each wave executed with parallel agents where possible
- [ ] Checkpoints handled with user interaction
- [ ] Phase goal verified (not just tasks completed)
- [ ] Phase task list marked complete
- [ ] Phase summary page created linked to task list
- [ ] Completion comment added
- [ ] config.json updated with page ID
- [ ] User knows next step
</success_criteria>
