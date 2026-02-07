---
name: gsd:debug
description: Systematic debugging with Mosic for session tracking and documentation
argument-hint: [issue description]
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
  - ToolSearch
  - mcp__mosic_pro__*
---

<objective>
Debug issues using scientific method with subagent isolation and Mosic for persistent session tracking.

**Orchestrator role:** Gather symptoms, spawn gsd-debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.

**Why Mosic:** Debug sessions persist across context resets, issues are tracked as tasks, and debug reports become searchable documentation.
</objective>

<context>
User's issue: $ARGUMENTS

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

Load Mosic tools:
```
ToolSearch("mosic task page entity create search")
```

Resolve model profile:
```bash
MODEL_PROFILE=$(echo "$CONFIG" | jq -r '.model_profile // "balanced"')
```

**Model lookup table:**

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-debugger | opus | sonnet | sonnet |

---

## Step 1: Check for Active Debug Sessions in Mosic

```
# Search for active debug tasks (In Progress status with fix tag)
active_sessions = mosic_search_tasks({
  workspace_id: WORKSPACE_ID,
  status__in: ["In Progress", "Blocked"],
  include_tags: true
})

# Filter to debug sessions (have "fix" tag)
debug_sessions = active_sessions.filter(t =>
  t.tags && t.tags.includes(config.mosic.tags.fix) &&
  t.title.startsWith("Debug:")
)

IF debug_sessions.length > 0 AND $ARGUMENTS is empty:
  DISPLAY: "Active debug sessions found:"
  FOR each session in debug_sessions:
    # Get latest comment for status
    comments = mosic_get_document_comments("MTask", session.name, { limit: 1 })
    last_status = comments[0]?.content || "No updates"

    DISPLAY:
    """
    [{index}] {session.identifier}: {session.title}
        Status: {session.status}
        Last update: {last_status.substring(0, 100)}...
    """

  PROMPT: "Enter number to resume, or describe new issue:"

  IF user_response is number:
    # Resume existing session
    RESUME_SESSION = debug_sessions[user_response - 1]
    GOTO Step 5 (spawn continuation)
  ELSE:
    # New issue description
    $ARGUMENTS = user_response
```

---

## Step 2: Gather Symptoms (if new issue)

Use AskUserQuestion for each:

```
1. **Expected behavior** - What should happen?
   AskUserQuestion(
     header: "Debug: Expected Behavior",
     question: "What should happen when things work correctly?"
   )
   EXPECTED = response

2. **Actual behavior** - What happens instead?
   AskUserQuestion(
     header: "Debug: Actual Behavior",
     question: "What actually happens? Include any error messages."
   )
   ACTUAL = response

3. **Timeline** - When did this start?
   AskUserQuestion(
     header: "Debug: Timeline",
     question: "When did this start? Did it ever work?"
   )
   TIMELINE = response

4. **Reproduction** - How do you trigger it?
   AskUserQuestion(
     header: "Debug: Reproduction",
     question: "How do you reproduce this issue? Steps if known."
   )
   REPRODUCTION = response
```

Generate slug:
```bash
slug=$(echo "$ARGUMENTS" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
```

---

## Step 3: Create Debug Task in Mosic

```
# Find or create Debug task list
DEBUG_LIST_ID = config.mosic.task_lists["debug"]

IF DEBUG_LIST_ID is null:
  # Search for existing Debug list
  existing = mosic_search({
    workspace_id: WORKSPACE_ID,
    query: "Debug Sessions",
    doctypes: ["MTask List"]
  })

  IF existing.results.length > 0:
    DEBUG_LIST_ID = existing.results[0].name
  ELSE:
    # Create Debug task list
    debug_list = mosic_create_document("MTask List", {
      workspace_id: WORKSPACE_ID,
      project: PROJECT_ID,  # Optional - may be null
      title: "Debug Sessions",
      description: "Issues being investigated via `/gsd:debug`",
      icon: "lucide:bug",
      color: "red",
      status: "In Progress",
      prefix: "DBG"
    })
    DEBUG_LIST_ID = debug_list.name

    mosic_batch_add_tags_to_document("MTask List", DEBUG_LIST_ID, [
      config.mosic.tags.gsd_managed,
      config.mosic.tags.fix
    ])

  config.mosic.task_lists["debug"] = DEBUG_LIST_ID
  write config.json

# Create debug task
debug_task = mosic_create_document("MTask", {
  workspace_id: WORKSPACE_ID,
  task_list: DEBUG_LIST_ID,
  title: "Debug: " + slug,
  description: build_symptom_description({
    trigger: $ARGUMENTS,
    expected: EXPECTED,
    actual: ACTUAL,
    timeline: TIMELINE,
    reproduction: REPRODUCTION
  }),
  icon: "lucide:bug",
  status: "In Progress",
  priority: "High",
  start_date: ISO_TIMESTAMP
})

DEBUG_TASK_ID = debug_task.name

# Tag the task (structural tags)
task_tags = [config.mosic.tags.gsd_managed, config.mosic.tags.fix]

# Derive 1-2 topic tags from the error/issue description
# Analyze $ARGUMENTS for key topics (e.g., "login form crashes" → login, forms)
# Use lowercase, hyphenated format. Skip generic terms.
# Search-then-create pattern:
derived_tags = ["{topic_1}", ...]  # 1-2 tags from issue description
FOR each tag_title in derived_tags:
  existing = mosic_search_tags({ workspace_id: WORKSPACE_ID, query: tag_title })
  exact_match = existing.find(t => t.title == tag_title)
  IF exact_match:
    tag_id = exact_match.name
  ELSE:
    new_tag = mosic_create_document("M Tag", {
      workspace_id: WORKSPACE_ID, title: tag_title,
      color: "#14B8A6", description: "Topic: " + tag_title
    })
    tag_id = new_tag.name
  task_tags.push(tag_id)
  config.mosic.tags.topic_tags[tag_title] = tag_id

mosic_batch_add_tags_to_document("MTask", DEBUG_TASK_ID, task_tags)

DISPLAY:
"""
Debug session created: https://mosic.pro/app/MTask/{DEBUG_TASK_ID}

Issue: {$ARGUMENTS}
"""
```

---

## Step 4: Spawn gsd-debugger Agent

```
Task(
  prompt="
<objective>
Investigate issue: " + slug + "

**Summary:** " + $ARGUMENTS + "
**Debug Task ID:** " + DEBUG_TASK_ID + "
**Workspace ID:** " + WORKSPACE_ID + "
</objective>

<symptoms>
expected: " + EXPECTED + "
actual: " + ACTUAL + "
timeline: " + TIMELINE + "
reproduction: " + REPRODUCTION + "
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

<output>
Track progress via M Comment on task " + DEBUG_TASK_ID + "

On root cause found:
1. Create Debug Report page linked to task
2. Update task description with root cause
3. Return: ## ROOT CAUSE FOUND with summary

On checkpoint (need user input):
1. Add checkpoint comment to task
2. Return: ## CHECKPOINT REACHED with question

On inconclusive:
1. Add investigation summary comment
2. Return: ## INVESTIGATION INCONCLUSIVE with what was checked
</output>
",
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Debug: " + slug
)
```

---

## Step 5: Handle Agent Return

### If `## ROOT CAUSE FOUND`:

```
# Create Debug Report page
report_page = mosic_create_entity_page("MTask", DEBUG_TASK_ID, {
  workspace_id: WORKSPACE_ID,
  title: "Debug Report: " + slug,
  page_type: "Document",
  icon: "lucide:file-text",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Debug Report", level: 1 }
      },
      {
        type: "header",
        data: { text: "Issue", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: $ARGUMENTS }
      },
      {
        type: "header",
        data: { text: "Root Cause", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: root_cause_summary }
      },
      {
        type: "header",
        data: { text: "Evidence", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: evidence_details }
      }
    ]
  },
  relation_type: "Related"
})

REPORT_PAGE_ID = report_page.name

mosic_batch_add_tags_to_document("M Page", REPORT_PAGE_ID, [
  config.mosic.tags.gsd_managed,
  config.mosic.tags.fix
])

DISPLAY:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > ROOT CAUSE FOUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{root_cause_summary}

Report: https://mosic.pro/app/page/{REPORT_PAGE_ID}

───────────────────────────────────────────────────────────────

Options:
1. "fix" - Apply fix now (spawn fix agent)
2. "plan" - Create fix plan via /gsd:plan-phase
3. "done" - Manual fix, mark resolved
"""

WAIT for user response

IF response == "fix":
  # Spawn fix subagent
  Task(
    prompt="Apply fix for root cause...",
    subagent_type="gsd-executor",
    model="{executor_model}",
    description="Fix: " + slug
  )

  # Mark task complete after fix
  mosic_complete_task(DEBUG_TASK_ID)

  # IMPORTANT: Comments must use HTML format
  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MTask",
    ref_name: DEBUG_TASK_ID,
    content: "<p><strong>Resolved</strong></p><p>Fix applied via /gsd:debug</p>"
  })

ELIF response == "plan":
  DISPLAY: "Run /gsd:plan-phase to create fix plan"

ELIF response == "done":
  mosic_complete_task(DEBUG_TASK_ID)

  # IMPORTANT: Comments must use HTML format
  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MTask",
    ref_name: DEBUG_TASK_ID,
    content: "<p><strong>Resolved</strong></p><p>Manual fix applied</p>"
  })
```

### If `## CHECKPOINT REACHED`:

```
# Add checkpoint comment
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: DEBUG_TASK_ID,
  content: "<p><strong>Checkpoint:</strong> " + checkpoint_type + "</p><p>" + checkpoint_details + "</p>"
})

DISPLAY:
"""
───────────────────────────────────────────────────────────────
Debug Checkpoint: {checkpoint_type}
───────────────────────────────────────────────────────────────

{checkpoint_question}

"""

WAIT for user response

# Spawn continuation agent
Task(
  prompt="
<objective>
Continue debugging " + slug + ". Evidence is in the debug task.
</objective>

<prior_state>
Debug Task: " + DEBUG_TASK_ID + "
Workspace ID: " + WORKSPACE_ID + "
</prior_state>

<checkpoint_response>
**Type:** " + checkpoint_type + "
**Response:** " + user_response + "
</checkpoint_response>

<mode>
goal: find_and_fix
</mode>
",
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Continue debug: " + slug
)
```

### If `## INVESTIGATION INCONCLUSIVE`:

```
# Update task status
mosic_update_document("MTask", DEBUG_TASK_ID, {
  status: "Blocked"
})

# Add inconclusive comment
# IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: WORKSPACE_ID,
  ref_doc: "MTask",
  ref_name: DEBUG_TASK_ID,
  content: "<p><strong>Investigation Inconclusive</strong></p>" +
    "<p><strong>Checked:</strong></p><p>" + checked_items + "</p>" +
    "<p><strong>Eliminated:</strong></p><p>" + eliminated_items + "</p>"
})

DISPLAY:
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD > INVESTIGATION INCONCLUSIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unable to determine root cause.

**Checked:**
{checked_items}

**Eliminated:**
{eliminated_items}

Task: https://mosic.pro/app/MTask/{DEBUG_TASK_ID}

───────────────────────────────────────────────────────────────

Options:
1. "continue" - Continue investigating with more context
2. "context" - Add more information and retry
3. "done" - Close investigation
"""
```

---

## Step 6: Update config.json

```
config.mosic.tasks["debug-" + slug] = DEBUG_TASK_ID
IF REPORT_PAGE_ID:
  config.mosic.pages["debug-" + slug + "-report"] = REPORT_PAGE_ID
config.mosic.session = {
  "last_action": "debug",
  "last_task": DEBUG_TASK_ID,
  "last_updated": ISO_TIMESTAMP
}

write config.json
```

</process>

<success_criteria>
- [ ] Active debug sessions checked in Mosic
- [ ] Symptoms gathered (if new issue)
- [ ] Debug task created in Mosic with fix tag
- [ ] gsd-debugger spawned with context
- [ ] Checkpoints handled via M Comment
- [ ] Root cause confirmed before fixing
- [ ] Debug report page created on resolution
- [ ] Task marked complete when resolved
- [ ] config.json updated with task/page references
</success_criteria>
