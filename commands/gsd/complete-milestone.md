---
type: prompt
name: gsd:complete-milestone
description: Archive completed milestone in Mosic and prepare for next version
argument-hint: <version>
allowed-tools:
  - Read
  - Write
  - Bash
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Mark milestone {{version}} complete in Mosic, archive project state, and prepare for next milestone.

Purpose: Create historical record of shipped version, archive project documentation, and prepare Mosic project for next milestone.

Output: Project marked complete in Mosic, milestone archive page created, git tagged.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/complete-milestone.md
@~/.claude/get-shit-done/templates/milestone-archive.md
</execution_context>

<context>
**User input:**
- Version: {{version}} (e.g., "1.0", "1.1", "2.0")

**Config file:** config.json (local file with Mosic entity IDs)
</context>

<process>

## Step 0: Load Configuration and Mosic Tools

```bash
# Load config.json
CONFIG=$(cat config.json 2>/dev/null || echo '{}')
WORKSPACE_ID=$(echo "$CONFIG" | jq -r '.mosic.workspace_id // empty')
PROJECT_ID=$(echo "$CONFIG" | jq -r '.mosic.project_id // empty')
```

Validate:
```
IF WORKSPACE_ID is empty OR PROJECT_ID is empty:
  ERROR: "No Mosic project configured. Run /gsd:new-project first."
  EXIT
```

Load Mosic tools:
```
ToolSearch("mosic project task page entity complete")
```

---

## Step 1: Load Project State from Mosic

```
# Get project with all task lists
project = mosic_get_project(PROJECT_ID, {
  include_task_lists: true
})

# Get all task lists with tasks
phase_stats = []
total_tasks = 0
completed_tasks = 0

FOR each task_list in project.task_lists:
  tl = mosic_get_task_list(task_list.name, { include_tasks: true })

  phase_stats.push({
    identifier: tl.identifier,
    title: tl.title,
    status: tl.status,
    total_tasks: tl.tasks.length,
    completed_tasks: tl.tasks.filter(t => t.done).length
  })

  total_tasks += tl.tasks.length
  completed_tasks += tl.tasks.filter(t => t.done).length

DISPLAY:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > COMPLETE MILESTONE v{version}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project: {project.title}

Phases: {phase_stats.length}
Tasks: {completed_tasks}/{total_tasks} completed

───────────────────────────────────────────────────────────────
"""
```

---

## Step 2: Check for Milestone Audit

```
# Search for audit page
audit_pages = mosic_search_pages({
  workspace_id: WORKSPACE_ID,
  query: "Milestone Audit v" + version,
  limit: 5
})

audit_page = audit_pages.find(p => p.title.includes("Audit"))

IF audit_page is null:
  DISPLAY:
  """
  Pre-flight Check

  No milestone audit found. Run `/gsd:audit-milestone` first to verify
  requirements coverage, cross-phase integration, and E2E flows.

  Continue anyway? (yes/no)
  """

  IF user_response != "yes":
    EXIT
ELSE:
  # Check audit status from page content
  audit_content = mosic_get_page(audit_page.name, { content_format: "plain" })

  IF audit_content.includes("gaps_found") OR audit_content.includes("GAPS FOUND"):
    DISPLAY:
    """
    Pre-flight Check

    Milestone audit found gaps. Run `/gsd:plan-milestone-gaps` to create
    phases that close the gaps, or proceed anyway to accept as tech debt.

    Continue anyway? (yes/no)
    """

    IF user_response != "yes":
      EXIT

DISPLAY: "Milestone audit passed. Proceeding with completion."
```

---

## Step 3: Verify All Phases Ready

```
incomplete_phases = phase_stats.filter(p =>
  p.status != "Completed" AND
  p.completed_tasks < p.total_tasks
)

IF incomplete_phases.length > 0:
  DISPLAY:
  """
  Incomplete Phases Found

  The following phases have incomplete tasks:
  """

  FOR each phase in incomplete_phases:
    DISPLAY: "- {phase.identifier}: {phase.title} ({phase.completed_tasks}/{phase.total_tasks} tasks)"

  DISPLAY:
  """
  Mark these as complete anyway? (yes/no)
  """

  IF user_response != "yes":
    EXIT
```

---

## Step 4: Gather Milestone Statistics

```
# Get git statistics
git_stats = {}

```bash
# Get first commit of milestone (if tags exist)
if git tag -l "v*" | grep -q .; then
  PREV_TAG=$(git tag -l "v*" --sort=-v:refname | head -1)
  FIRST_COMMIT=$(git log ${PREV_TAG}..HEAD --reverse --format="%H" | head -1)
else
  FIRST_COMMIT=$(git rev-list --max-parents=0 HEAD)
fi

# Statistics
FILES_CHANGED=$(git diff ${FIRST_COMMIT}..HEAD --stat | tail -1 | grep -oE '[0-9]+ files changed' | grep -oE '[0-9]+' || echo "0")
INSERTIONS=$(git diff ${FIRST_COMMIT}..HEAD --stat | tail -1 | grep -oE '[0-9]+ insertions' | grep -oE '[0-9]+' || echo "0")
DELETIONS=$(git diff ${FIRST_COMMIT}..HEAD --stat | tail -1 | grep -oE '[0-9]+ deletions' | grep -oE '[0-9]+' || echo "0")
COMMIT_COUNT=$(git rev-list ${FIRST_COMMIT}..HEAD --count)
START_DATE=$(git log ${FIRST_COMMIT} --format="%Y-%m-%d" -1)
END_DATE=$(date +%Y-%m-%d)
```

DISPLAY:
"""
Milestone Statistics

Timeline: {START_DATE} to {END_DATE}
Commits: {COMMIT_COUNT}
Files changed: {FILES_CHANGED}
Lines: +{INSERTIONS} / -{DELETIONS}
Phases: {phase_stats.length}
Tasks: {completed_tasks}

Confirm these stats? (yes/no)
"""

IF user_response != "yes":
  EXIT
```

---

## Step 5: Extract Key Accomplishments from Mosic

```
# Get all summary pages from the project
summary_pages = []

FOR each phase in project.task_lists:
  pages = mosic_get_entity_pages("MTask List", phase.name, { include_subtree: false })
  summaries = pages.filter(p => p.title.includes("Summary"))
  summary_pages.push(...summaries)

# Extract accomplishments from summaries
accomplishments = []

FOR each page in summary_pages.slice(0, 10):  # Limit to 10 most recent
  content = mosic_get_page(page.name, { content_format: "plain" })

  # Extract key accomplishments (lines starting with - or *)
  lines = content.split("\n").filter(l => l.match(/^[\-\*]\s/))
  accomplishments.push(...lines.slice(0, 2))  # Top 2 from each

# Take top 6 unique accomplishments
top_accomplishments = deduplicate(accomplishments).slice(0, 6)

DISPLAY:
"""
Key Accomplishments

{top_accomplishments.join("\n")}

Edit these accomplishments? (yes to edit, no to continue)
"""

IF user_response == "yes":
  PROMPT: "Enter accomplishments (one per line):"
  top_accomplishments = user_response.split("\n")
```

---

## Step 6: Create Milestone Archive Page in Mosic

```
# Build archive content
archive_content = {
  blocks: [
    {
      type: "header",
      data: { text: "Milestone v" + version + " Archive", level: 1 }
    },
    {
      type: "paragraph",
      data: { text: "**Project:** " + project.title }
    },
    {
      type: "paragraph",
      data: { text: "**Completed:** " + END_DATE }
    },
    {
      type: "header",
      data: { text: "Statistics", level: 2 }
    },
    {
      type: "table",
      data: {
        content: [
          ["Metric", "Value"],
          ["Timeline", START_DATE + " to " + END_DATE],
          ["Commits", COMMIT_COUNT],
          ["Phases", phase_stats.length],
          ["Tasks", completed_tasks],
          ["Files Changed", FILES_CHANGED],
          ["Lines Added", INSERTIONS],
          ["Lines Removed", DELETIONS]
        ]
      }
    },
    {
      type: "header",
      data: { text: "Key Accomplishments", level: 2 }
    },
    {
      type: "list",
      data: {
        style: "unordered",
        items: top_accomplishments
      }
    },
    {
      type: "header",
      data: { text: "Phases Completed", level: 2 }
    }
  ]
}

# Add phase summaries
FOR each phase in phase_stats:
  archive_content.blocks.push({
    type: "paragraph",
    data: { text: "**" + phase.identifier + ":** " + phase.title + " (" + phase.completed_tasks + " tasks)" }
  })

# Create archive page
archive_page = mosic_create_entity_page("MProject", PROJECT_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Milestone v" + version + " Archive",
  page_type: "Document",
  icon: "lucide:archive",
  status: "Published",
  content: archive_content,
  relation_type: "Related"
})

ARCHIVE_PAGE_ID = archive_page.name

# Tag the archive page
mosic_batch_add_tags_to_document("M Page", ARCHIVE_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.summary
])

DISPLAY: "Archive page created: https://mosic.pro/app/page/" + ARCHIVE_PAGE_ID
```

---

## Step 7: Mark All Phase Task Lists as Completed

```
FOR each task_list in project.task_lists:
  # Update task list status
  mosic_update_document("MTask List", task_list.name, {
    status: "Completed"
  })

  # Mark any remaining incomplete tasks as done
  tl = mosic_get_task_list(task_list.name, { include_tasks: true })

  FOR each task in tl.tasks.filter(t => !t.done):
    mosic_complete_task(task.name)

DISPLAY: "All " + project.task_lists.length + " phases marked completed"
```

---

## Step 8: Update Project Status

```
# Update project status to Completed
mosic_update_document("MProject", PROJECT_ID, {
  status: "Completed"
})

# Add completion comment
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  reference_doctype: "MProject",
  reference_name: PROJECT_ID,
  content: "<h2>Milestone v" + version + " Completed</h2>" +
    "<p><strong>Phases:</strong> " + phase_stats.length + "</p>" +
    "<p><strong>Tasks:</strong> " + completed_tasks + "</p>" +
    "<p><strong>Timeline:</strong> " + START_DATE + " - " + END_DATE + "</p>" +
    "<p><strong>Key Accomplishments:</strong></p>" +
    "<ul>" + top_accomplishments.map(a => "<li>" + a + "</li>").join("") + "</ul>" +
    "<p><a href=\"https://mosic.pro/app/page/" + ARCHIVE_PAGE_ID + "\">View Archive</a></p>"
})

DISPLAY: "Project marked completed: https://mosic.pro/app/MProject/" + PROJECT_ID
```

---

## Step 9: Git Tag and Commit

```bash
# Create git tag
TAG_MESSAGE="Milestone v${version}

Phases: ${phase_stats.length}
Tasks: ${completed_tasks}
Timeline: ${START_DATE} - ${END_DATE}

Key accomplishments:
${top_accomplishments.join('\n')}

Mosic Archive: https://mosic.pro/app/page/${ARCHIVE_PAGE_ID}"

git tag -a "v${version}" -m "$TAG_MESSAGE"
```

DISPLAY:
"""
Git tag v{version} created.

Push tag to remote? (yes/no)
"""

IF user_response == "yes":
  ```bash
  git push origin "v${version}"
  ```
  DISPLAY: "Tag pushed to remote"
```

---

## Step 10: Update config.json

```
# Store milestone completion in config
IF config.mosic.completed_milestones is null:
  config.mosic.completed_milestones = {}

config.mosic.completed_milestones["v" + version] = {
  "completed_at": ISO_TIMESTAMP,
  "archive_page": ARCHIVE_PAGE_ID,
  "phase_count": phase_stats.length,
  "task_count": completed_tasks,
  "git_tag": "v" + version
}

config.mosic.session = {
  "last_action": "complete-milestone",
  "last_updated": ISO_TIMESTAMP
}

write config.json
```

---

## Step 11: Display Completion and Next Steps

```
DISPLAY:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > MILESTONE v{version} COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project: {project.title}

Phases: {phase_stats.length}
Tasks: {completed_tasks}
Timeline: {START_DATE} - {END_DATE}

Mosic:
  Project: https://mosic.pro/app/MProject/{PROJECT_ID}
  Archive: https://mosic.pro/app/page/{ARCHIVE_PAGE_ID}

Git: v{version} tagged

───────────────────────────────────────────────────────────────

## Next Up

Start new milestone with fresh project:

/gsd:new-project

<sub>/clear first - fresh context window</sub>

───────────────────────────────────────────────────────────────
"""
```

</process>

<success_criteria>
- [ ] Project loaded from Mosic with all phases
- [ ] Milestone audit checked (warning if missing/gaps)
- [ ] All phases verified complete (or user confirmed)
- [ ] Statistics gathered from git and Mosic
- [ ] Accomplishments extracted from summary pages
- [ ] Milestone archive page created in Mosic
- [ ] All phase task lists marked Completed
- [ ] All tasks marked completed
- [ ] Project status updated to Completed
- [ ] Completion comment added with stats
- [ ] Git tag created
- [ ] config.json updated with completed_milestones
- [ ] User knows next steps
</success_criteria>

<critical_rules>
- **Verify completion:** Check audit exists before completing
- **User confirmation:** Wait for approval at verification gates
- **Archive before updating:** Create archive page before changing statuses
- **Git tag:** Always create annotated tag with milestone info
- **Fresh start:** Next milestone starts with /gsd:new-project (new Mosic project)
</critical_rules>
