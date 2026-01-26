<purpose>
Verify phase goal achievement through goal-backward analysis. Check that the codebase actually delivers what the phase promised, not just that tasks were completed.

This workflow is executed by a verification subagent spawned from execute-phase.md.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, tasks, pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<core_principle>
**Task completion ≠ Goal achievement**

A task "create chat component" can be marked complete when the component is a placeholder. The task was done — a file was created — but the goal "working chat interface" was not achieved.

Goal-backward verification starts from the outcome and works backwards:
1. What must be TRUE for the goal to be achieved?
2. What must EXIST for those truths to hold?
3. What must be WIRED for those artifacts to function?

Then verify each level against the actual codebase.
</core_principle>

<required_reading>
@~/.claude/get-shit-done/references/verification-patterns.md
@~/.claude/get-shit-done/templates/verification-report.md
</required_reading>

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

// Find the phase task list
phase_task_list = project.task_lists.find(tl =>
  tl.title.includes("Phase " + PHASE_NUM) ||
  tl.identifier.startsWith(PHASE_NUM + "-")
)

// Get phase tasks with details
phase = mosic_get_task_list(phase_task_list.name, { include_tasks: true })

// Get phase pages (summaries, plans, etc.)
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name)
```

**Extract phase goal:** Parse phase task list description for this phase's goal/description. This is the outcome to verify, not the tasks.

</step>

<step name="load_requirements">
Check if requirements page exists for this phase:

```javascript
// Get project requirements page
project_pages = mosic_get_entity_pages("MProject", project_id)
requirements_page = project_pages.find(p => p.title.includes("Requirements"))

if (requirements_page) {
  requirements_content = mosic_get_page(requirements_page.name, { content_format: "markdown" })
  // Parse requirements mapped to this phase
  phase_requirements = extract_phase_requirements(requirements_content, PHASE_NUM)
}
```

These become additional verification targets.
</step>

<step name="establish_must_haves">
**Determine what must be verified.**

**Option A: Must-haves from plan task pages**

Check if any plan task has `must_haves` in its description:

```javascript
plan_tasks = phase.tasks.filter(t => t.title.includes("Plan"))

for (task of plan_tasks) {
  task_pages = mosic_get_entity_pages("MTask", task.name)
  plan_page = task_pages.find(p => p.title.includes("Plan"))

  if (plan_page) {
    plan_content = mosic_get_page(plan_page.name, { content_format: "markdown" })
    must_haves = extract_must_haves(plan_content)
  }
}
```

If found, extract and use:
```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
  artifacts:
    - path: "src/components/Chat.tsx"
      provides: "Message list rendering"
  key_links:
    - from: "Chat.tsx"
      to: "api/chat"
      via: "fetch in useEffect"
```

**Option B: Derive from phase goal**

If no must_haves in plan pages, derive using goal-backward process:

1. **State the goal:** Take phase goal from task list description
2. **Derive truths:** Ask "What must be TRUE for this goal to be achieved?"
3. **Derive artifacts:** For each truth, ask "What must EXIST?"
4. **Derive key links:** For each artifact, ask "What must be CONNECTED?"
5. **Document derived must-haves** before proceeding to verification.
</step>

<step name="verify_truths">
**For each observable truth, determine if codebase enables it.**

A truth is achievable if the supporting artifacts exist, are substantive, and are wired correctly.

**Verification status:**
- ✓ VERIFIED: All supporting artifacts pass all checks
- ✗ FAILED: One or more supporting artifacts missing, stub, or unwired
- ? UNCERTAIN: Can't verify programmatically (needs human)

**For each truth:**

1. Identify supporting artifacts (which files make this truth possible?)
2. Check artifact status (see verify_artifacts step)
3. Check wiring status (see verify_wiring step)
4. Determine truth status based on supporting infrastructure
</step>

<step name="verify_artifacts">
**For each required artifact, verify three levels:**

### Level 1: Existence

```bash
check_exists() {
  local path="$1"
  if [ -f "$path" ]; then
    echo "EXISTS"
  elif [ -d "$path" ]; then
    echo "EXISTS (directory)"
  else
    echo "MISSING"
  fi
}
```

### Level 2: Substantive

Check that the file has real implementation, not a stub.

**Stub pattern check:**
```bash
check_stubs() {
  local path="$1"
  local stubs=$(grep -c -E "TODO|FIXME|placeholder|not implemented" "$path" 2>/dev/null || echo 0)
  local empty=$(grep -c -E "return null|return undefined|return \{\}|return \[\]" "$path" 2>/dev/null || echo 0)
  local total=$((stubs + empty))
  [ "$total" -gt 0 ] && echo "STUB_PATTERNS ($total found)" || echo "NO_STUBS"
}
```

### Level 3: Wired

Check that the artifact is connected to the system using import/usage checks.

### Final artifact status

| Exists | Substantive | Wired | Status |
|--------|-------------|-------|--------|
| ✓ | ✓ | ✓ | ✓ VERIFIED |
| ✓ | ✓ | ✗ | ⚠️ ORPHANED |
| ✓ | ✗ | - | ✗ STUB |
| ✗ | - | - | ✗ MISSING |

Record status and evidence for each artifact.
</step>

<step name="verify_wiring">
**Verify key links between artifacts.**

Key links are critical connections. If broken, the goal fails even with all artifacts present.

### Pattern: Component → API
Check if component actually calls the API.

### Pattern: API → Database
Check if API route queries database.

### Pattern: Form → Handler
Check if form submission does something.

### Pattern: State → Render
Check if state is actually rendered.

### Aggregate key link results

For each key link:
- Run appropriate verification function
- Record status and evidence
- WIRED / PARTIAL / STUB / NOT_WIRED
</step>

<step name="verify_requirements">
**Check requirements coverage if requirements page exists.**

For each requirement:
1. Parse requirement description
2. Identify which truths/artifacts support it
3. Determine status based on supporting infrastructure

**Requirement status:**
- ✓ SATISFIED: All supporting truths verified
- ✗ BLOCKED: One or more supporting truths failed
- ? NEEDS HUMAN: Can't verify requirement programmatically
</step>

<step name="scan_antipatterns">
**Scan for anti-patterns across phase files.**

Identify files modified in this phase from task summaries:

```javascript
// Get summary pages for tasks
modified_files = []
for (task of phase.tasks) {
  task_pages = mosic_get_entity_pages("MTask", task.name)
  summary_page = task_pages.find(p => p.title.includes("Summary"))
  if (summary_page) {
    content = mosic_get_page(summary_page.name, { content_format: "markdown" })
    files = extract_files_from_summary(content)
    modified_files.push(...files)
  }
}
```

Run anti-pattern detection on modified files.

Categorize findings:
- 🛑 Blocker: Prevents goal achievement
- ⚠️ Warning: Indicates incomplete
- ℹ️ Info: Notable but not problematic
</step>

<step name="identify_human_verification">
**Flag items that need human verification.**

Some things can't be verified programmatically:

**Always needs human:**
- Visual appearance (does it look right?)
- User flow completion (can you do the full task?)
- Real-time behavior (WebSocket, SSE updates)
- External service integration (payments, email)
- Performance feel (does it feel fast?)
- Error message clarity

**Format for human verification:**
```markdown
## Human Verification Required

### 1. {Test Name}
**Test:** {What to do}
**Expected:** {What should happen}
**Why human:** {Why can't verify programmatically}
```
</step>

<step name="determine_status">
**Calculate overall verification status.**

**Status: passed**
- All truths VERIFIED
- All artifacts pass level 1-3
- All key links WIRED
- No blocker anti-patterns

**Status: gaps_found**
- One or more truths FAILED
- OR one or more artifacts MISSING/STUB
- OR one or more key links NOT_WIRED
- OR blocker anti-patterns found

**Status: human_needed**
- All automated checks pass
- BUT items flagged for human verification

**Calculate score:**
```
score = (verified_truths / total_truths)
```
</step>

<step name="generate_fix_plans">
**If gaps_found, recommend fix plans.**

Group related gaps into fix plans:

1. **Identify gap clusters**
2. **Generate plan recommendations**
3. **Keep plans focused** (2-3 tasks per plan)
4. **Order by dependency**
</step>

<step name="create_verification_page">
**Create verification report page in Mosic.**

```javascript
verification_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE_NUM + " Verification Report",
  page_type: "Document",
  icon: "lucide:shield-check",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + PHASE_NUM + " Verification", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Status:** " + STATUS + "\n**Score:** " + score + "/" + total }
      },
      {
        type: "header",
        data: { text: "Goal Achievement", level: 2 }
      },
      // Truth verification table
      {
        type: "table",
        data: {
          content: [
            ["Truth", "Status", "Evidence"],
            ...truths.map(t => [t.description, t.status, t.evidence])
          ]
        }
      },
      {
        type: "header",
        data: { text: "Required Artifacts", level: 2 }
      },
      // Artifact verification table
      {
        type: "header",
        data: { text: "Key Link Verification", level: 2 }
      },
      // Wiring verification table
      {
        type: "header",
        data: { text: "Anti-Patterns Found", level: 2 }
      },
      // Anti-pattern scan results
      {
        type: "header",
        data: { text: "Human Verification Required", level: 2 }
      },
      // Human verification items
      // If gaps_found:
      {
        type: "header",
        data: { text: "Recommended Fix Plans", level: 2 }
      },
      // Fix plan recommendations
    ]
  },
  relation_type: "Related"
})

// Tag the verification page
mosic_batch_add_tags_to_document("M Page", verification_page.name, [
  tags.gsd_managed,
  tags.verification,
  tags["phase-" + PHASE_NUM]
])

// Store page ID
config.pages["phase-" + PHASE_NUM + "-verification"] = verification_page.name
```

</step>

<step name="update_task_list_status">
Update task list based on verification status:

```javascript
if (status === "passed") {
  mosic_update_document("MTask List", phase_task_list.name, {
    description: phase_task_list.description + "\n\n---\n\n✅ **Verification Passed**\n" +
      "Score: " + score + "/" + total + " must-haves verified"
  })

  mosic_create_document("M Comment", {
    workspace_id: workspace_id,
    reference_doctype: "MTask List",
    reference_name: phase_task_list.name,
    content: "✅ **Phase Verification Passed**\n\n" +
      "All must-haves verified. Goal achieved.\n\n" +
      "[Verification Report](page/" + verification_page.name + ")"
  })
} else if (status === "gaps_found") {
  mosic_update_document("MTask List", phase_task_list.name, {
    status: "In Review",
    description: phase_task_list.description + "\n\n---\n\n⚠️ **Gaps Found**\n" +
      "Score: " + score + "/" + total + " must-haves verified\n" +
      "Gaps: " + gaps.length + " items need fixing"
  })

  // Create gap tasks
  for (gap of gaps) {
    gap_task = mosic_create_document("MTask", {
      workspace_id: workspace_id,
      task_list: phase_task_list.name,
      title: "Gap: " + gap.truth.substring(0, 80),
      description: "**Failed Verification:**\n\n" + gap.details,
      icon: "lucide:alert-triangle",
      status: "ToDo",
      priority: gap.severity === "blocker" ? "Critical" : "High"
    })

    mosic_batch_add_tags_to_document("MTask", gap_task.name, [
      tags.gsd_managed,
      tags.fix,
      tags["phase-" + PHASE_NUM]
    ])
  }
}
```

</step>

<step name="return_to_orchestrator">
**Return results to execute-phase orchestrator.**

**Return format:**

```markdown
## Verification Complete

**Status:** {passed | gaps_found | human_needed}
**Score:** {N}/{M} must-haves verified
**Mosic Report:** https://mosic.pro/app/page/{verification_page.name}

{If passed:}
All must-haves verified. Phase goal achieved. Ready to proceed.

{If gaps_found:}
### Gaps Found

{N} critical gaps blocking goal achievement:
1. {Gap 1 summary}
2. {Gap 2 summary}

### Gap Tasks Created

{N} tasks created in Mosic for fixing gaps.

{If human_needed:}
### Human Verification Required

{N} items need human testing:
1. {Item 1}
2. {Item 2}

Automated checks passed. Awaiting human verification.
```

The orchestrator will:
- If `passed`: Continue to update roadmap
- If `gaps_found`: Route to gap closure planning
- If `human_needed`: Present items to user, collect responses
</step>

</process>

<success_criteria>
- [ ] Mosic context loaded (project, phase task list, tasks, pages)
- [ ] Must-haves established (from plan pages or derived)
- [ ] All truths verified with status and evidence
- [ ] All artifacts checked at all three levels
- [ ] All key links verified
- [ ] Requirements coverage assessed (if applicable)
- [ ] Anti-patterns scanned and categorized
- [ ] Human verification items identified
- [ ] Overall status determined
- [ ] Fix plans generated (if gaps_found)
- [ ] Verification page created in Mosic linked to phase task list
- [ ] Task list status updated based on verification result
- [ ] Gap tasks created for gaps_found status
- [ ] Results returned to orchestrator
</success_criteria>
