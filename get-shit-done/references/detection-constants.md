# Detection Constants

Single source of truth for keyword lists used across agents and commands.

**Consumers:** gsd-phase-researcher, gsd-task-researcher, gsd-planner, execute-plan, discuss-phase, discuss-task

## Frontend Keywords

Keywords that indicate frontend/UI work. Match case-insensitively against phase title + description + requirements.

```
component, Vue component, UI, frontend, layout, responsive,
dark mode, CSS, Tailwind, modal, dialog, form field,
sidebar, header, dropdown, tooltip, composable,
UI design, page layout, web page, detail page,
user interface, visual, styling, theme,
screen, form, button, navbar, dashboard, React,
Vue, UX, widget
```

**Removed (too broad, match backend concepts):** "design", "page", "view", "interface", "template" -- replaced with qualified versions above (e.g., "UI design", "page layout", "user interface").

**Usage:** When any keyword matches, load `~/.claude/get-shit-done/references/frontend-design.md` and extract the section appropriate for your role:
- Researchers: `## For Researchers`
- Planners: `## For Planners`
- Executors: `## For Executors`

## TDD Keywords

Keywords that indicate TDD-eligible work (testable inputs/outputs, business logic). Match case-insensitively against phase/task title + description + requirements.

```
API, endpoint, validation, parser, transform, algorithm, state machine,
workflow engine, utility, helper, business logic, data model, schema,
converter, calculator, formatter, serializer, authentication, authorization
```

**Usage:** TDD detection follows a priority chain:
1. User decision (from context page `Testing Approach`) — highest priority
2. Config setting (`config.workflow.tdd`) — `true` forces TDD, `false` disables
3. Keyword heuristic (these keywords) — only when config is `"auto"`

## Review Tier Keywords

Keywords used by the planner and runtime tier detection to assign review depth to subtasks.

### High-Risk Patterns (→ `thorough` tier)

Match case-insensitively against subtask action text, file paths, and `git diff` output.

```
frappe.whitelist, @frappe.whitelist, whitelist, allow_guest,
has_permission, permission, workspace isolation, workspace boundary,
frappe.db.sql, raw SQL, db.sql, frappe.get_all,
ignore_permissions, is_user_member_of_workspace,
authentication, authorization, auth, login, session,
API endpoint, new endpoint, external API, external integration,
webhook, third-party, payment, stripe, oauth,
DB migration, schema migration, database migration,
security, CSRF, XSS, injection, sanitize
```

### Low-Risk Patterns (→ `skip` or `quick` tier)

```
# skip tier (no review needed)
documentation, README, CHANGELOG, docstring, comment-only,
rename, file rename, move file, config update,
.md, .yml, .yaml, .json (config only), .txt, .rst

# quick tier (Haiku scan only)
test file, test case, spec file, _test.py, .test.ts, .spec.ts,
CSS, SCSS, LESS, stylesheet, style-only,
single file, minor fix, typo fix, formatting
```

**Usage:** Two signals combine (higher risk wins):
1. **Planner hint** — assigned at planning time from subtask action/files
2. **Runtime detection** — pattern matching on `git diff` output after execution
