# User Setup Page Content Pattern

Content structure for documenting external service configuration requirements in Mosic.

**Created via:** `mosic_create_entity_page("MTask", task_id, { title: "User Setup: [Service]", icon: "lucide:settings" })`
**Page Type:** Document
**Icon:** lucide:settings
**Tags:** ["gsd-managed", "user-setup", "phase-XX"]

**Purpose:** Document setup tasks that literally require human action - account creation, dashboard configuration, secret retrieval. Claude automates everything possible; this captures only what remains.

---

## Content Structure

```markdown
# Phase [X]: User Setup Required

**Generated:** [YYYY-MM-DD]
**Phase:** [phase-name]
**Status:** Incomplete | Complete

Complete these items for the integration to function. Claude automated everything possible; these items require human access to external dashboards/accounts.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `ENV_VAR_NAME` | [Service Dashboard -> Path -> To -> Value] | `.env.local` |
| [ ] | `ANOTHER_VAR` | [Service Dashboard -> Path -> To -> Value] | `.env.local` |

## Account Setup

[Only if new account creation is required]

- [ ] **Create [Service] account**
  - URL: [signup URL]
  - Skip if: Already have account

## Dashboard Configuration

[Only if dashboard configuration is required]

- [ ] **[Configuration task]**
  - Location: [Service Dashboard -> Path -> To -> Setting]
  - Set to: [Required value or configuration]
  - Notes: [Any important details]

## Verification

After completing setup, verify with:

```bash
# [Verification commands]
```

Expected results:
- [What success looks like]

---

**Once all items complete:** Mark status as "Complete" and complete the linked MTask.
```

---

## The Automation-First Rule

**USER-SETUP contains ONLY what Claude literally cannot do.**

| Claude CAN Do (not in USER-SETUP) | Claude CANNOT Do (-> USER-SETUP) |
|-----------------------------------|--------------------------------|
| `npm install stripe` | Create Stripe account |
| Write webhook handler code | Get API keys from dashboard |
| Create `.env.local` file structure | Copy actual secret values |
| Run `stripe listen` | Authenticate Stripe CLI (browser OAuth) |
| Configure package.json | Access external service dashboards |
| Write any code | Retrieve secrets from third-party systems |

**The test:** "Does this require a human in a browser, accessing an account Claude doesn't have credentials for?"
- Yes -> USER-SETUP
- No -> Claude does it automatically

---

<service_examples>

**Stripe Example:**

```markdown
# Phase 10: User Setup Required

**Generated:** 2025-01-14
**Phase:** 10-monetization
**Status:** Incomplete

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `STRIPE_SECRET_KEY` | Stripe Dashboard -> Developers -> API keys -> Secret key | `.env.local` |
| [ ] | `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard -> Webhooks -> Signing secret | `.env.local` |

## Dashboard Configuration

- [ ] **Create webhook endpoint**
  - Location: Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
  - Endpoint URL: `https://[your-domain]/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `customer.subscription.*`

## Verification

```bash
# Check env vars are set
grep STRIPE .env.local

# Verify build passes
npm run build
```
```

**Supabase Example:**

```markdown
# Phase 2: User Setup Required

**Generated:** 2025-01-14
**Phase:** 02-authentication
**Status:** Incomplete

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard -> Settings -> API -> Project URL | `.env.local` |
| [ ] | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard -> Settings -> API -> anon public | `.env.local` |
| [ ] | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard -> Settings -> API -> service_role | `.env.local` |

## Dashboard Configuration

- [ ] **Enable Email Auth**
  - Location: Supabase Dashboard -> Authentication -> Providers
  - Enable: Email provider

## Verification

```bash
grep SUPABASE .env.local
npx supabase status
```
```

</service_examples>

<mosic_operations>

**Create user setup task:**
```javascript
// Create as MTask (appears in user's task list)
const setupTask = await mosic_create_document("MTask", {
  title: `User Setup: ${serviceName}`,
  description: `Configure ${serviceName} for ${phaseName}`,
  task_list: task_list_id,
  workspace: workspace_id,
  priority: "High",
  check_list: [
    { title: "Prerequisites complete", checked: false },
    { title: "Configuration steps done", checked: false },
    { title: "Verification passed", checked: false }
  ]
});

// Create linked page with detailed instructions
await mosic_create_entity_page("MTask", setupTask.name, {
  title: `User Setup: ${serviceName}`,
  icon: "lucide:settings",
  content: setupContent,
  page_type: "Document"
});

await mosic_batch_add_tags_to_document("MTask", setupTask.name, {
  workspace_id,
  tags: ["gsd-managed", "user-setup", `phase-${phase}`]
});
```

**Link to dependent task:**
```javascript
// The plan task depends on this setup
await mosic_create_document("M Relation", {
  from_doctype: "MTask",
  from_name: plan_task_id,
  to_doctype: "MTask",
  to_name: setup_task_id,
  relation_type: "Depends"
});
```

**Mark setup complete:**
```javascript
await mosic_complete_task(setup_task_id);
```

**Query pending setups:**
```javascript
const tasks = await mosic_search_tasks({
  workspace_id,
  tags: ["user-setup"],
  status: "Open"
});
```

</mosic_operations>

<guidelines>

**Never include:** Actual secret values. Steps Claude can automate.

**When to generate:** When plan introduces external service requiring manual key setup.

**User marks checkboxes:** Updates status line when complete, then completes the MTask.

</guidelines>
