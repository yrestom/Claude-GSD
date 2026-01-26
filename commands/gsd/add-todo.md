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

**Mosic-only architecture:** Todos are created directly as MTasks in Mosic with "lucide:lightbulb" icon.
</objective>

<context>
Load from Mosic MCP:
- config.json → workspace_id, project_id
- mosic_search_tags({ workspace_id, query: "area-" }) → existing area tags
</context>

<process>

<step name="load_config">
**Load session context from config.json:**

```bash
WORKSPACE_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat config.json 2>/dev/null | jq -r ".mosic.project_id")
GSD_MANAGED_TAG=$(cat config.json 2>/dev/null | jq -r ".mosic.tags.gsd_managed")
```

If config.json missing or IDs not set:
```
No active GSD session. Run /gsd:new-project first.
```
Exit.
</step>

<step name="check_existing_areas">
**Fetch existing area tags from Mosic:**

```
existing_tags = mosic_search_tags({
  workspace_id: WORKSPACE_ID,
  query: "area-"
})

area_tags = existing_tags.map(t => t.title.replace("area-", ""))
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
| `scripts/*`, `bin/*` | `tooling` |
| No files or unclear | `general` |

Use existing area from step 2 if similar match exists.
</step>

<step name="check_duplicates">
**Search for existing similar todos in Mosic:**

```
existing_todos = mosic_search_tasks({
  workspace_id: WORKSPACE_ID,
  project_id: PROJECT_ID,
  query: "[key words from title]",
  status__in: ["Backlog", "ToDo"],
  icon: "lucide:lightbulb"
})
```

If potential duplicate found:
1. Check the existing todo details
2. Compare scope

If overlapping, use AskUserQuestion:
- header: "Duplicate?"
- question: "Similar todo exists: [title]. What would you like to do?"
- options:
  - "Skip" — keep existing todo
  - "Update existing" — add context to existing todo
  - "Add anyway" — create as separate todo
</step>

<step name="get_or_create_area_tag">
**Ensure area tag exists:**

```
area_tag_name = "area-" + area

existing_tag = mosic_search_tags({
  workspace_id: WORKSPACE_ID,
  query: area_tag_name
}).find(t => t.title == area_tag_name)

IF !existing_tag:
  area_tag = mosic_create_document("M Tag", {
    workspace_id: WORKSPACE_ID,
    title: area_tag_name,
    color: "#78716C",
    description: "Area: " + area
  })
  area_tag_id = area_tag.name
ELSE:
  area_tag_id = existing_tag.name
```
</step>

<step name="create_todo_task">
**Create MTask for the todo in Mosic:**

```
# IMPORTANT: Task descriptions must use Editor.js format
todo_task = mosic_create_document("MTask", {
  workspace_id: WORKSPACE_ID,
  project: PROJECT_ID,
  title: "[todo title]",
  description: {
    blocks: [
      {
        type: "header",
        data: { text: "Problem", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "[problem description - enough context for future Claude to understand weeks later]" }
      },
      {
        type: "header",
        data: { text: "Solution", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "[approach hints or 'TBD']" }
      },
      {
        type: "header",
        data: { text: "Files", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: files_list  // Array of file paths
        }
      },
      {
        type: "delimiter",
        data: {}
      },
      {
        type: "paragraph",
        data: { text: "*Captured via /gsd:add-todo*" }
      }
    ]
  },
  icon: "lucide:lightbulb",  # Marks this as a todo
  status: "Backlog",
  priority: "Normal"
})

todo_task_id = todo_task.name
```
</step>

<step name="tag_todo">
**Apply tags to the todo task:**

```
mosic_batch_add_tags_to_document("MTask", todo_task_id, [
  GSD_MANAGED_TAG,
  area_tag_id
])
```
</step>

<step name="update_session">
**Update config.json with todo reference:**

```json
{
  "session": {
    "last_todo_id": "[todo_task_id]",
    "last_activity": "[timestamp]"
  }
}
```
</step>

<step name="confirm">
```
✓ Todo captured

  Title: [title]
  Area: [area]
  Mosic: https://mosic.pro/app/MTask/[todo_task_id]

---

Would you like to:

1. Continue with current work
2. Add another todo
3. View all todos (/gsd:check-todos)
```
</step>

</process>

<output>
- MTask created in Mosic with "lucide:lightbulb" icon
- Tags applied (gsd-managed, area tag)
- config.json updated with todo reference
</output>

<anti_patterns>
- Don't create todos for work in current plan (that's deviation rule territory)
- Don't create elaborate solution sections — captures ideas, not plans
- Don't block on missing information — "TBD" is fine
- Don't create local files — all todos live in Mosic
</anti_patterns>

<success_criteria>
- [ ] Config loaded from config.json
- [ ] Existing area tags fetched from Mosic
- [ ] Todo content extracted (title, problem, solution, files)
- [ ] Area inferred and tag created if needed
- [ ] Duplicate check performed via mosic_search_tasks
- [ ] MTask created with "lucide:lightbulb" icon
- [ ] Tags applied (gsd-managed, area tag)
- [ ] config.json updated
- [ ] User shown todo URL and next options
</success_criteria>
