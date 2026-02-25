<purpose>
Requirement decomposition for distributed research and planning.

Groups phase/task requirements by category prefix, merges small groups, splits large ones,
and determines execution order via tier heuristics or interface-based topological sort.

**Used by:** research-phase (Step 4.5), plan-phase (Step 7.5), research-task, plan-task
**Replaces:** Inline decomposition code duplicated between research-phase and plan-phase
</purpose>

<decompose>

## Group Requirements by Prefix

**Input:** `phase_requirements[]` — array of `{ id, description }`, plus config and optional `threshold_override`

```
distributed_config = config.workflow?.distributed ?? {}
threshold = threshold_override ?? distributed_config.threshold ?? 6
min_per_group = distributed_config.min_requirements_per_group ?? 2
max_per_group = distributed_config.max_requirements_per_group ?? 5
max_groups = distributed_config.max_groups ?? 8

# Check threshold
use_distributed = phase_requirements.length >= threshold
IF NOT use_distributed: RETURN { use_distributed: false }

# Group by category prefix: AUTH-*, UI-*, CONT-*, etc.
groups_by_prefix = {}
FOR each req in phase_requirements:
  prefix = req.id.match(/^([A-Z]+)/)?.[1] or "MISC"
  groups_by_prefix[prefix] = groups_by_prefix[prefix] or []
  groups_by_prefix[prefix].push(req)

# merge_and_split_groups algorithm:
# 1. Merge groups with < min_per_group requirements into adjacent groups or MISC
# 2. Split groups with > max_per_group requirements by sub-category or alphabetically
# 3. Target: each group has min_per_group to max_per_group requirements for optimal agent focus
# 4. Cap total groups at max_groups (merge smallest groups if over cap)
requirement_groups = merge_and_split_groups(groups_by_prefix, {
  min_per_group, max_per_group, max_groups
})

# Each group: {
#   number: N,
#   title: "Authentication (AUTH)",
#   prefix: "AUTH",
#   requirement_ids: ["AUTH-01", "AUTH-02"],
#   requirements: [{ id, description }]
# }
```

**Output:** `{ use_distributed, requirement_groups[], threshold }`

</decompose>

<tier_based_ordering>

## Tier-Based Ordering (Heuristic)

When interface contracts are not available, use category-based heuristics.

```
# Tier mapping (category prefix → tier number)
tier_1_prefixes = ["API", "BACKEND", "DATA", "AUTH", "DB", "CORE", "MODEL", "INFRA"]
tier_2_prefixes = ["UI", "FRONTEND", "PAGE", "COMPONENT", "FORM", "NAV"]
tier_3_prefixes = ["INTEG", "E2E", "DEPLOY", "TEST", "PERF"]

FOR each group in requirement_groups:
  IF group.prefix in tier_1_prefixes: group.tier = 1  # foundational
  ELIF group.prefix in tier_2_prefixes: group.tier = 2  # depends on tier 1
  ELIF group.prefix in tier_3_prefixes: group.tier = 3  # depends on all
  ELSE: group.tier = 2  # safe default

# Sort: tier ascending, then group number ascending (deterministic)
dependency_order = requirement_groups.sort((a, b) =>
  a.tier - b.tier || a.number - b.number
)
```

**Output:** `dependency_order[]` — groups sorted by execution priority.

</tier_based_ordering>

<interface_based_ordering>

## Interface-Based Ordering (Topological Sort)

When interface contracts are available from distributed research, use Consumes/Exposes matching.

**Input:** `all_interfaces[]` — array of `{ group_number, title, exposes, consumes }` from researcher outputs

```
# Build dependency graph from Consumes → Exposes matching
# Groups whose Consumes is empty or "None" → foundational → go first
# Groups that consume from foundational → go second
# If circular: break tie by group number

adjacency = {}  # group_number → [depends_on_group_numbers]
FOR each iface in all_interfaces:
  adjacency[iface.group_number] = []

FOR each consumer in all_interfaces:
  IF consumer.consumes == "" or consumer.consumes == "None":
    CONTINUE
  FOR each provider in all_interfaces:
    IF provider.group_number == consumer.group_number: CONTINUE
    # Check if consumer.consumes references anything in provider.exposes
    IF any_overlap(consumer.consumes, provider.exposes):
      adjacency[consumer.group_number].push(provider.group_number)

# Topological sort with cycle detection
dependency_order = topological_sort(adjacency)
# If cycle detected: fall back to tier_based_ordering
IF cycle_detected:
  dependency_order = tier_based_ordering(requirement_groups)
```

**Output:** `dependency_order[]` — groups in topologically valid execution order.

</interface_based_ordering>

<store_decomposition>

## Store Decomposition in Config

Store decomposition results for downstream commands to reuse.

```
config.mosic.session.decomposition = {
  phase: PHASE,                    # or task identifier
  groups: requirement_groups.map(g => ({
    number: g.number,
    title: g.title,
    prefix: g.prefix,
    requirement_ids: g.requirement_ids,
    research_page_id: g.research_page_id  # set after research creates pages
  })),
  interface_contracts: all_interfaces,   # set after research completes
  dependency_order: dependency_order
}

write config.json
```

For task-level decomposition, use `config.mosic.session.task_decomposition` instead.

</store_decomposition>
