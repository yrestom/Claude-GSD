<purpose>
Orchestrate parallel debug agents to investigate UAT gaps and find root causes.

After UAT finds gaps, spawn one debug agent per gap. Each agent investigates autonomously with symptoms pre-filled from UAT. Collect root causes, update UAT page with diagnosis, then hand off to plan-phase --gaps with actual diagnoses.

Orchestrator stays lean: parse gaps, spawn agents, collect results, update Mosic.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (UAT page, phase task list, tasks)
- Debug sessions are stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/debug/` directory operations
</mosic_only>

<core_principle>
**Diagnose before planning fixes.**

UAT tells us WHAT is broken (symptoms). Debug agents find WHY (root cause). plan-phase --gaps then creates targeted fixes based on actual causes, not guesses.

Without diagnosis: "Comment doesn't refresh" → guess at fix → maybe wrong
With diagnosis: "Comment doesn't refresh" → "useEffect missing dependency" → precise fix
</core_principle>

<process>

<step name="load_mosic_context" priority="first">

**Load context from Mosic:**

```
Read config.json for Mosic IDs:
- workspace_id
- project_id
- task_lists (phase mappings)
- pages (page IDs including UAT page)
- tags (tag IDs)
```

```javascript
// Load project with task lists
project = mosic_get_project(project_id, { include_task_lists: true })

// Find the phase task list
phase_task_list = project.task_lists.find(tl =>
  tl.title.includes("Phase " + PHASE_NUM) ||
  tl.identifier.startsWith(PHASE_NUM + "-")
)

// Get UAT page
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name)
uat_page = phase_pages.find(p => p.title.includes("UAT"))
uat_content = mosic_get_page(uat_page.name, { content_format: "markdown" })
```

</step>

<step name="parse_gaps">
**Extract gaps from UAT page content:**

Parse the "Gaps" section from UAT page:

```javascript
// Extract gaps from UAT content
gaps = parse_uat_gaps(uat_content)

// Each gap has:
// - truth: Expected behavior that failed
// - status: failed
// - reason: User reported issue
// - severity: blocker/major/minor/cosmetic
// - test: Test number
```

For each gap, also read the corresponding test from "Tests" section to get full context.

Build gap list:
```javascript
gaps = [
  { truth: "Comment appears immediately...", severity: "major", test_num: 2, reason: "..." },
  { truth: "Reply button positioned correctly...", severity: "minor", test_num: 5, reason: "..." },
  ...
]
```
</step>

<step name="report_plan">
**Report diagnosis plan to user:**

```
## Diagnosing {N} Gaps

Spawning parallel debug agents to investigate root causes:

| Gap (Truth) | Severity |
|-------------|----------|
| Comment appears immediately after submission | major |
| Reply button positioned correctly | minor |
| Delete removes comment | blocker |

Each agent will:
1. Create debug page in Mosic with symptoms pre-filled
2. Investigate autonomously (read code, form hypotheses, test)
3. Return root cause

This runs in parallel - all gaps investigated simultaneously.
```
</step>

<step name="spawn_agents">
**Spawn debug agents in parallel:**

For each gap, fill the debug-subagent-prompt template and spawn:

```javascript
Task(
  prompt = filled_debug_subagent_prompt,
  subagent_type = "general-purpose",
  description = "Debug: " + truth_short
)
```

**All agents spawn in single message** (parallel execution).

Template placeholders:
- `{truth}`: The expected behavior that failed
- `{expected}`: From UAT test
- `{actual}`: Verbatim user description from reason field
- `{errors}`: Any error messages from UAT (or "None reported")
- `{reproduction}`: "Test {test_num} in UAT"
- `{timeline}`: "Discovered during UAT"
- `{goal}`: `find_root_cause_only` (UAT flow - plan-phase --gaps handles fixes)
- `{slug}`: Generated from truth
</step>

<step name="collect_results">
**Collect root causes from agents:**

Each agent returns with:
```
## ROOT CAUSE FOUND

**Root Cause:** {specific cause with evidence}

**Evidence Summary:**
- {key finding 1}
- {key finding 2}
- {key finding 3}

**Files Involved:**
- {file1}: {what's wrong}
- {file2}: {related issue}

**Suggested Fix Direction:** {brief hint for plan-phase --gaps}
```

Parse each return to extract:
- root_cause: The diagnosed cause
- files: Files involved
- suggested_fix: Hint for gap closure plan

If agent returns `## INVESTIGATION INCONCLUSIVE`:
- root_cause: "Investigation inconclusive - manual review needed"
- Note which issue needs manual attention
- Include remaining possibilities from agent return
</step>

<step name="create_debug_pages">
**Create debug session pages in Mosic:**

```javascript
for (diagnosed_gap of diagnosed_gaps) {
  // Create debug session page linked to UAT page
  debug_page = mosic_create_entity_page("M Page", uat_page.name, {
    workspace_id: workspace_id,
    title: "Debug: " + diagnosed_gap.truth.substring(0, 50),
    page_type: "Document",
    icon: "lucide:bug",
    status: "Published",
    content: {
      blocks: [
        {
          type: "header",
          data: { text: "Debug Session: " + diagnosed_gap.truth, level: 1 }
        },
        {
          type: "header",
          data: { text: "Symptoms", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: "**Expected:** " + diagnosed_gap.expected }
        },
        {
          type: "paragraph",
          data: { text: "**Actual:** " + diagnosed_gap.reason }
        },
        {
          type: "header",
          data: { text: "Root Cause", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: diagnosed_gap.root_cause }
        },
        {
          type: "header",
          data: { text: "Evidence", level: 2 }
        },
        {
          type: "list",
          data: {
            style: "unordered",
            items: diagnosed_gap.evidence
          }
        },
        {
          type: "header",
          data: { text: "Files Involved", level: 2 }
        },
        {
          type: "list",
          data: {
            style: "unordered",
            items: diagnosed_gap.files.map(f => "`" + f.path + "`: " + f.issue)
          }
        },
        {
          type: "header",
          data: { text: "Suggested Fix", level: 2 }
        },
        {
          type: "paragraph",
          data: { text: diagnosed_gap.suggested_fix }
        }
      ]
    },
    relation_type: "Related"
  })

  // Tag the debug page
  mosic_batch_add_tags_to_document("M Page", debug_page.name, [
    tags.gsd_managed,
    tags.fix,
    tags["phase-" + PHASE_NUM]
  ])

  diagnosed_gap.debug_page_id = debug_page.name
}
```

</step>

<step name="update_issue_tasks">
**Update issue tasks with root causes:**

```javascript
for (diagnosed_gap of diagnosed_gaps) {
  // Find the issue task created during UAT
  issue_task_id = config.tasks["phase-" + PHASE_NUM + "-fix-" + diagnosed_gap.test_num]

  if (issue_task_id) {
    // Get current task
    issue_task = mosic_get_task(issue_task_id)

    // Update task with root cause
    // IMPORTANT: Task descriptions must use Editor.js format
    // Append diagnosis blocks to existing description
    existing_blocks = issue_task.description.blocks || []
    mosic_update_document("MTask", issue_task_id, {
      status: "ToDo",  // Unblock now that we have diagnosis
      description: {
        blocks: [
          ...existing_blocks,
          { type: "delimiter", data: {} },
          { type: "header", data: { text: "Root Cause", level: 2 } },
          { type: "paragraph", data: { text: diagnosed_gap.root_cause } },
          { type: "header", data: { text: "Files Involved", level: 2 } },
          { type: "list", data: { style: "unordered", items: diagnosed_gap.files.map(f => "`" + f.path + "`: " + f.issue) } },
          { type: "header", data: { text: "Suggested Fix", level: 2 } },
          { type: "paragraph", data: { text: diagnosed_gap.suggested_fix } }
        ]
      }
    })

    // Add diagnosis comment
    // IMPORTANT: Comments must use HTML format
    mosic_create_document("M Comment", {
      workspace_id: workspace_id,
      reference_doctype: "MTask",
      reference_name: issue_task_id,
      content: "<p><strong>Root Cause Diagnosed</strong></p>" +
        "<p>" + diagnosed_gap.root_cause + "</p>" +
        "<p><a href=\"page/" + diagnosed_gap.debug_page_id + "\">Debug Session</a></p>"
    })

    // Link debug page to issue task
    mosic_create_document("M Relation", {
      workspace_id: workspace_id,
      source_doctype: "M Page",
      source_name: diagnosed_gap.debug_page_id,
      target_doctype: "MTask",
      target_name: issue_task_id,
      relation_type: "Related"
    })
  }
}
```

</step>

<step name="update_uat_page">
**Update UAT page with diagnosis status:**

```javascript
// Update UAT page content with root causes
mosic_update_content_blocks(uat_page.name, {
  append_blocks: [
    {
      type: "header",
      data: { text: "Diagnosis Results", level: 2 }
    },
    {
      type: "table",
      data: {
        content: [
          ["Gap", "Root Cause", "Debug Session"],
          ...diagnosed_gaps.map(g => [
            g.truth.substring(0, 50) + "...",
            g.root_cause.substring(0, 80) + "...",
            "[View](page/" + g.debug_page_id + ")"
          ])
        ]
      }
    }
  ]
})

// Add diagnosis complete comment
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "M Page",
  reference_name: uat_page.name,
  content: "<p><strong>Diagnosis Complete</strong></p>" +
    "<p>" + diagnosed_count + " gaps diagnosed.</p>" +
    "<p>" + inconclusive_count + " gaps need manual review.</p>" +
    "<p>Ready for fix planning.</p>"
})
```

</step>

<step name="update_config">
**Update config.json with debug page IDs:**

```javascript
// Store debug page IDs in config
config.pages = config.pages || {}
for (gap of diagnosed_gaps) {
  config.pages["phase-" + PHASE_NUM + "-debug-" + gap.test_num] = gap.debug_page_id
}
config.last_sync = new Date().toISOString()

// Write config.json
```

```bash
git add config.json
git commit -m "docs(phase-${PHASE_NUM}): add root causes from diagnosis"
```

</step>

<step name="report_results">
**Report diagnosis results and hand off:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DIAGNOSIS COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Gap (Truth) | Root Cause | Files |
|-------------|------------|-------|
| Comment appears immediately | useEffect missing dependency | CommentList.tsx |
| Reply button positioned correctly | CSS flex order incorrect | ReplyButton.tsx |
| Delete removes comment | API missing auth header | api/comments.ts |

Mosic:
- UAT page updated with diagnosis results
- Debug session pages created for each gap
- Issue tasks updated with root causes

Proceeding to plan fixes...
```

Return to verify-work orchestrator for automatic planning.
Do NOT offer manual next steps - verify-work handles the rest.
</step>

</process>

<context_efficiency>
Agents start with symptoms pre-filled from UAT (no symptom gathering).
Agents only diagnose—plan-phase --gaps handles fixes (no fix application).
</context_efficiency>

<failure_handling>
**Agent fails to find root cause:**
- Mark gap as "needs manual review"
- Continue with other gaps
- Report incomplete diagnosis

**Agent times out:**
- Check debug page for partial progress
- Can resume with /gsd:debug

**All agents fail:**
- Something systemic (permissions, git, etc.)
- Report for manual investigation
- Fall back to plan-phase --gaps without root causes (less precise)
</failure_handling>

<success_criteria>
- [ ] Mosic context loaded (UAT page, phase task list)
- [ ] Gaps parsed from UAT page content
- [ ] Debug agents spawned in parallel
- [ ] Root causes collected from all agents
- [ ] Debug session pages created in Mosic linked to UAT page
- [ ] Issue tasks updated with root causes
- [ ] UAT page updated with diagnosis status
- [ ] config.json updated with debug page IDs
- [ ] Hand off to verify-work for automatic planning
</success_criteria>
