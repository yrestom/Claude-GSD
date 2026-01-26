<overview>
Git integration for GSD framework. Commits trigger Mosic task updates when sync is enabled.
</overview>

<core_principle>

**Commit outcomes, not process.**

The git log should read like a changelog of what shipped, not a diary of planning activity.

**Mosic integration:** Commits update MTask status and create completion records. No local planning files to commit.
</core_principle>

<commit_points>

| Event                   | Commit? | Mosic Update |
| ----------------------- | ------- | ------------ |
| Project initialized     | YES     | MProject status: Active |
| Phase started           | NO      | MTask List status: In Progress |
| **Task completed**      | YES     | MTask status: Done, commit reference added |
| **Plan completed**      | YES     | Summary page created, MTask List progress updated |
| Handoff created         | NO      | Handoff comment/page created on MTask |

**Note:** Planning artifacts (requirements, roadmaps, research) are stored in Mosic M Pages, not committed to git.

</commit_points>

<git_check>

```bash
[ -d .git ] && echo "GIT_EXISTS" || echo "NO_GIT"
```

If NO_GIT: Run `git init` silently. GSD projects always get their own repo.
</git_check>

<commit_formats>

<format name="initialization">
## Project Initialization

```
docs: initialize [project-name] ([N] phases)

[One-liner from project description]

Phases:
1. [phase-name]: [goal]
2. [phase-name]: [goal]
3. [phase-name]: [goal]
```

What to commit:

```bash
# Only actual code/config files, not planning docs
git add package.json tsconfig.json .gitignore src/
git commit
```

**Mosic sync:**
```javascript
await mosic_update_document("MProject", project_id, {
  status: "Active"
});

// Add commit reference as comment
await mosic_create_document("M Comment", {
  comment_type: "Comment",
  reference_doctype: "MProject",
  reference_name: project_id,
  content: `Project initialized\nCommit: ${commitHash}`
});
```

</format>

<format name="task-completion">
## Task Completion (During Plan Execution)

Each task gets its own commit immediately after completion.

```
{type}({phase}-{plan}): {task-name}

- [Key change 1]
- [Key change 2]
- [Key change 3]
```

**Commit types:**
- `feat` - New feature/functionality
- `fix` - Bug fix
- `test` - Test-only (TDD RED phase)
- `refactor` - Code cleanup (TDD REFACTOR phase)
- `perf` - Performance improvement
- `chore` - Dependencies, config, tooling

**Examples:**

```bash
# Standard task
git add src/api/auth.ts src/types/user.ts
git commit -m "feat(08-02): create user registration endpoint

- POST /auth/register validates email and password
- Checks for duplicate users
- Returns JWT token on success
"

# TDD task - RED phase
git add src/__tests__/jwt.test.ts
git commit -m "test(07-02): add failing test for JWT generation

- Tests token contains user ID claim
- Tests token expires in 1 hour
- Tests signature verification
"

# TDD task - GREEN phase
git add src/utils/jwt.ts
git commit -m "feat(07-02): implement JWT generation

- Uses jose library for signing
- Includes user ID and expiry claims
- Signs with HS256 algorithm
"
```

**Mosic sync after task commit:**
```javascript
// Update task status
await mosic_update_document("MTask", task_id, {
  status: "Done"
});

// Mark task as completed
await mosic_complete_task(task_id);

// Add commit reference as comment
await mosic_create_document("M Comment", {
  comment_type: "Comment",
  reference_doctype: "MTask",
  reference_name: task_id,
  content: `**Task Completed**
Commit: ${commitHash}
Type: ${commitType}
Message: ${commitMessage}`
});
```

</format>

<format name="plan-completion">
## Plan Completion (After All Tasks Done)

After all tasks committed, one final commit captures any remaining changes.

```
docs({phase}-{plan}): complete [plan-name] plan

Tasks completed: [N]/[N]
- [Task 1 name]
- [Task 2 name]
- [Task 3 name]
```

What to commit:

```bash
# Any remaining files not committed with individual tasks
git add .
git commit
```

**Note:** No local planning files to commit. Summary is created in Mosic.

**Mosic sync after plan completion:**
```javascript
// Get task list to calculate progress
const taskList = await mosic_get_task_list(task_list_id, { include_tasks: true });
const completedTasks = taskList.tasks.filter(t => t.done).length;
const totalTasks = taskList.tasks.length;

// Create summary page linked to task list
const summaryPage = await mosic_create_entity_page("MTask List", task_list_id, {
  title: `Plan ${plan_id} Summary`,
  page_type: "Document",
  icon: "lucide:check-circle"
});

await mosic_update_content_blocks(summaryPage.name, [{
  type: "paragraph",
  data: {
    text: `## Plan Completion Summary

**Tasks Completed:** ${completedTasks}/${totalTasks}

### Commits
${commits.map(c => `- ${c.hash}: ${c.message}`).join('\n')}

### Files Changed
${filesChanged.join('\n')}

**Completed at:** ${new Date().toISOString()}`
  }
}]);

// Tag summary page
await mosic_add_tag_to_document("M Page", summaryPage.name, "summary");
await mosic_add_tag_to_document("M Page", summaryPage.name, `plan-${plan_id}`);
```

</format>

<format name="handoff">
## Handoff (WIP)

Handoffs don't require git commits. State is preserved in Mosic.

**Mosic handoff:**
```javascript
// Add handoff context as task comment
await mosic_create_document("M Comment", {
  comment_type: "Comment",
  reference_doctype: "MTask",
  reference_name: task_id,
  content: `**Session Handoff**
Status: ${currentStatus}
Progress: Task ${currentTask}/${totalTasks}
Next: ${nextStep}
Timestamp: ${new Date().toISOString()}`
});

// Update session state in config.json
config.session = {
  current_phase_id: phase_id,
  current_task_id: task_id,
  active_plan_number: plan_number,
  last_sync: new Date().toISOString()
};
```

If uncommitted code changes exist:
```bash
git stash -m "WIP: [phase-name] task [X]/[Y]"
```

</format>
</commit_formats>

<example_log>

**Per-task commits (recommended):**
```
# Phase 04 - Checkout
1a2b3c docs(04-01): complete checkout flow plan
4d5e6f feat(04-01): add webhook signature verification
7g8h9i feat(04-01): implement payment session creation
0j1k2l feat(04-01): create checkout page component

# Phase 03 - Products
3m4n5o docs(03-02): complete product listing plan
6p7q8r feat(03-02): add pagination controls
9s0t1u feat(03-02): implement search and filters
2v3w4x feat(03-01): create product catalog schema

# Phase 02 - Auth
5y6z7a docs(02-02): complete token refresh plan
8b9c0d feat(02-02): implement refresh token rotation
1e2f3g test(02-02): add failing test for token refresh
4h5i6j docs(02-01): complete JWT setup plan
7k8l9m feat(02-01): add JWT generation and validation
0n1o2p chore(02-01): install jose library

# Phase 01 - Foundation
3q4r5s docs(01-01): complete scaffold plan
6t7u8v feat(01-01): configure Tailwind and globals
9w0x1y feat(01-01): set up Prisma with database
2z3a4b feat(01-01): create Next.js 15 project

# Initialization
5c6d7e docs: initialize ecommerce-app (5 phases)
```

Each plan produces 2-4 commits (tasks + metadata). Clear, granular, bisectable.

</example_log>

<anti_patterns>

**Don't commit (no local planning files):**
- PLAN.md (doesn't exist - plans are in Mosic M Pages)
- RESEARCH.md (doesn't exist)
- SUMMARY.md (doesn't exist - summaries are in Mosic)
- STATE.md (doesn't exist - state is in Mosic)
- ROADMAP.md (doesn't exist - roadmap is in Mosic)

**Do commit (code outcomes):**
- Each task completion (feat/fix/test/refactor)
- Project initialization (docs)
- Configuration files (package.json, tsconfig.json, etc.)

**Key principle:** Commit working code and shipped outcomes. Documentation lives in Mosic M Pages.

</anti_patterns>

<commit_strategy_rationale>

## Why Per-Task Commits?

**Context engineering for AI:**
- Git history becomes primary context source for future Claude sessions
- `git log --grep="{phase}-{plan}"` shows all work for a plan
- `git diff <hash>^..<hash>` shows exact changes per task
- Mosic has the full context; git has the code history

**Failure recovery:**
- Task 1 committed, Task 2 failed
- Claude in next session: sees task 1 complete in git AND Mosic, can retry task 2
- Can `git reset --hard` to last successful task

**Debugging:**
- `git bisect` finds exact failing task, not just failing plan
- `git blame` traces line to specific task context
- Each commit is independently revertable

**Observability:**
- Solo developer + Claude workflow benefits from granular attribution
- Atomic commits are git best practice
- Mosic provides the "why", git provides the "what"

</commit_strategy_rationale>

<mosic_sync_on_commit>

## Mosic Sync on Commit

When `git.sync_on_commit` is enabled in config.json, commits trigger Mosic updates.

### Sync Behavior

| Commit Type | Mosic Action |
|-------------|--------------|
| Task completion (`feat`, `fix`, `test`, `refactor`) | MTask status: Done, commit comment added |
| Plan completion (`docs`) | Summary page created, MTask List progress updated |
| Project init (`docs: initialize`) | MProject status: Active, commit comment added |

### Implementation Pattern

```javascript
// After successful git commit
const commitHash = getLastCommitHash();
const commitType = parseCommitType(commitMessage);
const { phase, plan } = parsePhaseAndPlan(commitMessage);

// Load task from cached ID or search
const task_id = config.entity_ids.tasks[`${phase}-${plan}`];

if (commitType === 'task') {
  // Update task status
  await mosic_update_document("MTask", task_id, {
    status: "Done"
  });

  // Mark as completed
  await mosic_complete_task(task_id);

  // Add commit as comment
  await mosic_create_document("M Comment", {
    comment_type: "Comment",
    reference_doctype: "MTask",
    reference_name: task_id,
    content: `**Committed:** ${commitHash}\n${commitMessage}`
  });
}

if (commitType === 'plan') {
  // Get task list for progress calculation
  const task_list_id = config.entity_ids.task_lists[`phase_${phase}`];
  const taskList = await mosic_get_task_list(task_list_id, { include_tasks: true });

  // Create summary page
  const summaryPage = await mosic_create_entity_page("MTask List", task_list_id, {
    title: `Plan ${plan} Summary`,
    page_type: "Document"
  });

  // Tag the summary
  await mosic_add_tag_to_document("M Page", summaryPage.name, "summary");
}
```

### Commit -> Mosic Mapping

```
feat(08-02): create user registration endpoint
      |  |
      |  +-- Plan ID -> Find MTask by cached ID or plan reference
      +------ Phase ID -> Find MTask List
```

### Sync Configuration

In `config.json`:

```json
{
  "workspace_id": "...",
  "project_id": "...",
  "git": {
    "sync_on_commit": true
  },
  "entity_ids": {
    "task_lists": {
      "phase_1": "task-list-uuid",
      "phase_2": "task-list-uuid"
    },
    "tasks": {
      "01-01": "task-uuid",
      "01-02": "task-uuid"
    }
  }
}
```

### When NOT to Sync

- Failed commits (pre-commit hook failures)
- Amend commits (already synced)
- Rebase/squash operations (history rewrite)
- Local-only branches (not ready for tracking)

### Conflict Resolution

If Mosic task was updated externally:

1. Fetch current Mosic state before commit
2. Compare with expected state
3. If conflict: warn user, don't overwrite
4. Manual resolution: `/gsd:progress --sync` to reconcile

```javascript
// Check for conflicts before sync
const task = await mosic_get_task(task_id);

if (task.modified !== config.session.last_sync) {
  console.warn(`Task ${task_id} was modified externally. Skipping sync.`);
  console.warn(`Run /gsd:progress --sync to reconcile.`);
  return;
}
```

</mosic_sync_on_commit>

<no_local_planning_files>

## No Local Planning Files

GSD with Mosic does NOT create or commit local planning files:

**Not created:**
- `.planning/` directory
- `PLAN.md`, `SUMMARY.md`, `STATE.md`
- `REQUIREMENTS.md`, `ROADMAP.md`
- `RESEARCH.md`, `CONTEXT.md`

**Where this content lives:**
- Requirements -> M Page linked to MProject (tag: requirements)
- Roadmap -> M Page linked to MProject (tag: roadmap)
- Phase plans -> M Page linked to MTask (tag: plan)
- Summaries -> M Page linked to MTask List (tag: summary)
- State -> MTask status (In Progress, Done, Blocked)
- Research -> M Page linked to MTask List (tag: research)

**Benefits:**
- No merge conflicts on planning docs
- Single source of truth (Mosic)
- Cross-session visibility without git
- Rich querying via Mosic search
- Real-time collaboration support

</no_local_planning_files>

<config_file_handling>

## Config File Handling

The only GSD-related local file is `config.json`:

```json
{
  "workspace_id": "...",
  "project_id": "...",
  "session": {...},
  "entity_ids": {...},
  "git": {"sync_on_commit": true}
}
```

**Gitignore recommendation:**
```
# GSD session config (not committed)
config.json
```

**Why not committed:**
- Contains session-specific state
- Entity IDs may change between environments
- Mosic is the source of truth

</config_file_handling>
