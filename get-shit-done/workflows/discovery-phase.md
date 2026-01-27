<purpose>
Execute discovery at the appropriate depth level.
Produces research page in Mosic that informs planning.

Called from plan-phase.md's mandatory_discovery step with a depth parameter.

NOTE: For comprehensive ecosystem research ("how do experts build this"), use /gsd:research-phase instead, which produces a more detailed research page.
</purpose>

<mosic_only>
**CRITICAL: This workflow operates ONLY through Mosic MCP.**

- All state is read from Mosic (project, task lists, pages)
- All documentation is stored in Mosic pages
- Only `config.json` is stored locally (for Mosic entity IDs)
- No `.planning/` directory operations
</mosic_only>

<depth_levels>
**This workflow supports three depth levels:**

| Level | Name         | Time      | Output                                       | When                                      |
| ----- | ------------ | --------- | -------------------------------------------- | ----------------------------------------- |
| 1     | Quick Verify | 2-5 min   | No page, proceed with verified knowledge     | Single library, confirming current syntax |
| 2     | Standard     | 15-30 min | Discovery page in Mosic                      | Choosing between options, new integration |
| 3     | Deep Dive    | 1+ hour   | Detailed discovery page with validation gates | Architectural decisions, novel problems   |

**Depth is determined by plan-phase.md before routing here.**
</depth_levels>

<source_hierarchy>
**MANDATORY: Context7 BEFORE WebSearch**

Claude's training data is 6-18 months stale. Always verify.

1. **Context7 MCP FIRST** - Current docs, no hallucination
2. **Official docs** - When Context7 lacks coverage
3. **WebSearch LAST** - For comparisons and trends only

See ~/.claude/get-shit-done/templates/discovery.md `<discovery_protocol>` for full protocol.
</source_hierarchy>

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

// Get phase pages
phase_pages = mosic_get_entity_pages("MTask List", phase_task_list.name)
```

</step>

<step name="determine_depth">
Check the depth parameter passed from plan-phase.md:
- `depth=verify` → Level 1 (Quick Verification)
- `depth=standard` → Level 2 (Standard Discovery)
- `depth=deep` → Level 3 (Deep Dive)

Route to appropriate level workflow below.
</step>

<step name="level_1_quick_verify">
**Level 1: Quick Verification (2-5 minutes)**

For: Single known library, confirming syntax/version still correct.

**Process:**

1. Resolve library in Context7:

   ```
   mcp__context7__resolve-library-id with libraryName: "[library]"
   ```

2. Fetch relevant docs:

   ```
   mcp__context7__get-library-docs with:
   - context7CompatibleLibraryID: [from step 1]
   - topic: [specific concern]
   ```

3. Verify:

   - Current version matches expectations
   - API syntax unchanged
   - No breaking changes in recent versions

4. **If verified:** Return to plan-phase.md with confirmation. No discovery page needed.

5. **If concerns found:** Escalate to Level 2.

**Output:** Verbal confirmation to proceed, or escalation to Level 2.
</step>

<step name="level_2_standard">
**Level 2: Standard Discovery (15-30 minutes)**

For: Choosing between options, new external integration.

**Process:**

1. **Identify what to discover:**

   - What options exist?
   - What are the key comparison criteria?
   - What's our specific use case?

2. **Context7 for each option:**

   ```
   For each library/framework:
   - mcp__context7__resolve-library-id
   - mcp__context7__get-library-docs (mode: "code" for API, "info" for concepts)
   ```

3. **Official docs** for anything Context7 lacks.

4. **WebSearch** for comparisons:

   - "[option A] vs [option B] {current_year}"
   - "[option] known issues"
   - "[option] with [our stack]"

5. **Cross-verify:** Any WebSearch finding → confirm with Context7/official docs.

6. **Create discovery page in Mosic** (see create_discovery_page step):

   - Summary with recommendation
   - Key findings per option
   - Code examples from Context7
   - Confidence level (should be MEDIUM-HIGH for Level 2)

7. Return to plan-phase.md.

**Output:** Discovery page created in Mosic linked to phase task list
</step>

<step name="level_3_deep_dive">
**Level 3: Deep Dive (1+ hour)**

For: Architectural decisions, novel problems, high-risk choices.

**Process:**

1. **Scope the discovery:**

   - Define clear scope
   - Define include/exclude boundaries
   - List specific questions to answer

2. **Exhaustive Context7 research:**

   - All relevant libraries
   - Related patterns and concepts
   - Multiple topics per library if needed

3. **Official documentation deep read:**

   - Architecture guides
   - Best practices sections
   - Migration/upgrade guides
   - Known limitations

4. **WebSearch for ecosystem context:**

   - How others solved similar problems
   - Production experiences
   - Gotchas and anti-patterns
   - Recent changes/announcements

5. **Cross-verify ALL findings:**

   - Every WebSearch claim → verify with authoritative source
   - Mark what's verified vs assumed
   - Flag contradictions

6. **Create comprehensive discovery page in Mosic:**

   - Full structure with quality report
   - Source attribution
   - Confidence by finding
   - If LOW confidence on any critical finding → add validation checkpoints

7. **Confidence gate:** If overall confidence is LOW, present options before proceeding.

8. Return to plan-phase.md.

**Output:** Comprehensive discovery page in Mosic linked to phase task list
</step>

<step name="identify_unknowns">
**For Level 2-3:** Define what we need to learn.

Ask: What do we need to learn before we can plan this phase?

- Technology choices?
- Best practices?
- API patterns?
- Architecture approach?
</step>

<step name="create_discovery_page">
**Create discovery page in Mosic linked to phase task list:**

```javascript
discovery_page = mosic_create_entity_page("MTask List", phase_task_list.name, {
  workspace_id: workspace_id,
  title: "Phase " + PHASE_NUM + " Discovery",
  page_type: "Document",
  icon: "lucide:search",
  status: "Published",
  content: {
    blocks: [
      {
        type: "header",
        data: { text: "Phase " + PHASE_NUM + " Discovery", level: 1 }
      },
      {
        type: "paragraph",
        data: { text: "**Level:** " + DEPTH_LEVEL + "\n**Confidence:** " + CONFIDENCE }
      },
      {
        type: "header",
        data: { text: "Summary", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: RECOMMENDATION_SUMMARY }
      },
      {
        type: "header",
        data: { text: "Key Findings", level: 2 }
      },
      // Per-option/topic findings
      ...findings_blocks,
      {
        type: "header",
        data: { text: "Code Examples", level: 2 }
      },
      // Code examples from Context7
      ...code_example_blocks,
      {
        type: "header",
        data: { text: "Sources", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: SOURCES
        }
      },
      {
        type: "header",
        data: { text: "Open Questions", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: OPEN_QUESTIONS || "None - all questions resolved" }
      }
    ]
  },
  relation_type: "Related"
})

// Tag the discovery page
mosic_batch_add_tags_to_document("M Page", discovery_page.name, [
  tags.gsd_managed,
  tags.research,
  tags["phase-" + PHASE_NUM]
])

// Store page ID in config
config.pages["phase-" + PHASE_NUM + "-discovery"] = discovery_page.name
```

</step>

<step name="update_task_list">
**Update task list with discovery summary:**

```javascript
// IMPORTANT: MTask List descriptions use HTML format
mosic_update_document("MTask List", phase_task_list.name, {
  description: phase_task_list.description + "<hr>" +
    "<p><strong>Discovery Summary:</strong></p>" +
    "<p>Confidence: " + CONFIDENCE_LEVEL + "</p>" +
    "<p>Recommendation: " + RECOMMENDATION + "</p>"
})

// Add discovery comment
// IMPORTANT: Comments must use HTML format
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  ref_doc: "MTask List",
  ref_name: phase_task_list.name,
  content: "<p><strong>Discovery Complete</strong></p>" +
    "<p>Depth: Level " + LEVEL + "</p>" +
    "<p>Confidence: " + CONFIDENCE_LEVEL + "</p>" +
    "<p><a href=\"page/" + discovery_page.name + "\">Full Discovery</a></p>"
})
```

</step>

<step name="confidence_gate">
After creating discovery page, check confidence level.

If confidence is LOW:
Use AskUserQuestion:

- header: "Low Confidence"
- question: "Discovery confidence is LOW: [reason]. How would you like to proceed?"
- options:
  - "Dig deeper" - Do more research before planning
  - "Proceed anyway" - Accept uncertainty, plan with caveats
  - "Pause" - I need to think about this

If confidence is MEDIUM:
Inline: "Discovery complete (medium confidence). [brief reason]. Proceed to planning?"

If confidence is HIGH:
Proceed directly, just note: "Discovery complete (high confidence)."
</step>

<step name="open_questions_gate">
If discovery has open_questions:

Present them inline:
"Open questions from discovery:

- [Question 1]
- [Question 2]

These may affect implementation. Acknowledge and proceed? (yes / address first)"

If "address first": Gather user input on questions, update discovery page.
</step>

<step name="update_config">
**Update config.json with discovery page ID:**

**Confirm commit with user:**

Use AskUserQuestion:
- Question: "Commit discovery results to git?"
- Options: "Yes, commit" / "No, skip commit"

**If user approves:**
```bash
git add config.json
git commit -m "$(cat <<'EOF'
docs(phase-${PHASE_NUM}): complete discovery

Confidence: ${CONFIDENCE_LEVEL}
Recommendation: ${RECOMMENDATION_SHORT}
EOF
)"
```

</step>

<step name="offer_next">
```
Discovery complete: Phase ${PHASE_NUM} Discovery page in Mosic
URL: https://mosic.pro/app/page/[discovery_page.name]
Recommendation: [one-liner]
Confidence: [level]

---

## ▶ Next Up

**Phase ${PHASE_NUM}: [Name]** — ready for planning

`/gsd:plan-phase ${PHASE_NUM}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:discuss-phase ${PHASE_NUM}` — gather implementation decisions
- Review discovery page in Mosic before planning
- Refine discovery (dig deeper)

---
```

</step>

</process>

<success_criteria>
**Level 1 (Quick Verify):**
- Context7 consulted for library/topic
- Current state verified or concerns escalated
- Verbal confirmation to proceed (no pages)

**Level 2 (Standard):**
- Context7 consulted for all options
- WebSearch findings cross-verified
- Discovery page created in Mosic linked to phase task list
- Task list updated with discovery summary
- Discovery comment added to task list
- Confidence level MEDIUM or higher
- config.json updated with page ID
- Ready to inform planning

**Level 3 (Deep Dive):**
- Discovery scope defined
- Context7 exhaustively consulted
- All WebSearch findings verified against authoritative sources
- Comprehensive discovery page created in Mosic
- Quality report with source attribution
- If LOW confidence findings → validation checkpoints defined
- Confidence gate passed
- config.json updated with page ID
- Ready to inform planning
</success_criteria>
