<purpose>
Orchestrate parallel debug agents to investigate UAT gaps and find root causes.

After UAT finds gaps, spawn one debug agent per gap. Each agent investigates autonomously with symptoms pre-filled from UAT. Collect root causes, update UAT.md gaps with diagnosis, then hand off to plan-phase --gaps with actual diagnoses.

Orchestrator stays lean: parse gaps, spawn agents, collect results, update UAT.
</purpose>

<paths>
DEBUG_DIR=.planning/debug

Debug files use the `.planning/debug/` path (hidden directory with leading dot).
</paths>

<core_principle>
**Diagnose before planning fixes.**

UAT tells us WHAT is broken (symptoms). Debug agents find WHY (root cause). plan-phase --gaps then creates targeted fixes based on actual causes, not guesses.

Without diagnosis: "Comment doesn't refresh" → guess at fix → maybe wrong
With diagnosis: "Comment doesn't refresh" → "useEffect missing dependency" → precise fix
</core_principle>

<process>

<step name="parse_gaps">
**Extract gaps from UAT.md:**

Read the "Gaps" section (YAML format):
```yaml
- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  artifacts: []
  missing: []
```

For each gap, also read the corresponding test from "Tests" section to get full context.

Build gap list:
```
gaps = [
  {truth: "Comment appears immediately...", severity: "major", test_num: 2, reason: "..."},
  {truth: "Reply button positioned correctly...", severity: "minor", test_num: 5, reason: "..."},
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
1. Create DEBUG-{slug}.md with symptoms pre-filled
2. Investigate autonomously (read code, form hypotheses, test)
3. Return root cause

This runs in parallel - all gaps investigated simultaneously.
```
</step>

<step name="spawn_agents">
**Spawn debug agents in parallel:**

For each gap, fill the debug-subagent-prompt template and spawn:

```
Task(
  prompt=filled_debug_subagent_prompt,
  subagent_type="general-purpose",
  description="Debug: {truth_short}"
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

**Debug Session:** ${DEBUG_DIR}/{slug}.md

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
- debug_path: Path to debug session file
- suggested_fix: Hint for gap closure plan

If agent returns `## INVESTIGATION INCONCLUSIVE`:
- root_cause: "Investigation inconclusive - manual review needed"
- Note which issue needs manual attention
- Include remaining possibilities from agent return
</step>

<step name="update_uat">
**Update UAT.md gaps with diagnosis:**

For each gap in the Gaps section, add artifacts and missing fields:

```yaml
- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
    - "Trigger re-render when new comment added"
  debug_session: .planning/debug/comment-not-refreshing.md
```

Update status in frontmatter to "diagnosed".

**Check planning config:**

```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```

**If `COMMIT_PLANNING_DOCS=false`:** Skip git operations

**If `COMMIT_PLANNING_DOCS=true` (default):**

Commit the updated UAT.md:
```bash
git add ".planning/phases/XX-name/{phase}-UAT.md"
git commit -m "docs({phase}): add root causes from diagnosis"
```
</step>

<step name="sync_diagnosis_to_mosic">
**Sync diagnosis results to Mosic (Deep Integration):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

### Step 1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
FIX_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.fix")
PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PHASE_NUM}\"]")
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PHASE_NUM}\"]")
UAT_PAGE_ID=$(cat .planning/config.json | jq -r ".mosic.pages[\"phase-${PHASE_NUM}-uat\"]")
```

### Step 2: Create Debug Session Pages

```
FOR each diagnosed_gap:
  # Create debug session page linked to UAT page
  debug_page = mosic_create_entity_page("M Page", uat_page_id, {
    workspace_id: workspace_id,
    title: "Debug: " + gap.truth.substring(0, 50),
    page_type: "Document",
    icon: "lucide:bug",
    status: "Published",
    content: convert_debug_to_editorjs(DEBUG-slug.md),
    relation_type: "Related"
  })

  # Tag the debug page
  mosic_batch_add_tags_to_document("M Page", debug_page.name, [
    GSD_MANAGED_TAG,
    FIX_TAG,
    PHASE_TAG
  ])
```

### Step 3: Update Issue Tasks with Root Causes

```
FOR each diagnosed_gap:
  issue_task_id = mosic.tasks["phase-" + PHASE_NUM + "-fix-" + gap.test]

  IF issue_task_id:
    # Update task with root cause
    mosic_update_document("MTask", issue_task_id, {
      status: "ToDo",  # Unblock now that we have diagnosis
      description: original_description + "\n\n---\n\n**Root Cause:**\n" +
        gap.root_cause + "\n\n" +
        "**Files Involved:**\n" +
        gap.files.map(f => "- `" + f.path + "`: " + f.issue).join("\n") +
        "\n\n**Suggested Fix:**\n" + gap.suggested_fix
    })

    # Add diagnosis comment
    mosic_create_document("M Comment", {
      workspace_id: workspace_id,
      ref_doc: "MTask",
      ref_name: issue_task_id,
      content: "🔍 **Root Cause Diagnosed**\n\n" +
        gap.root_cause + "\n\n" +
        "[Debug Session](page/" + debug_page.name + ")"
    })

    # Link debug page to issue task
    mosic_create_document("M Relation", {
      workspace_id: workspace_id,
      source_doctype: "M Page",
      source_name: debug_page.name,
      target_doctype: "MTask",
      target_name: issue_task_id,
      relation_type: "Related"
    })
```

### Step 4: Update UAT Page Status

```
mosic_update_document("M Page", uat_page_id, {
  content: updated_content_with_root_causes
})

mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  ref_doc: "M Page",
  ref_name: uat_page_id,
  content: "🔍 **Diagnosis Complete**\n\n" +
    diagnosed_count + " gaps diagnosed.\n" +
    inconclusive_count + " gaps need manual review.\n\n" +
    "Ready for fix planning."
})
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning, continue
  - Add to pending_sync
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

Debug sessions: ${DEBUG_DIR}/
[IF mosic.enabled:] Mosic: Synced to UAT page [END IF]

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
- Check DEBUG-{slug}.md for partial progress
- Can resume with /gsd:debug

**All agents fail:**
- Something systemic (permissions, git, etc.)
- Report for manual investigation
- Fall back to plan-phase --gaps without root causes (less precise)
</failure_handling>

<success_criteria>
- [ ] Gaps parsed from UAT.md
- [ ] Debug agents spawned in parallel
- [ ] Root causes collected from all agents
- [ ] UAT.md gaps updated with artifacts and missing
- [ ] Debug sessions saved to ${DEBUG_DIR}/
- [ ] Mosic sync (if enabled):
  - [ ] Debug session pages created linked to UAT page
  - [ ] Issue tasks updated with root causes
  - [ ] UAT page updated with diagnosis status
- [ ] Hand off to verify-work for automatic planning
</success_criteria>
