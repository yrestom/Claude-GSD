<purpose>
Shared execution review loop used by execute-task.md and execute-phase.md.

After an executor completes a subtask (or plan), this workflow spawns an independent reviewer agent to verify the work against plan requirements. If issues are found, it spawns a fix/re-execute agent and loops until the review passes or max retries are exhausted.

**This is the SINGLE source of truth for review loop logic.** Orchestrators call into this workflow — they do not duplicate review logic.
</purpose>

<usage>
Referenced by orchestrators via:
```
@~/.claude/get-shit-done/workflows/execution-review.md
```

Orchestrators call the `<review_loop>` section, passing a `review_context` object.
</usage>

<review_context_schema>
The orchestrator provides:

```javascript
review_context = {
  entity_type: "subtask" | "plan",       // What was executed
  entity_identifier: "{identifier}",      // e.g., "AUTH-5.1" or "Plan 01"
  entity_title: "{title}",               // Human-readable title
  done_criteria: "{text}",               // Done criteria from plan
  executor_result: "{structured return}", // Executor's SUBTASK COMPLETE / EXECUTION COMPLETE output
  files_modified: ["{file list}"],        // Files the executor changed
  mosic_refs: "{xml}",                   // <mosic_references> XML from orchestrator
  config: {                              // execution_review config section
    enabled: true,
    max_retries: 2,
    model: "sonnet"
  },
  model_profile: "balanced"              // For model resolution
}
```
</review_context_schema>

<review_loop>
## Review Loop

```
max_retries = review_context.config.max_retries ?? 2
reviewer_model = resolve_model("gsd-execution-reviewer", review_context.model_profile)
executor_model = resolve_model("gsd-executor", review_context.model_profile)

Model lookup:
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-execution-reviewer | opus | sonnet | haiku |
| gsd-executor | opus | sonnet | sonnet |

attempt = 1
current_executor_result = review_context.executor_result
current_files = review_context.files_modified
previous_findings = null

WHILE attempt <= max_retries + 1:  # +1 because first run is not a "retry"

  # --- SPAWN REVIEWER ---
  reviewer_prompt = build_reviewer_prompt(
    review_context,
    current_files,
    current_executor_result,
    attempt,
    previous_findings
  )

  review_result = Task(
    prompt = reviewer_prompt,
    subagent_type = "general-purpose",
    model = reviewer_model,
    description = "Review: " + review_context.entity_identifier
  )

  verdict = parse_verdict(review_result)
  # Parse verdict by looking for "### Verdict: PASS|PASS_WITH_NOTES|NEEDS_FIX|CRITICAL"

  IF verdict == "PASS":
    Display: "Review PASSED for " + review_context.entity_identifier
    RETURN { status: "pass", files: current_files, review: review_result, executor_result: current_executor_result }

  IF verdict == "PASS_WITH_NOTES":
    Display: "Review PASSED (with notes) for " + review_context.entity_identifier
    RETURN { status: "pass", files: current_files, review: review_result, executor_result: current_executor_result }

  # --- REVIEW FAILED ---
  findings = parse_findings(review_result)
  Display: "Review found issues (attempt " + attempt + "/" + (max_retries + 1) + ")"
  Display: review_result  # Show findings to user

  IF attempt > max_retries:
    # Max retries exhausted — ask user
    AskUserQuestion({
      questions: [{
        question: "Reviewer found issues after " + attempt + " attempts for " + review_context.entity_identifier + ". How to proceed?",
        header: "Review",
        options: [
          { label: "Commit anyway", description: "Accept current state, commit with known issues" },
          { label: "Skip subtask", description: "Don't commit, mark as failed, continue" },
          { label: "Stop execution", description: "Abort remaining work" }
        ],
        multiSelect: false
      }]
    })

    IF user_selection == "Commit anyway":
      RETURN { status: "pass_with_issues", files: current_files, review: review_result, executor_result: current_executor_result }
    IF user_selection == "Skip subtask":
      RETURN { status: "skipped", files: [], review: review_result }
    IF user_selection == "Stop execution":
      RETURN { status: "abort", files: [], review: review_result }

  # --- DETERMINE FIX STRATEGY ---
  has_critical = findings.some(f => f.severity == "Critical")

  IF has_critical:
    # Critical findings — full re-execution (implementation fundamentally wrong)
    Display: "CRITICAL issues found. Re-executing " + review_context.entity_identifier + " from scratch..."

    # Clean working tree before re-execution — revert only files changed by previous attempt
    FOR each file in current_files:
      Bash("git checkout -- " + file)

    reexecute_prompt = build_reexecute_prompt(review_context, findings, attempt)
    fix_result = Task(
      prompt = reexecute_prompt,
      subagent_type = "general-purpose",
      model = executor_model,
      description = "Re-execute: " + review_context.entity_identifier + " (attempt " + (attempt + 1) + ")"
    )

  ELSE:
    # Warning findings only — targeted fix (specific files, specific issues)
    Display: "Fixing " + findings.length + " issue(s) for " + review_context.entity_identifier + "..."

    fix_prompt = build_fix_prompt(review_context, findings, current_files, attempt)
    fix_result = Task(
      prompt = fix_prompt,
      subagent_type = "general-purpose",
      model = executor_model,
      description = "Fix: " + review_context.entity_identifier + " (attempt " + (attempt + 1) + ")"
    )

  # Update for next iteration
  current_executor_result = fix_result
  current_files = parse_file_list(fix_result)
  previous_findings = findings
  attempt += 1
```

### Parsing Helpers

```
FUNCTION parse_verdict(review_text):
  # Reviewer outputs "### Verdict: PASS" (heading format)
  # Also handle "**Verdict:** PASS" (bold format) for robustness
  match = review_text.match(/(?:###\s*Verdict:\s*|\*\*Verdict:\*\*\s*)(PASS_WITH_NOTES|PASS|NEEDS_FIX|CRITICAL)/i)
  RETURN match ? match[1].toUpperCase() : "NEEDS_FIX"  # Default to NEEDS_FIX if unparseable

FUNCTION parse_findings(review_text):
  # Reviewer outputs findings grouped by category under "### Findings":
  #   #### Requirements Gaps
  #   - **Severity:** Critical
  #   - **File:Line:** path/to/file.ts:42
  #   - **Issue:** Missing validation
  #   - **Fix:** Add check at line 42
  #
  # Each finding starts with "- **Severity:**" — split on that marker
  findings = []

  # Isolate the "### Findings" section (between ### Findings and next ### or end)
  findings_match = review_text.match(/### Findings\n([\s\S]*?)(?=\n### |\n## |$)/)
  IF NOT findings_match: RETURN findings
  findings_section = findings_match[1]

  # Split on "- **Severity:**" to isolate individual findings
  severity_blocks = findings_section.split("- **Severity:**")
  FOR each block in severity_blocks[1:]:  # Skip text before first finding
    severity = block.split("\n")[0].trim()  # "Critical" or "Warning"
    file_line = extract("**File:Line:**", block)
    issue = extract("**Issue:**", block)
    fix = extract("**Fix:**", block)
    IF severity AND issue:
      findings.push({ severity, file_line, issue, fix })
  RETURN findings

FUNCTION parse_file_list(executor_result):
  # Extract files from "### Files Modified" section or git status output
  files = []
  in_files_section = false
  FOR each line in executor_result.split("\n"):
    IF line.includes("### Files Modified") OR line.includes("### Files Changed"):
      in_files_section = true
      CONTINUE
    IF in_files_section:
      IF line.startsWith("###") OR line.startsWith("##"):
        BREAK  # Next section
      file = line.replace(/^[-*\s]+/, "").trim()
      IF file AND NOT file.startsWith("#"):
        files.push(file)
  RETURN files
```
</review_loop>

<build_reviewer_prompt>
## Build Reviewer Prompt

```
FUNCTION build_reviewer_prompt(context, files, executor_result, attempt, previous_findings):

  prompt = """
First, read ~/.claude/agents/gsd-execution-reviewer.md for your role.

""" + context.mosic_refs + """

<review_scope>
<subtask_identifier>""" + context.entity_identifier + """</subtask_identifier>
<subtask_title>""" + context.entity_title + """</subtask_title>
<subtask_done_criteria>
""" + context.done_criteria + """
</subtask_done_criteria>
<files_modified>
""" + files.join("\n") + """
</files_modified>
<executor_verification>
""" + extract_verification_section(executor_result) + """
</executor_verification>
<attempt_number>""" + attempt + """</attempt_number>
"""

  IF previous_findings:
    prompt += """
<previous_findings>
""" + format_findings(previous_findings) + """
</previous_findings>
"""

  prompt += """
</review_scope>

Review the changes by:
1. **Load full context from Mosic** using the <mosic_references> above:
   - Load the subtask's full MTask description: `mosic_get_task(subtask.id, { description_format: "markdown" })` — this has the detailed implementation instructions, expected patterns, gotchas, and file-level specs
   - Load the plan page: `mosic_get_page(plan_page.id, { content_format: "markdown" })` — full execution plan with architectural decisions
   - Load the task context page (if provided): `mosic_get_page(task_context_page.id, { content_format: "markdown" })` — locked decisions and constraints
   - Load the task research page (if provided): `mosic_get_page(task_research_page.id, { content_format: "markdown" })` — technical findings, field name corrections, code patterns
   - Use this loaded context to build a COMPLETE requirements checklist — not just the done criteria summary
2. Run `git diff` (or `git diff --cached` if staged) to see all changes
3. Read each modified file for full context
4. Check each requirement (from Mosic context + done criteria) against the diff
5. Look for stubs, incomplete implementations, broken wiring
6. Return your verdict using the output format from your agent file
"""

  RETURN prompt
```

### Helper: extract_verification_section
```
FUNCTION extract_verification_section(executor_result):
  # Extract the "### Verification Results" section from executor output
  match = executor_result.match(/### Verification Results\n([\s\S]*?)(?=\n###|\n##|$)/)
  RETURN match ? match[1].trim() : "No verification section found in executor output"
```

### Helper: format_findings
```
FUNCTION format_findings(findings):
  result = ""
  FOR i, finding in enumerate(findings):
    result += "Finding " + (i + 1) + ":\n"
    result += "- Severity: " + finding.severity + "\n"
    result += "- File:Line: " + finding.file_line + "\n"
    result += "- Issue: " + finding.issue + "\n"
    result += "- Fix: " + finding.fix + "\n\n"
  RETURN result
```
</build_reviewer_prompt>

<build_fix_prompt>
## Build Fix Prompt (Warning-level findings)

Targeted fix — address specific issues without re-implementing from scratch.

```
FUNCTION build_fix_prompt(context, findings, current_files, attempt):

  prompt = """
First, read ~/.claude/agents/gsd-executor.md for your role.

<objective>
FIX review findings for """ + context.entity_identifier + """: """ + context.entity_title + """
</objective>

**Execution Mode:** subtask
**Commit Mode:** deferred

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

""" + context.mosic_refs + """

<fix_instructions>
The execution reviewer found """ + findings.length + """ issue(s) that must be fixed.
This is attempt """ + (attempt + 1) + """. Do NOT re-implement from scratch — fix ONLY these specific issues.

"""

  FOR each finding in findings:
    prompt += """### """ + finding.severity + """: """ + finding.file_line + """
**Issue:** """ + finding.issue + """
**Fix:** """ + finding.fix + """

"""

  prompt += """</fix_instructions>

<files_already_modified>
""" + current_files.join("\n") + """
</files_already_modified>

After fixing all issues:
1. Run verification to confirm fixes work
2. Record modified files via `git status --short`
3. Return structured SUBTASK COMPLETE result
"""

  RETURN prompt
```
</build_fix_prompt>

<build_reexecute_prompt>
## Build Re-Execute Prompt (Critical findings)

Full re-execution with awareness of what went wrong.

```
FUNCTION build_reexecute_prompt(context, findings, attempt):

  prompt = """
First, read ~/.claude/agents/gsd-executor.md for your role.

<objective>
RE-EXECUTE """ + context.entity_identifier + """: """ + context.entity_title + """

A previous attempt had CRITICAL issues. Start fresh with awareness of what went wrong.
</objective>

**Execution Mode:** subtask
**Commit Mode:** deferred

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

""" + context.mosic_refs + """

**Subtask to Execute (ONLY THIS ONE):**
- **""" + context.entity_identifier + """**: """ + context.entity_title + """

<previous_attempt_failures>
The previous implementation had these CRITICAL issues. Do NOT repeat them:

"""

  FOR each finding in findings:
    prompt += """### """ + finding.severity + """: """ + finding.file_line + """
**Issue:** """ + finding.issue + """
**What went wrong:** """ + finding.fix + """

"""

  prompt += """</previous_attempt_failures>

IMPORTANT: This is attempt """ + (attempt + 1) + """. Implement correctly from scratch.
Do NOT just patch the previous attempt — rethink the approach if needed.
After implementing:
1. Run verification to confirm everything works
2. Record modified files via `git status --short`
3. Return structured SUBTASK COMPLETE result
"""

  RETURN prompt
```
</build_reexecute_prompt>
