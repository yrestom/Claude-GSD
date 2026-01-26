<planning_config>

Configuration options for `.planning/` directory behavior and Mosic integration.

<config_schema>
```json
{
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "mosic": {
    "enabled": false,
    "workspace_id": null,
    "space_id": null,
    "project_id": null,
    "sync_on_commit": true,
    "auto_detect": true,
    "task_lists": {},
    "tasks": {},
    "pages": {},
    "tags": {
      "gsd_managed": null,
      "requirements": null,
      "research": null,
      "plan": null,
      "summary": null,
      "verification": null,
      "uat": null,
      "quick": null,
      "fix": null,
      "phase_tags": {}
    },
    "page_types": {
      "overview": "Document",
      "requirements": "Spec",
      "roadmap": "Spec",
      "research": "Document",
      "plan": "Spec",
      "summary": "Document",
      "verification": "Document",
      "uat": "Document"
    },
    "page_icons": {
      "overview": "lucide:book-open",
      "requirements": "lucide:list-checks",
      "roadmap": "lucide:map",
      "research": "lucide:search",
      "plan": "lucide:file-code",
      "summary": "lucide:check-circle",
      "verification": "lucide:shield-check",
      "uat": "lucide:user-check"
    },
    "status_mapping": {
      "not_started": "Backlog",
      "planning": "ToDo",
      "in_progress": "In Progress",
      "in_review": "In Review",
      "blocked": "Blocked",
      "completed": "Completed"
    },
    "priority_mapping": {
      "wave_1": "Critical",
      "wave_2": "High",
      "wave_3": "Normal",
      "default": "Normal"
    },
    "relation_types": {
      "task_to_task": "Depends",
      "task_to_plan": "Related",
      "issue_to_task": "Blocker",
      "page_to_page": "Related",
      "phase_to_phase": "Depends"
    },
    "last_sync": null,
    "pending_sync": []
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `commit_docs` | `true` | Whether to commit planning artifacts to git |
| `search_gitignored` | `false` | Add `--no-ignore` to broad rg searches |
| `mosic.enabled` | `false` | Enable Mosic project management sync |
| `mosic.workspace_id` | `null` | Mosic workspace UUID |
| `mosic.project_id` | `null` | Mosic project UUID (set after project creation) |
| `mosic.sync_on_commit` | `true` | Auto-sync to Mosic after git commits |
| `mosic.auto_detect` | `true` | Auto-detect existing Mosic projects by name |
</config_schema>

<commit_docs_behavior>

**When `commit_docs: true` (default):**
- Planning files committed normally
- SUMMARY.md, STATE.md, ROADMAP.md tracked in git
- Full history of planning decisions preserved

**When `commit_docs: false`:**
- Skip all `git add`/`git commit` for `.planning/` files
- User must add `.planning/` to `.gitignore`
- Useful for: OSS contributions, client projects, keeping planning private

**Checking the config:**

```bash
# Check config.json first
COMMIT_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")

# Auto-detect gitignored (overrides config)
git check-ignore -q .planning 2>/dev/null && COMMIT_DOCS=false
```

**Auto-detection:** If `.planning/` is gitignored, `commit_docs` is automatically `false` regardless of config.json. This prevents git errors when users have `.planning/` in `.gitignore`.

**Conditional git operations:**

```bash
if [ "$COMMIT_DOCS" = "true" ]; then
  git add .planning/STATE.md
  git commit -m "docs: update state"
fi
```

</commit_docs_behavior>

<search_behavior>

**When `search_gitignored: false` (default):**
- Standard rg behavior (respects .gitignore)
- Direct path searches work: `rg "pattern" .planning/` finds files
- Broad searches skip gitignored: `rg "pattern"` skips `.planning/`

**When `search_gitignored: true`:**
- Add `--no-ignore` to broad rg searches that should include `.planning/`
- Only needed when searching entire repo and expecting `.planning/` matches

**Note:** Most GSD operations use direct file reads or explicit paths, which work regardless of gitignore status.

</search_behavior>

<setup_uncommitted_mode>

To use uncommitted mode:

1. **Set config:**
   ```json
   "planning": {
     "commit_docs": false,
     "search_gitignored": true
   }
   ```

2. **Add to .gitignore:**
   ```
   .planning/
   ```

3. **Existing tracked files:** If `.planning/` was previously tracked:
   ```bash
   git rm -r --cached .planning/
   git commit -m "chore: stop tracking planning docs"
   ```

</setup_uncommitted_mode>

<mosic_integration>

## Mosic MCP Integration

GSD integrates with Mosic MCP for cloud-based project management visibility.

### Architecture

**Hybrid Architecture:**
- Local `.planning/` files remain the source of truth
- Mosic provides persistent, searchable project visibility
- One-way push: Local → Mosic only
- Never modify local files based on Mosic state

**Entity Mapping:**

| GSD Concept | Mosic Entity | Relation |
|-------------|--------------|----------|
| Project | MProject | 1:1 |
| Phase | MTask List | 1:1 |
| Plan | MTask | 1:1 |
| Task (within plan) | MTask CheckList | 1:N |
| REQUIREMENTS.md | M Page (Spec) | 1:1 |
| ROADMAP.md | M Page (Spec) | 1:1 |
| SUMMARY.md | M Page (Document) | 1:1 per plan |
| CONTEXT.md | M Page (Document) | 1:1 per phase |

### Page Types

Use semantic page types for different documentation:

| Content Type | Page Type | Icon | Purpose |
|--------------|-----------|------|---------|
| Overview | Document | lucide:book-open | General information |
| Requirements | Spec | lucide:list-checks | Specifications |
| Roadmap | Spec | lucide:map | Structured plans |
| Research | Document | lucide:search | Investigation results |
| Plan | Spec | lucide:file-code | Execution plans |
| Summary | Document | lucide:check-circle | Completion summaries |
| Verification | Document | lucide:shield-check | Verification reports |
| UAT | Document | lucide:user-check | User acceptance testing |

### Relation Types

| Relation | From → To | Purpose |
|----------|-----------|---------|
| Depends | Phase → Phase | Phase execution order |
| Depends | Task → Task | Task dependencies |
| Related | Task → Page | Link task to documentation |
| Related | Page → Page | Connect related docs |
| Blocker | Issue → Task | Issue blocks task completion |

### Tag Infrastructure

Tags provide cross-cutting organization:

- `gsd-managed`: All GSD-managed entities
- `requirements`: Requirements documentation
- `research`: Research and investigation
- `plan`: Execution plans
- `summary`: Completion summaries
- `verification`: Verification results
- `uat`: User acceptance testing
- `quick`: Quick tasks outside roadmap
- `fix`: Bug fix and issue resolution
- `phase-01`, `phase-02`, etc.: Phase identification

### Enabling Mosic

During `/gsd:new-project`, if Mosic MCP is available:

1. User is prompted to enable Mosic integration
2. Workspace is selected or detected
3. Existing projects can be linked or new project created
4. Tags are created (idempotent - only missing ones)
5. Project pages are created with proper types

### Sync Points

**new-project:** Creates project, overview page, tags

**plan-phase:** Creates tasks, plan pages, checklists, dependencies

**execute-phase:** Updates task status, creates summary pages, marks checklists done

**verify-work:** Creates UAT page, issue tasks with Blocker relations

**complete-milestone:** Updates project status, creates milestone summary

**quick:** Creates quick task with summary page

**add-phase:** Creates phase task list with overview page

### Error Handling

Mosic sync errors should never block local operations:

```
IF mosic sync fails:
  - Log warning with error details
  - Add failed item to mosic.pending_sync array
  - Continue with local operation
  - Retry on next sync opportunity
```

### Checking Mosic Status

```bash
# Check if Mosic is enabled
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")

# Load workspace/project IDs
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
```

</mosic_integration>

</planning_config>
