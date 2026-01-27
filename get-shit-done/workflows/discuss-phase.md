<purpose>
Extract implementation decisions that downstream agents need. Analyze the phase to identify gray areas, let the user choose what to discuss, then deep-dive each selected area until satisfied.

You are a thinking partner, not an interviewer. The user is the visionary — you are the builder. Your job is to capture decisions that will guide research and planning, not to figure out implementation yourself.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<downstream_awareness>
**Context page feeds into:**

1. **gsd-phase-researcher** — Reads context page to know WHAT to research
   - "User wants card-based layout" → researcher investigates card component patterns
   - "Infinite scroll decided" → researcher looks into virtualization libraries

2. **gsd-planner** — Reads context page to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" → planner includes that in task specs
   - "Claude's Discretion: loading skeleton" → planner can decide approach

**Your job:** Capture decisions clearly enough that downstream agents can act on them without asking the user again.

**Not your job:** Figure out HOW to implement. That's what research and planning do with the decisions you capture.
</downstream_awareness>

<philosophy>
**User = founder/visionary. Claude = builder.**

The user knows:
- How they imagine it working
- What it should look/feel like
- What's essential vs nice-to-have
- Specific behaviors or references they have in mind

The user doesn't know (and shouldn't be asked):
- Codebase patterns (researcher reads the code)
- Technical risks (researcher identifies these)
- Implementation approach (planner figures this out)
- Success metrics (inferred from the work)

Ask about vision and implementation choices. Capture decisions for downstream agents.
</philosophy>

<scope_guardrail>
**CRITICAL: No scope creep.**

The phase boundary comes from the roadmap and is FIXED. Discussion clarifies HOW to implement what's scoped, never WHETHER to add new capabilities.

**Allowed (clarifying ambiguity):**
- "How should posts be displayed?" (layout, density, info shown)
- "What happens on empty state?" (within the feature)
- "Pull to refresh or manual?" (behavior choice)

**Not allowed (scope creep):**
- "Should we also add comments?" (new capability)
- "What about search/filtering?" (new capability)
- "Maybe include bookmarking?" (new capability)

**The heuristic:** Does this clarify how we implement what's already in the phase, or does it add a new capability that could be its own phase?

**When user suggests scope creep:**
```
"[Feature X] would be a new capability — that's its own phase.
Want me to note it for the roadmap backlog?

For now, let's focus on [phase domain]."
```

Capture the idea in a "Deferred Ideas" section. Don't lose it, don't act on it.
</scope_guardrail>

<gray_area_identification>
Gray areas are **implementation decisions the user cares about** — things that could go multiple ways and would change the result.

**How to identify gray areas:**

1. **Read the phase goal** from the task list in Mosic
2. **Understand the domain** — What kind of thing is being built?
   - Something users SEE → visual presentation, interactions, states matter
   - Something users CALL → interface contracts, responses, errors matter
   - Something users RUN → invocation, output, behavior modes matter
   - Something users READ → structure, tone, depth, flow matter
   - Something being ORGANIZED → criteria, grouping, handling exceptions matter
3. **Generate phase-specific gray areas** — Not generic categories, but concrete decisions for THIS phase

**Don't use generic category labels** (UI, UX, Behavior). Generate specific gray areas:

```
Phase: "User authentication"
→ Session handling, Error responses, Multi-device policy, Recovery flow

Phase: "Organize photo library"
→ Grouping criteria, Duplicate handling, Naming convention, Folder structure

Phase: "CLI for database backups"
→ Output format, Flag design, Progress reporting, Error recovery

Phase: "API documentation"
→ Structure/navigation, Code examples depth, Versioning approach, Interactive elements
```

**The key question:** What decisions would change the outcome that the user should weigh in on?

**Claude handles these (don't ask):**
- Technical implementation details
- Architecture patterns
- Performance optimization
- Scope (roadmap defines this)
</gray_area_identification>

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

// Load project roadmap page
project_pages = mosic_get_entity_pages("MProject", project_id)
roadmap_page = project_pages.find(p => p.title.includes("Roadmap"))
```

</step>

<step name="validate_phase">
Phase number from argument (required).

Load and validate from Mosic:

```javascript
// Find the phase task list
task_lists = project.task_lists
phase_task_list = task_lists.find(tl =>
  tl.title.includes("Phase " + PHASE) ||
  tl.identifier.startsWith(PHASE + "-")
)

if (!phase_task_list) {
  // Phase not found
  console.log("Phase " + PHASE + " not found in project.")
  console.log("Use /gsd:progress to see available phases.")
  exit()
}

// Extract phase info
phase_name = phase_task_list.title
phase_description = phase_task_list.description
phase_status = phase_task_list.status
```

**If phase not found:**
```
Phase [X] not found in roadmap.

Use /gsd:progress to see available phases.
```
Exit workflow.

**If phase found:** Continue to check_existing.
</step>

<step name="check_existing">
Check if context page already exists in Mosic:

```javascript
// Get pages linked to this phase task list
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name)
context_page = phase_pages.find(p => p.title.includes("Context"))
```

**If exists:**
Use AskUserQuestion:
- header: "Existing context"
- question: "Phase [X] already has context. What do you want to do?"
- options:
  - "Update it" — Review and revise existing context
  - "View it" — Show me what's there
  - "Skip" — Use existing context as-is

If "Update": Load existing page content, continue to analyze_phase
If "View": Display context page content, then offer update/skip
If "Skip": Exit workflow

**If doesn't exist:** Continue to analyze_phase.
</step>

<step name="analyze_phase">
Analyze the phase to identify gray areas worth discussing.

**Read the phase description from Mosic and determine:**

1. **Domain boundary** — What capability is this phase delivering? State it clearly.

2. **Gray areas by category** — For each relevant category (UI, UX, Behavior, Empty States, Content), identify 1-2 specific ambiguities that would change implementation.

3. **Skip assessment** — If no meaningful gray areas exist (pure infrastructure, clear-cut implementation), the phase may not need discussion.

**Output your analysis internally, then present to user.**

Example analysis for "Post Feed" phase:
```
Domain: Displaying posts from followed users
Gray areas:
- UI: Layout style (cards vs timeline vs grid)
- UI: Information density (full posts vs previews)
- Behavior: Loading pattern (infinite scroll vs pagination)
- Empty State: What shows when no posts exist
- Content: What metadata displays (time, author, reactions count)
```
</step>

<step name="present_gray_areas">
Present the domain boundary and gray areas to user.

**First, state the boundary:**
```
Phase [X]: [Name]
Domain: [What this phase delivers — from your analysis]

We'll clarify HOW to implement this.
(New capabilities belong in other phases.)
```

**Then use AskUserQuestion (multiSelect: true):**
- header: "Discuss"
- question: "Which areas do you want to discuss for [phase name]?"
- options: Generate 3-4 phase-specific gray areas, each formatted as:
  - "[Specific area]" (label) — concrete, not generic
  - [1-2 questions this covers] (description)

**Do NOT include a "skip" or "you decide" option.** User ran this command to discuss — give them real choices.

**Examples by domain:**

For "Post Feed" (visual feature):
```
☐ Layout style — Cards vs list vs timeline? Information density?
☐ Loading behavior — Infinite scroll or pagination? Pull to refresh?
☐ Content ordering — Chronological, algorithmic, or user choice?
☐ Post metadata — What info per post? Timestamps, reactions, author?
```

For "Database backup CLI" (command-line tool):
```
☐ Output format — JSON, table, or plain text? Verbosity levels?
☐ Flag design — Short flags, long flags, or both? Required vs optional?
☐ Progress reporting — Silent, progress bar, or verbose logging?
☐ Error recovery — Fail fast, retry, or prompt for action?
```

For "Organize photo library" (organization task):
```
☐ Grouping criteria — By date, location, faces, or events?
☐ Duplicate handling — Keep best, keep all, or prompt each time?
☐ Naming convention — Original names, dates, or descriptive?
☐ Folder structure — Flat, nested by year, or by category?
```

Continue to discuss_areas with selected areas.
</step>

<step name="discuss_areas">
For each selected area, conduct a focused discussion loop.

**Philosophy: 4 questions, then check.**

Ask 4 questions per area before offering to continue or move on. Each answer often reveals the next question.

**For each area:**

1. **Announce the area:**
   ```
   Let's talk about [Area].
   ```

2. **Ask 4 questions using AskUserQuestion:**
   - header: "[Area]"
   - question: Specific decision for this area
   - options: 2-3 concrete choices (AskUserQuestion adds "Other" automatically)
   - Include "You decide" as an option when reasonable — captures Claude discretion

3. **After 4 questions, check:**
   - header: "[Area]"
   - question: "More questions about [area], or move to next?"
   - options: "More questions" / "Next area"

   If "More questions" → ask 4 more, then check again
   If "Next area" → proceed to next selected area

4. **After all areas complete:**
   - header: "Done"
   - question: "That covers [list areas]. Ready to create context?"
   - options: "Create context" / "Revisit an area"

**Question design:**
- Options should be concrete, not abstract ("Cards" not "Option A")
- Each answer should inform the next question
- If user picks "Other", receive their input, reflect it back, confirm

**Scope creep handling:**
If user mentions something outside the phase domain:
```
"[Feature] sounds like a new capability — that belongs in its own phase.
I'll note it as a deferred idea.

Back to [current area]: [return to current question]"
```

Track deferred ideas internally.
</step>

<step name="create_context_page">
Create context page in Mosic linked to the phase task list.

```javascript
context_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE + " Context & Decisions",
  page_type: "Document",
  icon: "lucide:message-square",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + PHASE + ": " + phase_name + " - Context", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Gathered:** " + format_date(now) + "\n**Status:** Ready for planning" }
      },
      {
        type: "header",
        data: { text: "Phase Boundary", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: DOMAIN_BOUNDARY }
      },
      {
        type: "header",
        data: { text: "Implementation Decisions", level: 2 }
      },
      // Add decisions by category
      ...DECISIONS_BLOCKS,
      {
        type: "header",
        data: { text: "Claude's Discretion", level: 3 }
      },
      {
        type: "paragraph",
        data: { text: CLAUDE_DISCRETION_AREAS }
      },
      {
        type: "header",
        data: { text: "Specific Ideas", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: SPECIFIC_IDEAS || "No specific requirements — open to standard approaches" }
      },
      {
        type: "header",
        data: { text: "Deferred Ideas", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: DEFERRED_IDEAS || "None — discussion stayed within phase scope" }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the context page
mosic_batch_add_tags_to_document("M Page", context_page.name, [
  tags.gsd_managed,
  tags["phase-" + PHASE]
])

// Store page ID in config
config.pages["phase-" + PHASE + "-context"] = context_page.name
```

</step>

<step name="update_task_list">
Update the phase task list with key decisions summary:

```javascript
// Extract key decisions for summary
key_decisions = extract_key_decisions(DECISIONS)

// IMPORTANT: MTask List descriptions use HTML format
mosic_update_document("MTask List", phase_task_list.name, {
  description: phase_task_list.description + "<hr>" +
    "<p><strong>Key Decisions:</strong></p>" +
    "<ul>" + key_decisions.map(d => "<li>" + d + "</li>").join("") + "</ul>" +
    "<p><em>Full context: Phase Context &amp; Decisions page</em></p>"
})

// Add comment summarizing discussion
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  ref_doc: "MTask List",
  ref_name: phase_task_list.name,
  content: "<p><strong>Context Gathered</strong></p>" +
    "<p>Implementation decisions documented via <code>/gsd:discuss-phase</code>.</p>" +
    "<p><strong>Areas Discussed:</strong></p>" +
    "<ul>" + DISCUSSED_AREAS.map(a => "<li>" + a + "</li>").join("") + "</ul>" +
    "<p><strong>Status:</strong> Ready for planning</p>"
})
```

</step>

<step name="update_config">
Update config.json with context page reference:

```bash
# Update config.json with page ID
# Write updated config.json
```

**Confirm commit with user:**

Use AskUserQuestion:
- Question: "Commit phase context to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
docs(phase-${PHASE}): capture phase context

Phase ${PHASE}: ${PHASE_NAME}
- Implementation decisions documented in Mosic
- Phase boundary established
EOF
)"
```

</step>

<step name="confirm_creation">
Present summary and next steps:

```
Created: Phase ${PHASE} Context & Decisions page in Mosic
URL: https://mosic.pro/app/page/[context_page.name]

## Decisions Captured

### [Category]
- [Key decision]

### [Category]
- [Key decision]

[If deferred ideas exist:]
## Noted for Later
- [Deferred idea] — future phase

---

## ▶ Next Up

**Phase ${PHASE}: [Name]** — [Goal from task list]

`/gsd:plan-phase ${PHASE}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase ${PHASE} --skip-research` — plan without research
- Review context page in Mosic before continuing

---
```
</step>

</process>

<success_criteria>
- [ ] Mosic context loaded (project, task lists)
- [ ] Phase validated against project task lists
- [ ] Gray areas identified through intelligent analysis (not generic questions)
- [ ] User selected which areas to discuss
- [ ] Each selected area explored until user satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] Context page created in Mosic linked to phase task list
- [ ] Key decisions added to task list description
- [ ] Discussion comment added to task list
- [ ] config.json updated with page ID
- [ ] Deferred ideas preserved for future phases
- [ ] User knows next steps
</success_criteria>
