<planning_config>

Configuration options for Mosic MCP integration. GSD operates Mosic-first with no local planning files.

<config_schema>
```json
{
  "workspace_id": "b0dd6682-3b21-4556-aeba-59229d454a27",
  "project_id": "081aca99-8742-4b63-94a2-e5724abfac2f",
  "space_id": null,
  "session": {
    "current_phase_id": null,
    "current_task_id": null,
    "active_plan_number": null,
    "last_sync": null
  },
  "entity_ids": {
    "task_lists": {},
    "tasks": {},
    "pages": {}
  },
  "tags": {
    "gsd_managed": null,
    "requirements": null,
    "research": null,
    "plan": null,
    "summary": null,
    "verification": null,
    "uat": null,
    "quick": null,
    "fix": null,
    "phase_tags": {},
    "topic_tags": {},
    "phase_topic_tags": {}
  },
  "page_types": {
    "overview": "Document",
    "requirements": "Spec",
    "roadmap": "Spec",
    "research": "Document",
    "plan": "Spec",
    "summary": "Document",
    "verification": "Document",
    "uat": "Document"
  },
  "page_icons": {
    "overview": "lucide:book-open",
    "requirements": "lucide:list-checks",
    "roadmap": "lucide:map",
    "research": "lucide:search",
    "plan": "lucide:file-code",
    "summary": "lucide:check-circle",
    "verification": "lucide:shield-check",
    "uat": "lucide:user-check"
  },
  "status_mapping": {
    "not_started": "Backlog",
    "planning": "ToDo",
    "in_progress": "In Progress",
    "in_review": "In Review",
    "blocked": "Blocked",
    "completed": "Completed"
  },
  "priority_mapping": {
    "wave_1": "Critical",
    "wave_2": "High",
    "wave_3": "Normal",
    "default": "Normal"
  },
  "relation_types": {
    "task_to_task": "Depends",
    "task_to_plan": "Related",
    "issue_to_task": "Blocker",
    "page_to_page": "Related",
    "phase_to_phase": "Depends"
  },
  "git": {
    "sync_on_commit": true
  }
}
```

| Option | Description |
|--------|-------------|
| `workspace_id` | Mosic workspace UUID (required) |
| `project_id` | Mosic project UUID (set after project creation) |
| `space_id` | Optional Mosic space within workspace |
| `session.current_phase_id` | MTask List ID of phase currently being worked |
| `session.current_task_id` | MTask ID of task currently being executed |
| `session.active_plan_number` | Plan number within current phase |
| `session.last_sync` | Timestamp of last successful Mosic sync |
| `entity_ids.*` | Cached Mosic entity IDs for quick lookup |
| `git.sync_on_commit` | Update Mosic tasks after git commits |
</config_schema>

<local_file_policy>

## Local File Policy

**The ONLY local file is `config.json`** which stores:
- Mosic workspace and project references
- Session state (current phase/task being worked on)
- Entity ID mappings for quick lookup
- Tag IDs for consistent tagging

**All project documentation lives in Mosic M Pages:**
- Requirements, roadmaps, research → M Pages linked to MProject
- Phase plans, summaries → M Pages linked to MTask List
- Task plans, verification reports → M Pages linked to MTask

**All state comes from Mosic:**
- Project progress → `mosic_get_project` with `include_task_lists: true`
- Phase progress → `mosic_get_task_list` with `include_tasks: true`
- Task status → `mosic_get_task` or `mosic_search_tasks`

**No local `.planning/` directory created.** This eliminates:
- Local/remote sync conflicts
- Stale state issues
- Git commit complexity for planning files
- Storage of duplicate information

</local_file_policy>

<config_location>

## Config File Location

The `config.json` file is stored in the project root:

```
project/
├── config.json          # GSD session state and Mosic references
├── src/
├── package.json
└── ...
```

**Why project root:**
- Easy to add to `.gitignore` (project-specific, not committed)
- No nested directory structure to maintain
- Single file, minimal footprint

**Gitignore recommendation:**
```
# GSD session config (Mosic references, not committed)
config.json
```

</config_location>

<state_derivation>

## State Derivation from Mosic

Instead of reading local state files, derive state from live Mosic data:

**Project State:**
```javascript
// Get project with phases
const project = await mosic_get_project(config.project_id, {
  include_task_lists: true
});

// Calculate overall progress
const phases = project.task_lists || [];
const completedPhases = phases.filter(p => p.done).length;
const progress = (completedPhases / phases.length) * 100;
```

**Phase State:**
```javascript
// Get phase with tasks
const phase = await mosic_get_task_list(config.session.current_phase_id, {
  include_tasks: true
});

// Calculate phase progress
const tasks = phase.tasks || [];
const completedTasks = tasks.filter(t => t.done).length;
const phaseProgress = (completedTasks / tasks.length) * 100;
```

**Current Work:**
```javascript
// Find in-progress tasks
const inProgress = await mosic_search_tasks({
  project_id: config.project_id,
  status: "In Progress"
});

// Get blocked tasks
const blocked = await mosic_search_tasks({
  project_id: config.project_id,
  status: "Blocked"
});
```

**Documentation:**
```javascript
// Get all pages for project
const docs = await mosic_get_entity_pages("MProject", config.project_id, {
  include_subtree: true
});

// Get specific page by tag
const requirements = await mosic_search_documents_by_tags({
  tags: ["requirements"],
  doctypes: ["M Page"],
  project_id: config.project_id
});
```

</state_derivation>

<session_management>

## Session Context Management

The `session` object in config.json tracks working context across Claude sessions:

**Starting work on a phase:**
```javascript
// Update session when starting phase work
config.session = {
  current_phase_id: phase_task_list_id,
  current_task_id: null,
  active_plan_number: 1,
  last_sync: new Date().toISOString()
};
// Write to config.json
```

**Starting work on a task:**
```javascript
// Update when picking up a task
config.session.current_task_id = task_id;
config.session.last_sync = new Date().toISOString();
// Write to config.json

// Also update Mosic task status
await mosic_update_document("MTask", task_id, {
  status: "In Progress"
});
```

**Completing a task:**
```javascript
// Clear task from session
config.session.current_task_id = null;
config.session.last_sync = new Date().toISOString();
// Write to config.json

// Update Mosic task
await mosic_complete_task(task_id);
```

**Session Recovery:**

On startup, verify session state matches Mosic:
```javascript
// Check if session task is still valid
if (config.session.current_task_id) {
  const task = await mosic_get_task(config.session.current_task_id);
  if (task.done || task.status === "Completed") {
    // Task was completed externally, clear session
    config.session.current_task_id = null;
  }
}
```

</session_management>

<entity_id_caching>

## Entity ID Caching

Cache Mosic entity IDs to avoid repeated lookups:

```javascript
// After creating a phase task list
config.entity_ids.task_lists[`phase_${phaseNumber}`] = task_list_id;

// After creating a task
config.entity_ids.tasks[`${phaseNumber}-${planNumber}`] = task_id;

// After creating a page
config.entity_ids.pages[`requirements`] = requirements_page_id;
config.entity_ids.pages[`phase_${phaseNumber}_overview`] = overview_page_id;
```

**Using cached IDs:**
```javascript
// Direct access without search
const phaseId = config.entity_ids.task_lists[`phase_${phaseNumber}`];
const task = await mosic_get_task_list(phaseId, { include_tasks: true });
```

**Cache invalidation:**
Cache is write-through (update cache when creating entities). IDs are permanent in Mosic, so cache invalidation is rarely needed unless entities are deleted.

</entity_id_caching>

<page_types>

## Page Types

Use semantic page types for different documentation:

| Content Type | Page Type | Icon | Purpose |
|--------------|-----------|------|---------|
| Overview | Document | lucide:book-open | General information |
| Requirements | Spec | lucide:list-checks | Specifications |
| Roadmap | Spec | lucide:map | Structured plans |
| Research | Document | lucide:search | Investigation results |
| Plan | Spec | lucide:file-code | Execution plans |
| Summary | Document | lucide:check-circle | Completion summaries |
| Verification | Document | lucide:shield-check | Verification reports |
| UAT | Document | lucide:user-check | User acceptance testing |

</page_types>

<relation_types>

## Relation Types

| Relation | From -> To | Purpose |
|----------|-----------|---------|
| Depends | Phase -> Phase | Phase execution order |
| Depends | Task -> Task | Task dependencies |
| Related | Task -> Page | Link task to documentation |
| Related | Page -> Page | Connect related docs |
| Blocker | Issue -> Task | Issue blocks task completion |

</relation_types>

<tag_infrastructure>

## Tag Infrastructure

Tags provide cross-cutting organization:

- `gsd-managed`: All GSD-managed entities
- `requirements`: Requirements documentation
- `research`: Research and investigation
- `plan`: Execution plans
- `summary`: Completion summaries
- `verification`: Verification results
- `uat`: User acceptance testing
- `quick`: Quick tasks outside roadmap
- `fix`: Bug fix and issue resolution
- `phase-01`, `phase-02`, etc.: Phase identification

**Tag ID Caching:**

On first use, search for existing tags and cache IDs:
```javascript
// Search existing tags first
const existingTags = await mosic_search_tags({
  workspace_id: config.workspace_id,
  query: "gsd-managed"
});

if (existingTags.length > 0) {
  config.tags.gsd_managed = existingTags[0].name;
}
```

</tag_infrastructure>

<topic_tags>

## Topic Tags

Topic tags describe *what an entity is about*, not its workflow stage. They enable cross-entity search by subject matter.

**Convention:**
- Lowercase, hyphenated: `user-auth`, `email`, `real-time`
- Minimum 3 characters
- 2-4 tags per entity
- Specific over generic: `oauth` > `authentication` > `security`
- Color: `#14B8A6` (teal) — visually distinct from structural tags

**Derivation Points:**
- **Phase research** (primary): Derived from Domain field, Standard Stack, phase title. Stored in `topic_tags` and `phase_topic_tags`.
- **Project research**: Derived from Recommended Stack table.
- **Quick/debug tasks**: Derived from task title/description.

**Propagation Rules:**
- Phase topic tags propagate to all downstream entities: plan tasks, plan pages, summary pages, verification pages.
- Downstream agents load tags from `config.mosic.tags.phase_topic_tags["phase-{N}"]` and resolve IDs from `config.mosic.tags.topic_tags`.
- No re-derivation needed — tags flow through config.

**Config Schema:**
```javascript
"topic_tags": {
  "email": "uuid-1",        // tag title → tag UUID
  "notifications": "uuid-2"
},
"phase_topic_tags": {
  "phase-01": ["email", "notifications"],  // phase → tag titles
  "phase-02": ["react", "authentication"]
}
```

**Idempotent Creation:**
```javascript
// Same pattern as structural tags: search → create if missing → cache
existing = mosic_search_tags({ workspace_id, query: tag_title })
if (exact_match):
  tag_id = existing.name
else:
  tag = mosic_create_document("M Tag", {
    workspace_id, title: tag_title,
    color: "#14B8A6",
    description: "Topic: " + tag_title
  })
  tag_id = tag.name
config.mosic.tags.topic_tags[tag_title] = tag_id
```

**Tags to Avoid (already covered by structural tags):**
- `frontend`, `backend`, `research`, `plan`, `fix`, `quick`

**Tags to Avoid (too generic):**
- `code`, `feature`, `implementation`, `system`, `module`, `update`

</topic_tags>

<initialization>

## Project Initialization

During `/gsd:new-project`:

1. **Select or create workspace** (if multiple available)
2. **Create MProject** with proper metadata
3. **Create initial pages** (requirements, roadmap) linked to project
4. **Setup tags** (idempotent - only create missing ones)
5. **Store references** in config.json

```javascript
// Create project
const project = await mosic_create_document("MProject", {
  title: project_name,
  description: project_brief,
  workspace: config.workspace_id,
  status: "Active"
});

// Store in config
config.project_id = project.name;

// Create requirements page
const reqPage = await mosic_create_entity_page("MProject", project.name, {
  title: "Requirements",
  page_type: "Spec",
  icon: "lucide:list-checks"
});

// Tag project
await mosic_add_tag_to_document("MProject", project.name, "gsd-managed");

// Cache IDs
config.entity_ids.pages.requirements = reqPage.name;
```

</initialization>

<existing_project_detection>

## Handling Existing Projects

Implement logic for BOTH scenarios:

**New Project:**
- Create MProject with proper metadata
- Create initial pages linked to project
- Set up tags and relations

**Existing Project:**
```javascript
// Detect if project already exists
const existing = await mosic_search({
  query: project_name,
  doctypes: ["MProject"],
  workspace_id: config.workspace_id
});

if (existing.length > 0) {
  // Analyze existing structure
  const project = await mosic_get_project(existing[0].name, {
    include_task_lists: true
  });

  const pages = await mosic_get_entity_pages("MProject", project.name);

  // Identify what exists
  const hasRequirements = pages.some(p => p.title === "Requirements");
  const hasRoadmap = pages.some(p => p.title === "Roadmap");

  // Only create missing elements
  if (!hasRequirements) {
    await mosic_create_entity_page("MProject", project.name, {
      title: "Requirements",
      page_type: "Spec"
    });
  }

  // Preserve existing work
  config.project_id = project.name;
}
```

</existing_project_detection>

<error_handling>

## Error Handling

Mosic API errors should be handled gracefully:

```javascript
try {
  const project = await mosic_get_project(config.project_id);
} catch (error) {
  if (error.status === 404) {
    // Project deleted or ID invalid
    console.error("Project not found in Mosic. Run /gsd:new-project to reinitialize.");
    config.project_id = null;
  } else if (error.status === 403) {
    // Permission denied
    console.error("Access denied to project. Check workspace membership.");
  } else {
    // Network or other error
    console.error("Mosic API error:", error.message);
  }
}
```

**Retry logic:**
For transient errors, implement exponential backoff:
```javascript
const maxRetries = 3;
for (let i = 0; i < maxRetries; i++) {
  try {
    return await mosic_operation();
  } catch (error) {
    if (i === maxRetries - 1) throw error;
    await sleep(Math.pow(2, i) * 1000); // 1s, 2s, 4s
  }
}
```

</error_handling>

<sync_points>

## Sync Points

GSD operations sync with Mosic at these points:

| Command | Mosic Operations |
|---------|------------------|
| `new-project` | Create project, pages, tags |
| `add-phase` | Create task list, overview page |
| `plan-phase` | Create tasks, plan pages, checklists, dependencies |
| `execute-phase` | Update task status, create summary pages |
| `verify-work` | Create verification page, issue tasks for failures |
| `complete-milestone` | Update project status, create milestone summary |
| `quick` | Create quick task with summary page |
| `progress` | Read-only - derive from Mosic state |

</sync_points>

</planning_config>
