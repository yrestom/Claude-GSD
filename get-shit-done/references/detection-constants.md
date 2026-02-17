# Detection Constants

Single source of truth for keyword lists used across agents and commands.

**Consumers:** gsd-phase-researcher, gsd-task-researcher, gsd-planner, execute-plan, discuss-phase, discuss-task

## Frontend Keywords

Keywords that indicate frontend/UI work. Match case-insensitively against phase title + description + requirements.

```
UI, frontend, component, page, screen, layout, design, form, button, modal,
dialog, sidebar, navbar, dashboard, responsive, styling, CSS, Tailwind, React,
Vue, template, view, UX, interface, widget
```

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
