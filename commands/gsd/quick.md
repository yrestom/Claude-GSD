---
name: gsd:quick
description: Execute a quick task with GSD guarantees (atomic commits, state tracking) but skip optional agents
argument-hint: ""
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Execute small, ad-hoc tasks with GSD guarantees (atomic commits, STATE.md tracking) while skipping optional agents (research, plan-checker, verifier).

Quick mode is the same system with a shorter path:
- Spawns gsd-planner (quick mode) + gsd-executor(s)
- Skips gsd-phase-researcher, gsd-plan-checker, gsd-verifier
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

Use when: You know exactly what to do and the task is small enough to not need research or verification.
</objective>

<execution_context>
Orchestration is inline - no separate workflow file. Quick mode is deliberately simpler than full GSD.
</execution_context>

<context>
@.planning/STATE.md
</context>

<process>
**Step 0: Resolve Model Profile**

Read model profile for agent spawning:

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-planner | opus | opus | sonnet |
| gsd-executor | opus | sonnet | sonnet |

Store resolved models for use in Task calls below.

---

**Step 1: Pre-flight validation**

Check that an active GSD project exists:

```bash
if [ ! -f .planning/ROADMAP.md ]; then
  echo "Quick mode requires an active project with ROADMAP.md."
  echo "Run /gsd:new-project first."
  exit 1
fi
```

If validation fails, stop immediately with the error message.

Quick tasks can run mid-phase - validation only checks ROADMAP.md exists, not phase status.

---

**Step 2: Get task description**

Prompt user interactively for the task description:

```
AskUserQuestion(
  header: "Quick Task",
  question: "What do you want to do?",
  followUp: null
)
```

Store response as `$DESCRIPTION`.

If empty, re-prompt: "Please provide a task description."

Generate slug from description:
```bash
slug=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
```

---

**Step 3: Calculate next quick task number**

Ensure `.planning/quick/` directory exists and find the next sequential number:

```bash
# Ensure .planning/quick/ exists
mkdir -p .planning/quick

# Find highest existing number and increment
last=$(ls -1d .planning/quick/[0-9][0-9][0-9]-* 2>/dev/null | sort -r | head -1 | xargs -I{} basename {} | grep -oE '^[0-9]+')

if [ -z "$last" ]; then
  next_num="001"
else
  next_num=$(printf "%03d" $((10#$last + 1)))
fi
```

---

**Step 4: Create quick task directory**

Create the directory for this quick task:

```bash
QUICK_DIR=".planning/quick/${next_num}-${slug}"
mkdir -p "$QUICK_DIR"
```

Report to user:
```
Creating quick task ${next_num}: ${DESCRIPTION}
Directory: ${QUICK_DIR}
```

Store `$QUICK_DIR` for use in orchestration.

---

**Step 5: Spawn planner (quick mode)**

Spawn gsd-planner with quick mode context:

```
Task(
  prompt="
<planning_context>

**Mode:** quick
**Directory:** ${QUICK_DIR}
**Description:** ${DESCRIPTION}

**Project State:**
@.planning/STATE.md

</planning_context>

<constraints>
- Create a SINGLE plan with 1-3 focused tasks
- Quick tasks should be atomic and self-contained
- No research phase, no checker phase
- Target ~30% context usage (simple, focused)
</constraints>

<output>
Write plan to: ${QUICK_DIR}/${next_num}-PLAN.md
Return: ## PLANNING COMPLETE with plan path
</output>
",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Quick plan: ${DESCRIPTION}"
)
```

After planner returns:
1. Verify plan exists at `${QUICK_DIR}/${next_num}-PLAN.md`
2. Extract plan count (typically 1 for quick tasks)
3. Report: "Plan created: ${QUICK_DIR}/${next_num}-PLAN.md"

If plan not found, error: "Planner failed to create ${next_num}-PLAN.md"

---

**Step 6: Spawn executor**

Spawn gsd-executor with plan reference:

```
Task(
  prompt="
Execute quick task ${next_num}.

Plan: @${QUICK_DIR}/${next_num}-PLAN.md
Project state: @.planning/STATE.md

<constraints>
- Execute all tasks in the plan
- Commit each task atomically
- Create summary at: ${QUICK_DIR}/${next_num}-SUMMARY.md
- Do NOT update ROADMAP.md (quick tasks are separate from planned phases)
</constraints>
",
  subagent_type="gsd-executor",
  model="{executor_model}",
  description="Execute: ${DESCRIPTION}"
)
```

After executor returns:
1. Verify summary exists at `${QUICK_DIR}/${next_num}-SUMMARY.md`
2. Extract commit hash from executor output
3. Report completion status

If summary not found, error: "Executor failed to create ${next_num}-SUMMARY.md"

Note: For quick tasks producing multiple plans (rare), spawn executors in parallel waves per execute-phase patterns.

---

**Step 6.5: Sync quick task to Mosic (Deep Integration)**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

Display:
```
◆ Syncing quick task to Mosic...
```

### Step 6.5a: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
QUICK_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.quick")
SUMMARY_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.summary")
QUICK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"quick\"]")
```

### Step 6.5b: Find or Create "Quick Tasks" MTask List

```
IF QUICK_LIST_ID is null or empty:
  # Search for existing Quick Tasks list first
  existing_lists = mosic_search({
    workspace_id: workspace_id,
    query: "Quick Tasks",
    doctypes: ["MTask List"]
  })

  IF existing_lists.length > 0 AND existing_lists[0].project == project_id:
    quick_list_id = existing_lists[0].name
  ELSE:
    # Create Quick Tasks list with rich metadata
    quick_list = mosic_create_document("MTask List", {
      workspace_id: workspace_id,
      project: project_id,
      title: "Quick Tasks",
      description: "Ad-hoc tasks completed outside the main roadmap.\n\nThese are small, atomic tasks handled via `/gsd:quick` that don't require full planning cycles.",
      icon: "lucide:zap",
      color: "amber",
      status: "In Progress",
      prefix: "QT"
    })
    quick_list_id = quick_list.name

    # Tag the list
    mosic_batch_add_tags_to_document("MTask List", quick_list_id, [
      GSD_MANAGED_TAG,
      QUICK_TAG
    ])

  # Store in config.json
  # mosic.task_lists["quick"] = quick_list_id
```

### Step 6.5c: Create MTask with Rich Metadata

```
# Read SUMMARY.md for task description
summary_content = read(${QUICK_DIR}/${next_num}-SUMMARY.md)
task_description = extract_summary_section(summary_content)

task = mosic_create_document("MTask", {
  workspace_id: workspace_id,
  task_list: quick_list_id,
  title: "QT-" + next_num + ": " + DESCRIPTION,
  description: task_description,
  icon: "lucide:zap",
  status: "Completed",
  priority: "Normal",
  done: true,
  start_date: "[ISO timestamp - task start]",
  end_date: "[ISO timestamp - now]"
})

task_id = task.name
```

### Step 6.5d: Create Checklist from PLAN.md Tasks

```
# Extract tasks from PLAN.md
plan_tasks = extract_plan_tasks(${QUICK_DIR}/${next_num}-PLAN.md)

FOR each plan_task in plan_tasks:
  mosic_create_document("MTask CheckList", {
    workspace_id: workspace_id,
    task: task_id,
    title: plan_task.name,
    done: true  # All complete since task is done
  })
```

### Step 6.5e: Tag the Task

```
mosic_batch_add_tags_to_document("MTask", task_id, [
  GSD_MANAGED_TAG,
  QUICK_TAG
])
```

### Step 6.5f: Add Commit as Comment

```
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  ref_doc: "MTask",
  ref_name: task_id,
  content: "✅ **Completed**\n\n**Commit:** `" + commit_hash + "`\n\n**Summary:** " + QUICK_DIR + "/" + next_num + "-SUMMARY.md"
})
```

### Step 6.5g: Create Summary Page Linked to Task

```
summary_page = mosic_create_entity_page("MTask", task_id, {
  workspace_id: workspace_id,
  title: "Execution Summary",
  page_type: "Document",
  icon: "lucide:check-circle",
  status: "Published",
  content: convert_to_editorjs(summary_content),
  relation_type: "Related"
})

# Tag the summary page
mosic_batch_add_tags_to_document("M Page", summary_page.name, [
  GSD_MANAGED_TAG,
  SUMMARY_TAG,
  QUICK_TAG
])

# Store page ID
# mosic.pages["quick-" + next_num + "-summary"] = summary_page.name
```

### Step 6.5h: Update config.json Mappings

```bash
# Update config.json with:
# mosic.tasks["quick-NNN"] = task_id
# mosic.pages["quick-NNN-summary"] = summary_page.name
```

Display:
```
✓ Quick task synced to Mosic
  Task: https://mosic.pro/app/MTask/[task_id]
  Summary: https://mosic.pro/app/page/[summary_page.name]
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Task completed locally."
  - Add to mosic.pending_sync array for retry
  - Continue to step 7 (don't block)
```

**If mosic.enabled = false:** Skip to step 7.

---

**Step 7: Update STATE.md**

Update STATE.md with quick task completion record.

**7a. Check if "Quick Tasks Completed" section exists:**

Read STATE.md and check for `### Quick Tasks Completed` section.

**7b. If section doesn't exist, create it:**

Insert after `### Blockers/Concerns` section:

```markdown
### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
```

**7c. Append new row to table:**

```markdown
| ${next_num} | ${DESCRIPTION} | $(date +%Y-%m-%d) | ${commit_hash} | [${next_num}-${slug}](./quick/${next_num}-${slug}/) |
```

**7d. Update "Last activity" line:**

Find and update the line:
```
Last activity: $(date +%Y-%m-%d) - Completed quick task ${next_num}: ${DESCRIPTION}
```

Use Edit tool to make these changes atomically

---

**Step 8: Final commit and completion**

Stage and commit quick task artifacts:

```bash
# Stage quick task artifacts
git add ${QUICK_DIR}/${next_num}-PLAN.md
git add ${QUICK_DIR}/${next_num}-SUMMARY.md
git add .planning/STATE.md

# Commit with quick task format
git commit -m "$(cat <<'EOF'
docs(quick-${next_num}): ${DESCRIPTION}

Quick task completed.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

Get final commit hash:
```bash
commit_hash=$(git rev-parse --short HEAD)
```

Display completion output:
```
---

GSD > QUICK TASK COMPLETE

Quick Task ${next_num}: ${DESCRIPTION}

Summary: ${QUICK_DIR}/${next_num}-SUMMARY.md
Commit: ${commit_hash}
[IF mosic.enabled:]
Mosic: https://mosic.pro/app/MTask/[task_id]
[END IF]

---

Ready for next task: /gsd:quick
```

</process>

<success_criteria>
- [ ] ROADMAP.md validation passes
- [ ] User provides task description
- [ ] Slug generated (lowercase, hyphens, max 40 chars)
- [ ] Next number calculated (001, 002, 003...)
- [ ] Directory created at `.planning/quick/NNN-slug/`
- [ ] `${next_num}-PLAN.md` created by planner
- [ ] `${next_num}-SUMMARY.md` created by executor
- [ ] STATE.md updated with quick task row
- [ ] Mosic sync (if enabled):
  - [ ] Quick Tasks MTask List found or created
  - [ ] MTask created with status "Completed"
  - [ ] Tags applied (gsd-managed, quick)
  - [ ] Commit added as comment
- [ ] Artifacts committed
</success_criteria>
