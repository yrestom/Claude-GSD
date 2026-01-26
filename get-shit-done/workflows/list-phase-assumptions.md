<purpose>
Surface Claude's assumptions about a phase before planning, enabling users to correct misconceptions early.

Key difference from discuss-phase: This is ANALYSIS of what Claude thinks, not INTAKE of what user knows. No file output - purely conversational to prompt discussion.
</purpose>

<process>

<step name="validate_phase" priority="first">
Phase number: $ARGUMENTS (required)

**If argument missing:**

```
Error: Phase number required.

Usage: /gsd:list-phase-assumptions [phase-number]
Example: /gsd:list-phase-assumptions 3
```

Exit workflow.

**If argument provided:**
Validate phase exists in roadmap:

```bash
cat .planning/ROADMAP.md | grep -i "Phase ${PHASE}"
```

**If phase not found:**

```
Error: Phase ${PHASE} not found in roadmap.

Available phases:
[list phases from roadmap]
```

Exit workflow.

**If phase found:**
Parse phase details from roadmap:

- Phase number
- Phase name
- Phase description/goal
- Any scope details mentioned

Continue to analyze_phase.
</step>

<step name="analyze_phase">
Based on roadmap description and project context, identify assumptions across five areas:

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
- "Fairly confident: ..." (clear from roadmap)
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

Continue to offer_next.
</step>

<step name="offer_next">
Present next steps:

```
What's next?
1. Discuss context (/gsd:discuss-phase ${PHASE}) - Let me ask you questions to build comprehensive context
2. Plan this phase (/gsd:plan-phase ${PHASE}) - Create detailed execution plans
3. Re-examine assumptions - I'll analyze again with your corrections
4. Done for now
```

Wait for user selection.

If "Discuss context": Note that CONTEXT.md will incorporate any corrections discussed here
If "Plan this phase": Proceed knowing assumptions are understood
If "Re-examine": Return to analyze_phase with updated understanding
</step>

</process>

<step name="sync_assumptions_to_mosic">
**Sync assumptions to Mosic (optional, if significant corrections made):**

Check Mosic status:
```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true AND user provided significant corrections:**

Display:
```
◆ Syncing assumptions to Mosic...
```

### Step 1: Load Mosic Config

```bash
WORKSPACE_ID=$(cat .planning/config.json | jq -r ".mosic.workspace_id")
GSD_MANAGED_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.gsd_managed")
PHASE_TAG=$(cat .planning/config.json | jq -r ".mosic.tags.phase_tags[\"phase-${PADDED_PHASE}\"]")
TASK_LIST_ID=$(cat .planning/config.json | jq -r ".mosic.task_lists[\"phase-${PADDED_PHASE}\"]")
```

### Step 2: Create Assumptions Page (if corrections provided)

```
assumptions_page = mosic_create_entity_page("MTask List", task_list_id, {
  workspace_id: workspace_id,
  title: "Phase " + PADDED_PHASE + " Assumptions & Corrections",
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
      {
        type: "header",
        data: { text: "User Corrections", level: 2 }
      },
      // Corrections provided by user
    ]
  },
  relation_type: "Related"
})

# Tag the page
mosic_batch_add_tags_to_document("M Page", assumptions_page.name, [
  GSD_MANAGED_TAG,
  PHASE_TAG
])
```

### Step 3: Add Comment to Task List

```
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  ref_doc: "MTask List",
  ref_name: task_list_id,
  content: "💡 **Assumptions Reviewed**\n\n" +
    "Key corrections:\n" +
    corrections.map(c => "- " + c).join("\n") +
    "\n\n[Full assumptions](page/" + assumptions_page.name + ")"
})
```

Display:
```
✓ Assumptions synced to Mosic
  Page: https://mosic.pro/app/page/[assumptions_page.name]
```

**If mosic.enabled = false OR no corrections:** Skip Mosic sync.
</step>

<success_criteria>
- Phase number validated against roadmap
- Assumptions surfaced across five areas: technical approach, implementation order, scope, risks, dependencies
- Confidence levels marked where appropriate
- "What do you think?" prompt presented
- User feedback acknowledged
- Mosic sync (if enabled and corrections provided):
  - [ ] Assumptions page created linked to phase task list
  - [ ] Comment added with key corrections
- Clear next steps offered
</success_criteria>
