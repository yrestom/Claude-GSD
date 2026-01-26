<purpose>
Surface Claude's assumptions about a phase before planning, enabling users to correct misconceptions early.

Key difference from discuss-phase: This is ANALYSIS of what Claude thinks, not INTAKE of what user knows. No file output - purely conversational to prompt discussion.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, roadmap page)
- Assumptions page stored in Mosic (if corrections provided)
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

// Get roadmap page for phase details
project_pages = mosic_get_entity_pages("MProject", project_id)
roadmap_page = project_pages.find(p => p.title.includes("Roadmap"))
roadmap_content = mosic_get_page(roadmap_page.name, { content_format: "markdown" })
```

</step>

<step name="validate_phase">
Phase number: $ARGUMENTS (required)

**If argument missing:**

```
Error: Phase number required.

Usage: /gsd:list-phase-assumptions [phase-number]
Example: /gsd:list-phase-assumptions 3
```

Exit workflow.

**If argument provided:**
Validate phase exists in project:

```javascript
// Find the phase task list
phase_task_list = project.task_lists.find(tl =>
  tl.title.includes("Phase " + PHASE) ||
  tl.identifier.startsWith(PHASE + "-")
)

if (!phase_task_list) {
  console.log("Error: Phase " + PHASE + " not found in project.")
  console.log("\nAvailable phases:")
  for (tl of project.task_lists) {
    console.log("- " + tl.title)
  }
  exit()
}

// Extract phase details
phase_name = phase_task_list.title
phase_description = phase_task_list.description
phase_goal = extract_goal_from_description(phase_description)
```

Continue to analyze_phase.
</step>

<step name="analyze_phase">
Based on task list description and project context, identify assumptions across five areas:

**1. Technical Approach:**
What libraries, frameworks, patterns, or tools would Claude use?
- "I'd use X library because..."
- "I'd follow Y pattern because..."
- "I'd structure this as Z because..."

**2. Implementation Order:**
What would Claude build first, second, third?
- "I'd start with X because it's foundational"
- "Then Y because it depends on X"
- "Finally Z because..."

**3. Scope Boundaries:**
What's included vs excluded in Claude's interpretation?
- "This phase includes: A, B, C"
- "This phase does NOT include: D, E, F"
- "Boundary ambiguities: G could go either way"

**4. Risk Areas:**
Where does Claude expect complexity or challenges?
- "The tricky part is X because..."
- "Potential issues: Y, Z"
- "I'd watch out for..."

**5. Dependencies:**
What does Claude assume exists or needs to be in place?
- "This assumes X from previous phases"
- "External dependencies: Y, Z"
- "This will be consumed by..."

Be honest about uncertainty. Mark assumptions with confidence levels:
- "Fairly confident: ..." (clear from description)
- "Assuming: ..." (reasonable inference)
- "Unclear: ..." (could go multiple ways)
</step>

<step name="present_assumptions">
Present assumptions in a clear, scannable format:

```
## My Assumptions for Phase ${PHASE}: ${PHASE_NAME}

### Technical Approach
[List assumptions about how to implement]

### Implementation Order
[List assumptions about sequencing]

### Scope Boundaries
**In scope:** [what's included]
**Out of scope:** [what's excluded]
**Ambiguous:** [what could go either way]

### Risk Areas
[List anticipated challenges]

### Dependencies
**From prior phases:** [what's needed]
**External:** [third-party needs]
**Feeds into:** [what future phases need from this]

---

**What do you think?**

Are these assumptions accurate? Let me know:
- What I got right
- What I got wrong
- What I'm missing
```

Wait for user response.
</step>

<step name="gather_feedback">
**If user provides corrections:**

Acknowledge the corrections:

```
Key corrections:
- [correction 1]
- [correction 2]

This changes my understanding significantly. [Summarize new understanding]
```

**If user confirms assumptions:**

```
Assumptions validated.
```

Continue to check_for_significant_corrections.
</step>

<step name="check_for_significant_corrections">
**If significant corrections were provided:**

Create assumptions page in Mosic to preserve the corrections:

```javascript
assumptions_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE + " Assumptions & Corrections",
  page_type: "Document",
  icon: "lucide:lightbulb",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Initial Assumptions", level: 2 }
      },
      // Technical approach, implementation order, scope, risks, dependencies
      ...assumptions_blocks,
      {
        type: "header",
        data: { text: "User Corrections", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: corrections
        }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the page
mosic_batch_add_tags_to_document("M Page", assumptions_page.name, [
  tags.gsd_managed,
  tags["phase-" + PHASE]
])

// Add comment to task list
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask List",
  reference_name: phase_task_list.name,
  content: "<p><strong>Assumptions Reviewed</strong></p>" +
    "<p>Key corrections:</p>" +
    "<ul>" + corrections.map(c => "<li>" + c + "</li>").join("") + "</ul>" +
    "<p><a href=\"page/" + assumptions_page.name + "\">Full assumptions</a></p>"
})

// Update config
config.pages["phase-" + PHASE + "-assumptions"] = assumptions_page.name
```

**If no significant corrections:** Skip page creation.
</step>

<step name="offer_next">
Present next steps:

```
---

## ▶ Next Up

What would you like to do?

1. **Discuss context** — `/gsd:discuss-phase ${PHASE}`
   Let me ask you questions to build comprehensive context

2. **Plan this phase** — `/gsd:plan-phase ${PHASE}`
   Create detailed execution plans

3. **Re-examine assumptions**
   I'll analyze again with your corrections

<sub>`/clear` first → fresh context window</sub>

---
```

Wait for user selection.

If "Discuss context": Note that context page will incorporate any corrections discussed here
If "Plan this phase": Proceed knowing assumptions are understood
If "Re-examine": Return to analyze_phase with updated understanding
</step>

</process>

<success_criteria>
- [ ] Mosic context loaded (project, phase task list, roadmap)
- [ ] Phase number validated against project
- [ ] Assumptions surfaced across five areas: technical approach, implementation order, scope, risks, dependencies
- [ ] Confidence levels marked where appropriate
- [ ] "What do you think?" prompt presented
- [ ] User feedback acknowledged
- [ ] If significant corrections: assumptions page created in Mosic linked to phase task list
- [ ] Clear next steps offered
</success_criteria>
