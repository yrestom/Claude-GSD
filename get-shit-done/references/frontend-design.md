# Frontend Design Reference

Loaded conditionally when frontend work is detected. Provides role-specific instructions for discuss, research, plan, and execute phases.

## Frontend Detection

Keywords that trigger frontend mode (case-insensitive match against phase goal, requirements, or task description):
UI, frontend, component, page, screen, layout, design, form, button, modal,
dialog, sidebar, navbar, dashboard, responsive, styling, CSS, Tailwind, React,
Vue, template, view, UX, interface, widget

# Frontend detection keywords

# Source of truth: ~/.claude/get-shit-done/references/detection-constants.md (## Frontend Keywords)

# Do not duplicate here -- refer to detection-constants.md for the canonical list

## For Researchers (gsd-phase-researcher, gsd-task-researcher)

### Design System Inventory

Before researching implementation approaches, scan the codebase for:

1. **UI Framework Detection**
   - Check package.json / requirements.txt for: React, Vue, Svelte, Angular, etc.
   - Check for meta-frameworks: Next.js, Nuxt, SvelteKit, Remix, etc.

2. **Component Library Detection**
   - Look for: shadcn/ui, Radix, MUI, Chakra, Ant Design, Headless UI, etc.
   - Check imports in existing components
   - List available components with their import paths

3. **Styling Approach**
   - Tailwind CSS, CSS Modules, styled-components, Emotion, vanilla CSS
   - Design tokens / theme configuration
   - Existing color palette, spacing scale, typography

4. **Existing UI Patterns**
   - Glob for component directories (src/components/, app/components/)
   - Identify existing page layouts, navigation, form patterns
   - Note any custom design system components

### Research Output: Add "Design System Inventory" section

```markdown
## Design System Inventory

**UI Framework:** {React 18 / Vue 3 / etc.}
**Component Library:** {shadcn/ui / none / custom}
**Styling:** {Tailwind CSS v3 / CSS Modules / etc.}
**Available Components:** {list relevant to this task}
**Existing Patterns:**

- Layout: {what layout patterns exist}
- Forms: {what form patterns exist}
- Navigation: {what nav patterns exist}
```

### Web Research for UI Patterns

Search for UI best practices specific to the feature:

- "[feature] UI best practices [year]"
- "[component library] [feature] example"
- "[framework] [feature] pattern"

Include 1-2 code examples from official docs or high-quality sources.

## For Discussers (discuss-phase, discuss-task)

When frontend work is detected, add UI-specific gray areas:

### UI-Specific Gray Areas to Consider

- **Layout approach** — how should the page/component be structured?
- **Interaction patterns** — how do users interact? (hover, click, drag, etc.)
- **State visualization** — how are loading, error, empty states shown?
- **Responsive behavior** — mobile-first? Desktop-first? Both?
- **Component reuse** — extend existing components or create new ones?

### Presenting Design Options

Present 2-3 layout alternatives using ASCII wireframes:

```
Option A: Side-by-side layout
┌──────────┬──────────────────┐
│  Sidebar │  Main Content    │
│  - Nav   │  ┌────────────┐  │
│  - Nav   │  │  Card 1    │  │
│  - Nav   │  │  Card 2    │  │
│          │  └────────────┘  │
└──────────┴──────────────────┘

Option B: Top navigation
┌──────────────────────────────┐
│  Nav  Nav  Nav  Nav          │
├──────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐  │
│  │Card │  │Card │  │Card │  │
│  └─────┘  └─────┘  └─────┘  │
└──────────────────────────────┘
```

Ask the user which direction to take before proceeding.

## For Planners (gsd-planner)

### Design Specification in Plans

When a task involves frontend work, the plan page MUST include a
`## Design Specification` section with:

1. **Component Skeleton** — simplified JSX/HTML showing structure:

```jsx
// Component: NotificationSettings
<PageLayout title="Notification Preferences">
  <Section title="Email Notifications">
    <ToggleGroup>
      <Toggle label="Weekly digest" default={true} />
      <Toggle label="Mentions" default={true} />
    </ToggleGroup>
  </Section>
  <ActionBar>
    <Button variant="primary">Save Changes</Button>
  </ActionBar>
</PageLayout>
```

2. **Aesthetic Direction** (explicit — never leave to defaults):
   - Font choices (explicit — NEVER default to Inter/Roboto)
   - Color palette references (from project's existing theme)
   - Spacing philosophy (compact/airy/balanced)
   - Animation intent (minimal/expressive/none)
   - Anti-patterns: "DO NOT use purple gradients, rounded cards with shadows"

3. **State Specifications:**
   - Loading state (skeleton/spinner/progressive)
   - Empty state (illustration/message/CTA)
   - Error state (inline/toast/page-level)
   - Success state (toast/redirect/inline)

### Anti-Convergence Rules

- NEVER let the executor choose default styling
- ALWAYS specify: font family, primary color, border radius
- Reference project's EXISTING design tokens, not generic ones
- If no design system exists: specify a bold aesthetic direction
  (brutalist, solarpunk, neo-minimalist — NOT generic modern)

## For Executors (gsd-executor)

### Implementation Rules

1. Follow the Design Specification from the plan page EXACTLY
2. Use the project's existing component library (from Design System Inventory)
3. If the plan includes a Component Skeleton, implement that structure
4. If no skeleton: ask yourself "what would the Design Specification look like?"
   before writing code — then implement that
5. Apply Aesthetic Direction explicitly — check every visual element against it
6. Handle ALL states specified (loading, empty, error, success)
7. NEVER use default styling — every visual choice must be intentional

### Self-Check Before Committing (Frontend)

- [ ] Component structure matches skeleton (if provided)
- [ ] All states handled (loading, empty, error, success)
- [ ] Aesthetic direction followed (fonts, colors, spacing)
- [ ] Existing component library used (not custom implementations)
- [ ] Responsive behavior implemented (if specified)
- [ ] No "AI slop" patterns (Inter font, purple gradients, generic shadows)
