---
name: set-profile
description: Switch model profile for GSD agents (quality/balanced/budget)
arguments:
  - name: profile
    description: "Profile name: quality, balanced, or budget"
    required: true
allowed-tools:
  - Read
  - Write
  - Bash
  - ToolSearch
---

<objective>
Switch the model profile used by GSD agents. This controls which Claude model each agent uses, balancing quality vs token spend.

Also stores profile preference in Mosic project metadata if integration enabled.
</objective>

<profiles>
| Profile | Description |
|---------|-------------|
| **quality** | Opus everywhere except read-only verification |
| **balanced** | Opus for planning, Sonnet for execution/verification (default) |
| **budget** | Sonnet for writing, Haiku for research/verification |
</profiles>

<process>

## 1. Validate argument

```
if $ARGUMENTS.profile not in ["quality", "balanced", "budget"]:
  Error: Invalid profile "$ARGUMENTS.profile"
  Valid profiles: quality, balanced, budget
  STOP
```

## 2. Check for project

```bash
ls .planning/config.json 2>/dev/null
```

If no `.planning/` directory:
```
Error: No GSD project found.
Run /gsd:new-project first to initialize a project.
```

## 3. Update config.json

Read current config:
```bash
cat .planning/config.json
```

Update `model_profile` field (or add if missing):
```json
{
  "model_profile": "$ARGUMENTS.profile"
}
```

Write updated config back to `.planning/config.json`.

## 4. Sync to Mosic (if enabled)

**Store profile in Mosic project metadata:**

```bash
MOSIC_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | grep -o 'true\|false' || echo "false")
```

**If mosic.enabled = true:**

```bash
PROJECT_ID=$(cat .planning/config.json | jq -r ".mosic.project_id")
```

```
IF PROJECT_ID is not null:
  # Load Mosic tools
  ToolSearch("mosic update document")

  # Update project with model profile in description or custom field
  # Note: Stored as metadata for visibility in Mosic UI

  current_project = mosic_get_project(PROJECT_ID)

  # Add/update profile info in project description
  # Look for existing "Model Profile:" line and update, or append
  updated_description = update_description_with_profile(
    current_project.description,
    "Model Profile: " + $ARGUMENTS.profile
  )

  mosic_update_document("MProject", PROJECT_ID, {
    description: updated_description
  })

  # Add comment noting profile change
  mosic_create_document("M Comment", {
    workspace_id: WORKSPACE_ID,
    ref_doc: "MProject",
    ref_name: PROJECT_ID,
    content: "⚙️ Model profile changed to **" + $ARGUMENTS.profile + "**"
  })
```

**Error handling:**
```
IF mosic sync fails:
  - Log warning: "Mosic sync failed: [error]. Profile updated locally."
  - Continue to confirmation (don't block)
```

**If mosic.enabled = false:** Skip to confirmation.

## 5. Confirm

```
✓ Model profile set to: $ARGUMENTS.profile

Agents will now use:
[Show table from model-profiles.md for selected profile]

Next spawned agents will use the new profile.
[IF mosic.enabled AND PROJECT_ID:]
Mosic project metadata updated.
[END IF]
```

</process>

<examples>

**Switch to budget mode:**
```
/gsd:set-profile budget

✓ Model profile set to: budget

Agents will now use:
| Agent | Model |
|-------|-------|
| gsd-planner | sonnet |
| gsd-executor | sonnet |
| gsd-verifier | haiku |
| ... | ... |
```

**Switch to quality mode:**
```
/gsd:set-profile quality

✓ Model profile set to: quality

Agents will now use:
| Agent | Model |
|-------|-------|
| gsd-planner | opus |
| gsd-executor | opus |
| gsd-verifier | sonnet |
| ... | ... |
```

</examples>

<success_criteria>
- [ ] Profile argument validated
- [ ] config.json updated with new profile
- [ ] Mosic sync (if enabled):
  - [ ] Project metadata updated with profile
  - [ ] Profile change comment added
- [ ] User shown agent model table
</success_criteria>
