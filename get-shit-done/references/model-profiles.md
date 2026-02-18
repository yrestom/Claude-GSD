# Model Profiles

Model profiles control which Claude model each GSD agent uses. This allows balancing quality vs token spend.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| gsd-planner | opus | opus | sonnet |
| gsd-roadmapper | opus | sonnet | sonnet |
| gsd-executor | opus | sonnet | sonnet |
| gsd-phase-researcher | opus | sonnet | haiku |
| gsd-project-researcher | opus | sonnet | haiku |
| gsd-research-synthesizer | sonnet | sonnet | haiku |
| gsd-debugger | opus | sonnet | sonnet |
| gsd-codebase-mapper | sonnet | haiku | haiku |
| gsd-verifier | sonnet | sonnet | haiku |
| gsd-execution-reviewer | opus | sonnet | haiku |
| gsd-plan-checker | sonnet | sonnet | haiku |
| gsd-integration-checker | sonnet | sonnet | haiku |

## Profile Philosophy

**quality** - Maximum reasoning power
- Opus for all decision-making agents
- Sonnet for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation
- Opus only for planning (where architecture decisions happen)
- Sonnet for execution and research (follows explicit instructions)
- Sonnet for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal Opus usage
- Sonnet for anything that writes code
- Haiku for research and verification
- Use when: conserving quota, high-volume work, less critical phases

## Resolution Logic

Orchestrators resolve model before spawning:

```
1. Read config.json
2. Check config.model_overrides[agent_name] → if present, use it directly (skip steps 3-4)
3. Get model_profile (default: "balanced")
4. Look up agent in profile table above
5. Pass model parameter to Task call
```

**Override takes precedence over profile.** This allows pinning a specific agent to a model regardless of which profile is active.

## Switching Profiles

Runtime: `/gsd:set-profile <profile>`

Per-project default: Set in `config.json`:
```json
{
  "model_profile": "balanced"
}
```

## Per-Agent Model Override

To force a specific model for any agent, set `model_overrides` in `config.json`:
```json
{
  "model_overrides": {
    "gsd-executor": "sonnet",
    "gsd-execution-reviewer": "sonnet"
  }
}
```

When set, the override is used regardless of the active `model_profile`. Only agents listed in `model_overrides` are affected — all others still use profile-based resolution.

## Adaptive Review Models

When adaptive review is enabled (`config.workflow.execution_review.adaptive.enabled: true`), the execution reviewer uses its own model resolution that bypasses the profile table above:

- **Quick scan phase:** Uses the tier's `scan_model` (or `model` for quick tier), typically Haiku
- **Deep review phase:** Uses the tier's `deep_model` (standard/thorough) or `model` (quick tier), typically Sonnet
- **Escalation on retry:** Uses `adaptive.escalation.retry_model` (typically Opus) after the configured attempt threshold

`model_overrides` still takes highest precedence — if set, it overrides tier-specific models, escalation, and profile lookup. Tier-specific models (defined in `config.workflow.execution_review.adaptive.tiers`) are smart defaults that apply when no override is set. Escalation models (`adaptive.escalation`) are a safety net for late retries, also below `model_overrides` in priority.

See `execution-review.md` workflow for full resolution logic.

## Design Rationale

**Why Opus for gsd-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for gsd-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the phase promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for gsd-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

## Mosic MCP Considerations

### Token Cost for Mosic Operations

Mosic MCP calls add token overhead. Factor this into profile selection:

| Operation | Typical Tokens | Impact |
|-----------|----------------|--------|
| `mosic_get_project` | 200-500 | Low |
| `mosic_get_task_list` (with tasks) | 500-2000 | Medium |
| `mosic_get_entity_pages` | 300-1500 | Medium |
| `mosic_search_tasks` | 200-1000 | Low-Medium |
| `mosic_create_document` | 100-300 | Low |
| `mosic_update_content_blocks` | 200-800 | Medium |

### Profile Adjustments for Mosic-Heavy Workflows

When workflows involve significant Mosic state management:

**quality profile:**
- Mosic context loading is acceptable overhead
- Full project state available for decisions

**balanced profile:**
- Load Mosic context selectively
- Cache entity IDs across agent calls
- Prefer `include_tasks: false` when task details not needed

**budget profile:**
- Minimize Mosic calls
- Use local state files as primary source
- Sync to Mosic only at major milestones

### Agent-Specific Mosic Usage

| Agent | Mosic Usage | Notes |
|-------|-------------|-------|
| gsd-planner | High | Needs full context for task decomposition |
| gsd-executor | Low | Uses local PLAN.md, syncs on completion |
| gsd-verifier | Medium | Checks against Mosic requirements |
| gsd-progress | High | Derives state from Mosic |
| gsd-roadmapper | Medium | Creates/updates task lists |

### Cost Optimization

For budget-conscious workflows:

1. **Batch reads:** Use `mosic_get_project` with `include_task_lists: true` instead of multiple calls
2. **Cache IDs:** Store entity IDs in `config.json` to avoid lookups
3. **Lazy sync:** Update Mosic only on phase completion, not per-task
4. **Local-first:** Use local markdown files during execution, sync at checkpoints
