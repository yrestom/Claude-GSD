<purpose>

Mark a shipped version (v1.0, v1.1, v2.0) as complete. This creates a historical record in Mosic, performs full project page evolution review, and tags the release in git.

This is the ritual that separates "development" from "shipped."

</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

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
```

```javascript
// Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

// Load project pages
project_pages = mosic_get_entity_pages("MProject", project_id)
```

Extract from project:
- Project name and description
- All task lists (phases) with status
- Current milestone info from project metadata

</step>

<step name="verify_readiness">

Check if milestone is truly complete by examining Mosic state:

```javascript
// Get all task lists for this project
task_lists = project.task_lists

// Check completion status
completed_phases = task_lists.filter(tl => tl.status === "Completed")
total_phases = task_lists.length
```

**Questions to verify:**

- Are all phase task lists marked complete?
- Do all phases have summary pages?
- Is this ready to ship/tag?

Present:

```
Milestone: [Name from user, e.g., "v1.0 MVP"]

Phase completion status:
- Phase 1: Foundation (Completed)
- Phase 2: Authentication (Completed)
- Phase 3: Core Features (Completed)
- Phase 4: Polish (Completed)

Total: 4 phases, all complete
```

<config-check>

```bash
cat config.json 2>/dev/null
```

</config-check>

<if mode="yolo">

```
⚡ Auto-approved: Milestone scope verification

[Show breakdown summary without prompting]

Proceeding to stats gathering...
```

Proceed directly to gather_stats step.

</if>

<if mode="interactive" OR="custom with gates.confirm_milestone_scope true">

```
Ready to mark this milestone as shipped?
(yes / wait / adjust scope)
```

Wait for confirmation.

If "adjust scope": Ask which phases should be included.
If "wait": Stop, user will return when ready.

</if>

</step>

<step name="gather_stats">

Calculate milestone statistics from git and Mosic:

```bash
# Find git range
git log --oneline --grep="feat(" | head -20

# Count files modified in range
git diff --stat FIRST_COMMIT..LAST_COMMIT | tail -1

# Count LOC (adapt to language)
find . -name "*.swift" -o -name "*.ts" -o -name "*.py" | xargs wc -l 2>/dev/null

# Calculate timeline
git log --format="%ai" FIRST_COMMIT | tail -1  # Start date
git log --format="%ai" LAST_COMMIT | head -1   # End date
```

```javascript
// Count tasks from Mosic
total_tasks = 0
for (task_list of task_lists) {
  tasks = mosic_get_task_list(task_list.name, { include_tasks: true })
  total_tasks += tasks.tasks.length
}
```

Present summary:

```
Milestone Stats:
- Phases: [X]
- Tasks: [N] total
- Files modified: [M]
- Lines of code: [LOC] [language]
- Timeline: [Days] days ([Start] → [End])
- Git range: feat(XX-XX) → feat(YY-YY)
```

</step>

<step name="extract_accomplishments">

Read all phase summary pages from Mosic:

```javascript
accomplishments = []
for (task_list of task_lists) {
  // Get summary page for this phase
  phase_pages = mosic_get_entity_pages("MTask List", task_list.name)
  summary_page = phase_pages.find(p => p.title.includes("Summary"))

  if (summary_page) {
    page_content = mosic_get_page(summary_page.name, { content_format: "markdown" })
    // Extract key accomplishments from content
    accomplishments.push({
      phase: task_list.title,
      summary: extract_accomplishments(page_content)
    })
  }
}
```

From summaries, extract 4-6 key accomplishments.

Present:

```
Key accomplishments for this milestone:
1. [Achievement from phase 1]
2. [Achievement from phase 2]
3. [Achievement from phase 3]
4. [Achievement from phase 4]
5. [Achievement from phase 5]
```

</step>

<step name="create_milestone_page">

Create milestone summary page in Mosic linked to project:

```javascript
milestone_page = mosic_create_entity_page("MProject", project_id, {
  workspace_id: workspace_id,
  title: VERSION + " Milestone Summary",
  page_type: "Document",
  icon: "lucide:trophy",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: VERSION + " " + MILESTONE_NAME, level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Shipped:** " + format_date(now) }
      },
      {
        type: "header",
        data: { text: "Delivered", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: MILESTONE_DESCRIPTION }
      },
      {
        type: "header",
        data: { text: "Key Accomplishments", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: KEY_ACCOMPLISHMENTS.map(a => a)
        }
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
            ["Phases", PHASE_COUNT],
            ["Tasks", TASK_COUNT],
            ["Duration", DAYS + " days"],
            ["Git Range", FIRST_COMMIT + " → " + LAST_COMMIT]
          ]
        }
      },
      {
        type: "header",
        data: { text: "What's Next", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: WHATS_NEXT }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the milestone page
mosic_batch_add_tags_to_document("M Page", milestone_page.name, [
  tags.gsd_managed,
  tags.summary,
  VERSION.replace(".", "-")  // e.g., "v1-0" tag
])
```

</step>

<step name="update_project_status">

Update project in Mosic to reflect milestone completion:

```javascript
// Update project status
// IMPORTANT: MProject descriptions use HTML format
mosic_update_document("MProject", project_id, {
  status: "Completed",
  description: original_description + "<hr>" +
    "<p><strong>Milestone " + VERSION + " Complete</strong></p>" +
    "<ul>" +
    "<li>Shipped: " + format_date(now) + "</li>" +
    "<li>Phases: " + PHASE_COUNT + "</li>" +
    "<li>Tasks: " + TASK_COUNT + "</li>" +
    "</ul>"
})

// Add completion comment
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MProject",
  reference_name: project_id,
  content: "<p><strong>Milestone " + VERSION + " Complete</strong></p>" +
    "<p><strong>Delivered:</strong> " + MILESTONE_DESCRIPTION + "</p>" +
    "<p><strong>Stats:</strong></p>" +
    "<ul>" +
    "<li>" + PHASE_COUNT + " phases completed</li>" +
    "<li>" + TASK_COUNT + " tasks total</li>" +
    "<li>" + DAYS + " days from start to ship</li>" +
    "</ul>" +
    "<p><strong>Git Tag:</strong> <code>" + VERSION + "</code></p>"
})
```

</step>

<step name="mark_phases_complete">

Ensure all phase task lists are marked complete:

```javascript
// IMPORTANT: MTask List descriptions use HTML format
for (task_list of task_lists) {
  if (task_list.status !== "Completed") {
    mosic_update_document("MTask List", task_list.name, {
      status: "Completed",
      description: task_list.description + "<hr><p><strong>Completed in " + VERSION + "</strong></p>"
    })
  }
}
```

</step>

<step name="create_phase_relations">

Link milestone page to all phase summary pages:

```javascript
for (task_list of task_lists) {
  phase_pages = mosic_get_entity_pages("MTask List", task_list.name)
  summary_page = phase_pages.find(p => p.title.includes("Summary"))

  if (summary_page) {
    mosic_create_document("M Relation", {
      workspace_id: workspace_id,
      source_doctype: "M Page",
      source_name: milestone_page.name,
      target_doctype: "M Page",
      target_name: summary_page.name,
      relation_type: "Related"
    })
  }
}
```

</step>

<step name="evolve_project_pages">

Perform full project page evolution review at milestone completion.

**Read all phase summaries and update project documentation:**

```javascript
// Get project overview page
project_pages = mosic_get_entity_pages("MProject", project_id)
overview_page = project_pages.find(p => p.title.includes("Overview") || p.title.includes("Requirements"))

if (overview_page) {
  // Update with validated requirements
  current_content = mosic_get_page(overview_page.name, { content_format: "full" })

  // Add validated requirements section
  mosic_update_content_blocks(overview_page.name, {
    append_blocks: [
      {
        type: "header",
        data: { text: "Validated in " + VERSION, level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: VALIDATED_REQUIREMENTS
        }
      }
    ]
  })
}
```

**Full review checklist:**

1. **Project description accuracy:**
   - Read current description
   - Compare to what was actually built
   - Update if the product has meaningfully changed

2. **Requirements audit:**
   - All shipped requirements → Move to Validated section
   - Any requirements invalidated → Note with reason

3. **Key Decisions audit:**
   - Extract all decisions from milestone phase summaries
   - Add to decisions page with outcomes where known

</step>

<step name="git_tag">

Create git tag for milestone:

```bash
git tag -a v[X.Y] -m "$(cat <<'EOF'
v[X.Y] [Name]

Delivered: [One sentence]

Key accomplishments:
- [Item 1]
- [Item 2]
- [Item 3]

Mosic Project: https://mosic.pro/app/Project/[project_id]
EOF
)"
```

Confirm: "Tagged: v[X.Y]"

Ask: "Push tag to remote? (y/n)"

If yes:

```bash
git push origin v[X.Y]
```

</step>

<step name="update_config">

Update config.json with milestone completion:

```javascript
// Update config.json
config.milestones = config.milestones || []
config.milestones.push({
  version: VERSION,
  name: MILESTONE_NAME,
  completed: new Date().toISOString(),
  phases: task_lists.map(tl => tl.name),
  page_id: milestone_page.name
})
config.last_sync = new Date().toISOString()

// Write config.json
```

**Confirm commit with user:**

Use AskUserQuestion:
- Question: "Commit milestone completion to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
chore: complete v[X.Y] milestone

- Milestone page created in Mosic
- All phases marked complete
- Git tag: v[X.Y]
EOF
)"
```

</step>

<step name="offer_next">

```
✅ Milestone v[X.Y] [Name] complete

Shipped:
- [N] phases ([P] tasks)
- [One sentence of what shipped]

Mosic:
- Project: https://mosic.pro/app/Project/[project_id]
- Summary: https://mosic.pro/app/page/[milestone_page.name]

Tag: v[X.Y]

---

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/gsd:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

</process>

<milestone_naming>

**Version conventions:**
- **v1.0** — Initial MVP
- **v1.1, v1.2, v1.3** — Minor updates, new features, fixes
- **v2.0, v3.0** — Major rewrites, breaking changes, significant new direction

**Name conventions:**
- v1.0 MVP
- v1.1 Security
- v1.2 Performance
- v2.0 Redesign
- v2.0 iOS Launch

Keep names short (1-2 words describing the focus).

</milestone_naming>

<what_qualifies>

**Create milestones for:**
- Initial release (v1.0)
- Public releases
- Major feature sets shipped
- Before archiving planning

**Don't create milestones for:**
- Every phase completion (too granular)
- Work in progress (wait until shipped)
- Internal dev iterations (unless truly shipped internally)

If uncertain, ask: "Is this deployed/usable/shipped in some form?"
If yes → milestone. If no → keep working.

</what_qualifies>

<success_criteria>

Milestone completion is successful when:

- [ ] Mosic context loaded (project, task lists, pages)
- [ ] Milestone stats gathered from git and Mosic
- [ ] Key accomplishments extracted from phase summaries
- [ ] Milestone summary page created in Mosic
- [ ] Project status updated to "Completed"
- [ ] All phase task lists marked complete
- [ ] Relations created between milestone page and phase summaries
- [ ] Completion comment added to project
- [ ] Project pages evolved with validated requirements
- [ ] Git tag created (v[X.Y])
- [ ] config.json updated with milestone info
- [ ] User knows next step (/gsd:new-milestone)

</success_criteria>
