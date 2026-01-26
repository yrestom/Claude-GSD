---
name: gsd:help
description: Show available GSD commands and usage guide
---

<objective>
Display the complete GSD command reference.

Output ONLY the reference content below. Do NOT add:

- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<reference>
# GSD Command Reference

**GSD** (Get Shit Done) creates hierarchical project plans optimized for solo agentic development with Claude Code.

**Mosic-only Architecture:** GSD uses Mosic MCP for all project management. The only local file is `config.json` for session context and Mosic entity IDs.

## Quick Start

1. `/gsd:new-project` - Initialize project (includes research, requirements, roadmap)
2. `/gsd:plan-phase 1` - Create detailed plan for first phase
3. `/gsd:execute-phase 1` - Execute the phase

## Staying Updated

GSD evolves fast. Update periodically:

```bash
npx get-shit-done-cc@latest
```

## Core Workflow

```
/gsd:new-project → /gsd:plan-phase → /gsd:execute-phase → repeat
```

### Project Initialization

**`/gsd:new-project`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with phase breakdown and success criteria

Creates in Mosic:
- `MProject` — project with metadata
- `M Page` — overview, requirements, research docs
- `MTask List` — phases with dependencies
- `M Tag` — gsd-managed, phase tags

Creates locally:
- `config.json` — session context and Mosic entity IDs

Usage: `/gsd:new-project`

**`/gsd:map-codebase`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel Explore agents
- Creates M Pages with codebase documentation
- Covers stack, architecture, structure, conventions, testing, integrations, concerns
- Use before `/gsd:new-project` on existing codebases

Usage: `/gsd:map-codebase`

### Phase Planning

**`/gsd:discuss-phase <number>`**
Help articulate your vision for a phase before planning.

- Captures how you imagine this phase working
- Creates M Page with context, essentials, and boundaries
- Use when you have ideas about how something should look/feel

Usage: `/gsd:discuss-phase 2`

**`/gsd:research-phase <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Creates M Pages with research findings
- Use for 3D, games, audio, shaders, ML, and other specialized domains

Usage: `/gsd:research-phase 3`

**`/gsd:list-phase-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for a phase
- Lets you course-correct if Claude misunderstood your vision
- Optionally saves assumptions to Mosic for reference

Usage: `/gsd:list-phase-assumptions 3`

**`/gsd:plan-phase <number>`**
Create detailed execution plan for a specific phase.

- Creates MTasks in the phase's MTask List
- Creates M Page with execution plan
- Includes verification criteria and success measures
- Multiple plans per phase supported

Usage: `/gsd:plan-phase 1`

### Execution

**`/gsd:execute-phase <phase-number>`**
Execute all plans in a phase.

- Groups plans by wave, executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Updates MTask status as work progresses
- Creates M Page with verification results

Usage: `/gsd:execute-phase 5`

### Quick Mode

**`/gsd:quick`**
Execute small, ad-hoc tasks with GSD guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier)
- Creates MTask with "lucide:zap" icon for quick tasks
- Updates session context (not roadmap phases)

Usage: `/gsd:quick`

### Roadmap Management

**`/gsd:add-phase <description>`**
Add new phase to end of current milestone.

- Creates new MTask List in project
- Sets up dependency on previous phase
- Assigns next sequential number

Usage: `/gsd:add-phase "Add admin dashboard"`

**`/gsd:insert-phase <after> <description>`**
Insert urgent work as decimal phase between existing phases.

- Creates intermediate phase (e.g., 7.1 between 7 and 8)
- Useful for discovered work that must happen mid-milestone

Usage: `/gsd:insert-phase 7 "Fix critical auth bug"`

**`/gsd:remove-phase <number>`**
Remove a future phase and renumber subsequent phases.

- Archives MTask List with [REMOVED] prefix
- Updates dependencies to skip removed phase
- Renumbers all subsequent phases

Usage: `/gsd:remove-phase 17`

### Milestone Management

**`/gsd:new-milestone <name>`**
Start a new milestone through unified flow.

- Deep questioning to understand what you're building next
- Optional domain research
- Requirements definition with scoping
- Roadmap creation with phase breakdown

Usage: `/gsd:new-milestone "v2.0 Features"`

**`/gsd:complete-milestone <version>`**
Archive completed milestone and prepare for next version.

- Creates M Page with milestone summary and stats
- Updates project metadata
- Tags completed work

Usage: `/gsd:complete-milestone 1.0.0`

### Progress Tracking

**`/gsd:progress`**
Check project status and intelligently route to next action.

- Shows visual progress bar and completion percentage
- Summarizes recent work from MTasks
- Displays current position and what's next
- Offers to execute next plan or create it if missing

Usage: `/gsd:progress`

### Session Management

**`/gsd:resume-work`**
Resume work from previous session with full context restoration.

- Reads session context from config.json
- Loads current task and phase from Mosic
- Shows current position and recent progress

Usage: `/gsd:resume-work`

**`/gsd:pause-work`**
Create context handoff when pausing work mid-phase.

- Creates M Comment on current task with handoff context
- Updates task status to On Hold/Blocked
- Saves session state to config.json

Usage: `/gsd:pause-work`

### Debugging

**`/gsd:debug [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Creates M Page to track investigation
- Survives `/clear` — run `/gsd:debug` with no args to resume

Usage: `/gsd:debug "login button doesn't work"`

### Todo Management

**`/gsd:add-todo [description]`**
Capture idea or task as todo from current conversation.

- Creates MTask with "lucide:lightbulb" icon
- Tags with area (api, ui, auth, etc.)
- Links to project

Usage: `/gsd:add-todo Add auth token refresh`

**`/gsd:check-todos [area]`**
List pending todos and select one to work on.

- Lists MTasks with "lucide:lightbulb" icon
- Optional area filter via tags
- Routes to appropriate action

Usage: `/gsd:check-todos api`

### User Acceptance Testing

**`/gsd:verify-work [phase]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from phase MTasks
- Presents tests one at a time
- Creates M Page with verification results

Usage: `/gsd:verify-work 3`

### Milestone Auditing

**`/gsd:audit-milestone [version]`**
Audit milestone completion against original intent.

- Reads phase verification pages from Mosic
- Checks requirements coverage
- Creates M Page with audit results and gap tasks

Usage: `/gsd:audit-milestone`

**`/gsd:plan-milestone-gaps`**
Create phases to close gaps identified by audit.

- Reads audit page and groups gaps into phases
- Creates MTask Lists for gap closure
- Sets up dependencies

Usage: `/gsd:plan-milestone-gaps`

### Configuration

**`/gsd:settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, plan checker, verifier agents
- Select model profile
- Updates config.json

Usage: `/gsd:settings`

**`/gsd:set-profile <profile>`**
Quick switch model profile for GSD agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification

Usage: `/gsd:set-profile budget`

### Utility Commands

**`/gsd:help`**
Show this command reference.

**`/gsd:update`**
Update GSD to latest version with changelog preview.

Usage: `/gsd:update`

**`/gsd:join-discord`**
Join the GSD Discord community.

Usage: `/gsd:join-discord`

## Files & Structure

```
config.json               # Session context and Mosic entity IDs
```

All project data lives in Mosic:
- `MProject` — Project with metadata
- `MTask List` — Phases (roadmap structure)
- `MTask` — Tasks, todos, plans
- `M Page` — Documentation (plans, summaries, research, requirements)
- `M Tag` — Labels (gsd-managed, phase-NN, area-*, etc.)
- `M Relation` — Dependencies between entities
- `M Comment` — Progress notes, handoffs

## Workflow Modes

Set during `/gsd:new-project`:

**Interactive Mode**
- Confirms each major decision
- Pauses at checkpoints for approval
- More guidance throughout

**YOLO Mode**
- Auto-approves most decisions
- Executes plans without confirmation
- Only stops for critical checkpoints

Change anytime by editing `config.json`

## Common Workflows

**Starting a new project:**

```
/gsd:new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/gsd:plan-phase 1       # Create plans for first phase
/clear
/gsd:execute-phase 1    # Execute all plans in phase
```

**Resuming work after a break:**

```
/gsd:progress  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/gsd:insert-phase 5 "Critical security fix"
/gsd:plan-phase 5.1
/gsd:execute-phase 5.1
```

**Completing a milestone:**

```
/gsd:complete-milestone 1.0.0
/clear
/gsd:new-milestone  # Start next milestone
```

**Capturing ideas during work:**

```
/gsd:add-todo                    # Capture from conversation context
/gsd:add-todo Fix modal z-index  # Capture with explicit description
/gsd:check-todos                 # Review and work on todos
/gsd:check-todos api             # Filter by area
```

**Debugging an issue:**

```
/gsd:debug "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/gsd:debug                                    # Resume from where you left off
```

## Getting Help

- Run `/gsd:progress` to check where you're up to
- View project in Mosic: https://mosic.pro/app/MProject/[project_id]
- Check config.json for session context
</reference>
