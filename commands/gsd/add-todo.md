---
name: gsd:add-todo
description: Capture idea or task as todo from current conversation context
argument-hint: [optional description]
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - mcp__mosic_pro__*
---

<objective>
Capture an idea, task, or issue that surfaces during a GSD session as a structured todo for later work.

Enables "thought → capture → continue" flow without losing context or derailing current work.
</objective>

<context>
@.planning/STATE.md
</context>

<process>

<step name="ensure_directory">
```bash
mkdir -p .planning/todos/pending .planning/todos/done
```
</step>

<step name="check_existing_areas">
```bash
ls .planning/todos/pending/*.md 2>/dev/null | xargs -I {} grep "^area:" {} 2>/dev/null | cut -d' ' -f2 | sort -u
```

Note existing areas for consistency in infer_area step.
</step>

<step name="extract_content">
**With arguments:** Use as the title/focus.
- `/gsd:add-todo Add auth token refresh` → title = "Add auth token refresh"

**Without arguments:** Analyze recent conversation to extract:
- The specific problem, idea, or task discussed
- Relevant file paths mentioned
- Technical details (error messages, line numbers, constraints)

Formulate:
- `title`: 3-10 word descriptive title (action verb preferred)
- `problem`: What's wrong or why this is needed
- `solution`: Approach hints or "TBD" if just an idea
- `files`: Relevant paths with line numbers from conversation
</step>

<step name="infer_area">
Infer area from file paths:

| Path pattern | Area |
|--------------|------|
| `src/api/*`, `api/*` | `api` |
| `src/components/*`, `src/ui/*` | `ui` |
| `src/auth/*`, `auth/*` | `auth` |
| `src/db/*`, `database/*` | `database` |
| `tests/*`, `__tests__/*` | `testing` |
| `docs/*` | `docs` |
| `.planning/*` | `planning` |
| `scripts/*`, `bin/*` | `tooling` |
| No files or unclear | `general` |

Use existing area from step 2 if similar match exists.
</step>

<step name="check_duplicates">
```bash
grep -l -i "[key words from title]" .planning/todos/pending/*.md 2>/dev/null
```

If potential duplicate found:
1. Read the existing todo
2. Compare scope

If overlapping, use AskUserQuestion:
- header: "Duplicate?"
- question: "Similar todo exists: [title]. What would you like to do?"
- options:
  - "Skip" — keep existing todo
  - "Replace" — update existing with new context
  - "Add anyway" — create as separate todo
</step>

<step name="create_file">
```bash
timestamp=$(date "+%Y-%m-%dT%H:%M")
date_prefix=$(date "+%Y-%m-%d")
```

Generate slug from title (lowercase, hyphens, no special chars).

Write to `.planning/todos/pending/${date_prefix}-${slug}.md`:

```markdown
---
created: [timestamp]
title: [title]
area: [area]
files:
  - [file:lines]
---

## Problem

[problem description - enough context for future Claude to understand weeks later]

## Solution

[approach hints or "TBD"]
```
</step>

<step name="update_state">
If `.planning/STATE.md` exists:

1. Count todos: `ls .planning/todos/pending/*.md 2>/dev/null | wc -l`
2. Update "### Pending Todos" under "## Accumulated Context"
</step>

<step name="git_commit">
Commit the todo and any updated state:

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations, log "Todo saved (not committed - commit_docs: false)"

**If `COMMIT_PLANNING_DOCS=true` (default):**

```bash
git add .planning/todos/pending/[filename]
[ -f .planning/STATE.md ] && git add .planning/STATE.md
git commit -m "$(cat <<'EOF'
docs: capture todo - [title]

Area: [area]
EOF
)"
```

Confirm: "Committed: docs: capture todo - [title]"
</step>

<step name="sync_to_mosic">
**Check if Mosic is enabled:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

### Step 1: Get Mosic Context

```bash
# Get workspace and project IDs from config
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
```

### Step 2: Determine Target Entity

**If todo maps to a phase (from check_roadmap):**
```
# Get the phase's task list ID
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE}\"]")
target_entity_type = "MTask List"
target_entity_id = TASK_LIST_ID
```

**If no phase match (general todo):**
```
target_entity_type = "MProject"
target_entity_id = PROJECT_ID
```

### Step 3: Create MTask for the Todo

```
todo_task = mosic_create_document("MTask", {
  workspace_id: WORKSPACE_ID,
  task_list: TASK_LIST_ID,  # or null if project-level
  project: PROJECT_ID,
  title: "[todo title]",
  description: "## Problem\n\n[problem from todo]\n\n## Solution\n\n[solution from todo]\n\n---\n*Captured via /gsd:add-todo*",
  icon: "lucide:lightbulb",
  status: "Backlog",
  priority: "Normal"
})

todo_task_id = todo_task.name
```

### Step 4: Tag the Task

```
mosic_batch_add_tags_to_document("MTask", todo_task_id, [
  GSD_MANAGED_TAG,
  # Add area-specific tag if exists
])

# Create area tag if needed
IF area tag doesn't exist:
  area_tag = mosic_create_document("M Tag", {
    workspace_id: WORKSPACE_ID,
    title: "area-" + area,
    color: "#78716C",
    description: "Area: " + area
  })
  mosic_add_tag_to_document("MTask", todo_task_id, area_tag.name)
```

### Step 5: Update Todo File with Mosic ID

Add to todo frontmatter:
```yaml
mosic_task_id: [todo_task_id]
```

### Step 6: Display Sync Status

```
✓ Todo synced to Mosic
  Task: https://mosic.pro/app/MTask/[todo_task_id]
```

**Error handling:**

```
IF mosic sync fails:
  - Display warning: "Mosic sync failed: [error]. Todo saved locally."
  - Add to mosic.pending_sync array in config.json:
    { type: "todo", file: "[filename]", action: "create" }
  - Continue (don't block)
```

**If mosic.enabled = false:** Skip Mosic sync.
</step>

<step name="confirm">
```
Todo saved: .planning/todos/pending/[filename]

  [title]
  Area: [area]
  Files: [count] referenced
  [IF mosic.enabled:] Mosic: https://mosic.pro/app/MTask/[todo_task_id]

---

Would you like to:

1. Continue with current work
2. Add another todo
3. View all todos (/gsd:check-todos)
```
</step>

</process>

<output>
- `.planning/todos/pending/[date]-[slug].md`
- Updated `.planning/STATE.md` (if exists)
- MTask in Mosic (if enabled)
</output>

<anti_patterns>
- Don't create todos for work in current plan (that's deviation rule territory)
- Don't create elaborate solution sections — captures ideas, not plans
- Don't block on missing information — "TBD" is fine
</anti_patterns>

<success_criteria>
- [ ] Directory structure exists
- [ ] Todo file created with valid frontmatter
- [ ] Problem section has enough context for future Claude
- [ ] No duplicates (checked and resolved)
- [ ] Area consistent with existing todos
- [ ] STATE.md updated if exists
- [ ] Todo and state committed to git
- [ ] Mosic sync (if enabled):
  - [ ] MTask created for todo
  - [ ] Tags applied (gsd-managed, area tag)
  - [ ] mosic_task_id added to todo frontmatter
  - [ ] Sync failure handled gracefully (added to pending_sync)
</success_criteria>
