# Verification Patterns

How to verify that code changes fulfill requirements and are real implementations, not stubs or placeholders. Covers two complementary dimensions: **requirements verification** (does the code do what was asked?) and **artifact verification** (is each artifact real and working?). Verification results are stored in Mosic M Pages.

<core_principle>

## Two Dimensions of Verification

### Dimension 1: Requirements Verification
Does the code fulfill what was asked? Checks:
1. **Traced** - Each requirement maps to specific code with `file:line` evidence
2. **Correct** - Implementation logic is sound (no bugs, race conditions, null cases)
3. **Secure** - No injection, XSS, permission bypasses, or data leaks
4. **Minimal** - No over-engineering, scope creep, or gold-plating

### Dimension 2: Artifact Verification
Is each artifact real and working? Checks:
1. **Exists** - File is present at expected path
2. **Substantive** - Content is real implementation, not placeholder
3. **Wired** - Connected to the rest of the system
4. **Functional** - Actually works when invoked

Dimension 1 is fully automatable. Dimension 2 levels 1-3 can be automated; level 4 often requires human verification.

### Verification Order
Automated code review (Dimension 1) executes **before** human testing begins. The automated phase catches issues Claude can detect programmatically: requirement gaps, correctness problems, security vulnerabilities, stubs, and over-engineering. Human verification then addresses what automation cannot: user experience, visual correctness, and business logic validation.

**Mosic integration:** Verification results are stored as M Pages linked to tasks or phases.
</core_principle>

<requirements_traceability>

## Requirements Traceability

Map every requirement to specific code evidence. If a requirement can't be traced to code, it's either unimplemented or the implementation doesn't match the ask.

### Requirements Sources (Priority Order)

1. **User's explicit request** — The original prompt and any follow-up clarifications (highest priority)
2. **Conversation history** — Decisions made during discussion ("use X approach", "don't do Y")
3. **Prior session context** — claude-mem observations from previous sessions (fallback if current conversation lacks context)
4. **Git context** — Commit messages describing what was implemented and why
5. **Related documentation** — Spec files, design docs, or requirements docs referenced by any source above

### Requirements Categories

Categorize each extracted requirement:

| Category | Meaning | Example |
|----------|---------|---------|
| `[Functional]` | What it should DO | "Add user authentication endpoint" |
| `[Behavioral]` | HOW it should behave | "Return 401 for invalid tokens" |
| `[Constraint]` | What the user restricted | "Keep it simple, follow existing patterns" |
| `[Implicit]` | Inherent to the change type | "Fix must not regress existing behavior" |

### Traceability Table Format

For each requirement, trace to specific code:

```
| # | Requirement | Status | Evidence (file:line) |
|---|-------------|--------|----------------------|
| 1 | [Functional] Add REST API for data access | MET | src/api/routes.py:42-68 |
| 2 | [Behavioral] Return 404 for missing records | NOT MET | No error handling in handler |
| 3 | [Constraint] Follow existing patterns | MET | Uses same service pattern as auth module |
| 4 | [Implicit] No regression to existing endpoints | MET | Existing tests still pass |
```

### Status Definitions

| Status | Meaning | Action |
|--------|---------|--------|
| **MET** | Code clearly and correctly implements this requirement | None |
| **PARTIALLY MET** | Some aspects implemented but gaps remain | Specify what's missing |
| **NOT MET** | Requirement is not addressed in the changes | Flag as requirement gap |
| **OVER-IMPLEMENTED** | Code goes beyond what was asked | Flag as scope creep |

### Traceability Score

Report: `X of Y requirements fully MET`

A passing score requires ALL requirements at MET status. Any NOT MET or PARTIALLY MET items must be resolved before verification can pass.

</requirements_traceability>

<code_quality_analysis>

## Code Quality Analysis

Automated checks to run against changed files before human verification.

### Correctness Patterns

For each changed file, check:

**Logic errors:**
- Off-by-one errors in loops and array access
- Incorrect boolean logic (AND/OR confusion, negation errors)
- Missing or wrong return values
- Integer overflow or type coercion issues

**Null/undefined handling:**
- Unguarded property access on potentially null values
- Missing null checks after database lookups or API calls
- Optional chaining where error handling is actually needed

**Race conditions:**
- Shared state modified without synchronization
- Async operations that depend on order but aren't awaited
- Time-of-check to time-of-use (TOCTOU) vulnerabilities

**Error paths:**
- Try/catch blocks that swallow errors silently
- Error responses with wrong status codes
- Missing cleanup in error paths (open handles, temp files)
- Error messages that leak internal details

**Boundary validation:**
- User input not validated before use
- API responses assumed to have expected shape
- File paths not sanitized
- Numeric inputs not range-checked

### Security Patterns

**Injection vulnerabilities:**
```
# SQL injection - string concatenation in queries
grep -E "\".*\+.*\"|f\".*\{.*\}.*SELECT|f\".*\{.*\}.*WHERE" "$file"

# Command injection - unsanitized input in shell commands
grep -E "subprocess|os\.system|exec\(|eval\(" "$file"

# XSS - unescaped user content in HTML output
grep -E "innerHTML|dangerouslySetInnerHTML|v-html" "$file"
```

**Authentication/Authorization:**
- API endpoints missing auth checks
- Permission checks that can be bypassed
- Privilege escalation through parameter manipulation
- Missing ownership validation (user A accessing user B's data)

**Data exposure:**
- Secrets, credentials, or API keys in code
- Sensitive data in logs or error messages
- Internal IDs or paths exposed to clients
- Missing data filtering (returning full objects when subset needed)

### Over-Engineering Patterns

Flag ANY of these — simplicity is non-negotiable:

**Abstraction red flags:**
```
# Single-use abstractions
- Helper function wrapping 3 or fewer lines
- Factory/builder pattern for one type
- Interface with single implementation
- Generic where a concrete type works
```

**YAGNI signals:**
```
- Config/options for hypothetical future needs
- Feature flags that aren't toggled anywhere
- Backwards-compat shims for new code
- Plugin architecture with one plugin
- "Extensible" patterns with one extension point
```

**Complexity signals:**
```
- Comments/docstrings added to unchanged code
- Type complexity beyond what the code requires
- Extra error handling for impossible scenarios
- Defensive copying where ownership is clear
- Wrapper types that add no behavior
```

**Rule of thumb:** Three similar lines of code is better than a premature abstraction. If an abstraction isn't used at least twice right now, inline it.

</code_quality_analysis>

<scope_creep_detection>

## Scope Creep Detection

After building the traceability table, identify changes that don't map to any requirement.

### Detection Method

1. List all files modified in the changeset (from `git diff --name-only`)
2. For each file, check if any requirement in the traceability table references it
3. Files with no requirement mapping are **unrequested changes**

### Classification

| Type | Meaning | Action |
|------|---------|--------|
| **Necessary supporting change** | Infrastructure required by a requirement (e.g., migration for a new model) | Note but accept |
| **Incidental improvement** | Cleanup or refactor of code touched by a requirement | Accept if minor, flag if substantial |
| **Unrequested feature** | New functionality not traced to any requirement | Flag — should be removed or approved separately |
| **Drive-by fix** | Bug fix in unrelated code | Flag — should be a separate commit/task |

### What to Report

```
## Scope Check
- Files changed: 12
- Files traced to requirements: 9
- Unrequested changes: 3
  - src/utils/helpers.ts — New utility function (not used by any requirement)
  - src/config.ts — Added unused config option
  - README.md — Documentation update (not requested)
```

</scope_creep_detection>

<review_output_format>

## Review Output Format

Standard format for presenting automated code review results.

### Verdict Levels

| Verdict | Meaning | Criteria |
|---------|---------|----------|
| **PASS** | Code is ready for human verification | All requirements MET + no Critical findings |
| **NEEDS ATTENTION** | Minor issues found | All requirements MET but Warning-level findings exist |
| **CRITICAL ISSUES** | Must fix before proceeding | Any NOT MET requirement OR any Critical finding |
| **GAPS FOUND** | Requirements not traceable to code | Any requirement without file:line evidence |

### Findings Format

For each issue found, report:

```
- **Severity**: Critical | Warning | Suggestion
- **File:Line**: exact location (e.g., src/api/handler.py:42)
- **Issue**: what's wrong (specific, not vague)
- **Fix**: concrete suggestion
```

### Findings Grouping

Present findings in this order:
1. **Requirements Gaps** — NOT MET or PARTIALLY MET requirements
2. **Correctness** — Logic errors, null handling, race conditions
3. **Security** — Injection, permissions, data exposure
4. **Over-Engineering** — YAGNI violations, unnecessary complexity
5. **Scope Creep** — Unrequested changes
6. **Pre-existing Issues** — Found in unchanged code (see below)

### Severity Definitions

| Severity | Meaning | Effect on Verification |
|----------|---------|----------------------|
| **Critical** | Will cause failures, security vulnerability, or requirement not met | Added as verification criterion — user must confirm |
| **Warning** | Should be fixed but won't block functionality | Added as verification criterion — user decides |
| **Suggestion** | Could be improved but acceptable as-is | Noted in report only |

### Pre-existing Issues

Issues found in code that was **not changed** by this implementation get their own section, clearly separated from implementation findings. These are not blockers for verification but are worth surfacing.

**Format:**
```
## Pre-existing Issues (not from this implementation)

These issues were found in surrounding code during review. They were NOT introduced
by the current changes but may be worth addressing separately.

- **File:Line**: src/auth/middleware.py:23
  **Issue**: SQL query uses string concatenation instead of parameterized query
  **Risk**: Potential SQL injection if user input reaches this path
  **Suggestion**: Refactor to use parameterized queries

- **File:Line**: src/api/handler.py:87
  **Issue**: Catch-all exception handler swallows errors silently
  **Risk**: Bugs in this path would be invisible
  **Suggestion**: Log the exception or re-raise after handling
```

**Rules for pre-existing issues:**
- Only surface Security (Critical/Warning) and Correctness (Critical) findings — skip minor issues
- Never block verification for pre-existing issues
- Present them as informational — the user decides whether to address them now or later
- If a pre-existing issue interacts with the new code (e.g., new code calls a function with a bug), escalate it to the main findings as a Warning

### What NOT to Flag

Do not flag:
- Style preferences or formatting (linter's job)
- Pre-existing minor issues (low-severity issues in unchanged code — only surface Critical/Warning pre-existing issues)
- Subjective suggestions ("I would have done it differently")
- Nitpicks that don't affect correctness or security

</review_output_format>

<stub_detection>

## Universal Stub Patterns

These patterns indicate placeholder code regardless of file type:

**Comment-based stubs:**
```bash
# Grep patterns for stub comments
grep -E "(TODO|FIXME|XXX|HACK|PLACEHOLDER)" "$file"
grep -E "implement|add later|coming soon|will be" "$file" -i
grep -E "// \.\.\.|/\* \.\.\. \*/|# \.\.\." "$file"
```

**Placeholder text in output:**
```bash
# UI placeholder patterns
grep -E "placeholder|lorem ipsum|coming soon|under construction" "$file" -i
grep -E "sample|example|test data|dummy" "$file" -i
grep -E "\[.*\]|<.*>|\{.*\}" "$file"  # Template brackets left in
```

**Empty or trivial implementations:**
```bash
# Functions that do nothing
grep -E "return null|return undefined|return \{\}|return \[\]" "$file"
grep -E "pass$|\.\.\.|\bnothing\b" "$file"
grep -E "console\.(log|warn|error).*only" "$file"  # Log-only functions
```

**Hardcoded values where dynamic expected:**
```bash
# Hardcoded IDs, counts, or content
grep -E "id.*=.*['\"].*['\"]" "$file"  # Hardcoded string IDs
grep -E "count.*=.*\d+|length.*=.*\d+" "$file"  # Hardcoded counts
grep -E "\\\$\d+\.\d{2}|\d+ items" "$file"  # Hardcoded display values
```

</stub_detection>

<react_components>

## React/Next.js Components

**Existence check:**
```bash
# File exists and exports component
[ -f "$component_path" ] && grep -E "export (default |)function|export const.*=.*\(" "$component_path"
```

**Substantive check:**
```bash
# Returns actual JSX, not placeholder
grep -E "return.*<" "$component_path" | grep -v "return.*null" | grep -v "placeholder" -i

# Has meaningful content (not just wrapper div)
grep -E "<[A-Z][a-zA-Z]+|className=|onClick=|onChange=" "$component_path"

# Uses props or state (not static)
grep -E "props\.|useState|useEffect|useContext|\{.*\}" "$component_path"
```

**Stub patterns specific to React:**
```javascript
// RED FLAGS - These are stubs:
return <div>Component</div>
return <div>Placeholder</div>
return <div>{/* TODO */}</div>
return <p>Coming soon</p>
return null
return <></>

// Also stubs - empty handlers:
onClick={() => {}}
onChange={() => console.log('clicked')}
onSubmit={(e) => e.preventDefault()}  // Only prevents default, does nothing
```

**Wiring check:**
```bash
# Component imports what it needs
grep -E "^import.*from" "$component_path"

# Props are actually used (not just received)
# Look for destructuring or props.X usage
grep -E "\{ .* \}.*props|\bprops\.[a-zA-Z]+" "$component_path"

# API calls exist (for data-fetching components)
grep -E "fetch\(|axios\.|useSWR|useQuery|getServerSideProps|getStaticProps" "$component_path"
```

**Functional verification (human required):**
- Does the component render visible content?
- Do interactive elements respond to clicks?
- Does data load and display?
- Do error states show appropriately?

</react_components>

<api_routes>

## API Routes (Next.js App Router / Express / etc.)

**Existence check:**
```bash
# Route file exists
[ -f "$route_path" ]

# Exports HTTP method handlers (Next.js App Router)
grep -E "export (async )?(function|const) (GET|POST|PUT|PATCH|DELETE)" "$route_path"

# Or Express-style handlers
grep -E "\.(get|post|put|patch|delete)\(" "$route_path"
```

**Substantive check:**
```bash
# Has actual logic, not just return statement
wc -l "$route_path"  # More than 10-15 lines suggests real implementation

# Interacts with data source
grep -E "prisma\.|db\.|mongoose\.|sql|query|find|create|update|delete" "$route_path" -i

# Has error handling
grep -E "try|catch|throw|error|Error" "$route_path"

# Returns meaningful response
grep -E "Response\.json|res\.json|res\.send|return.*\{" "$route_path" | grep -v "message.*not implemented" -i
```

**Stub patterns specific to API routes:**
```typescript
// RED FLAGS - These are stubs:
export async function POST() {
  return Response.json({ message: "Not implemented" })
}

export async function GET() {
  return Response.json([])  // Empty array with no DB query
}

export async function PUT() {
  return new Response()  // Empty response
}

// Console log only:
export async function POST(req) {
  console.log(await req.json())
  return Response.json({ ok: true })
}
```

**Wiring check:**
```bash
# Imports database/service clients
grep -E "^import.*prisma|^import.*db|^import.*client" "$route_path"

# Actually uses request body (for POST/PUT)
grep -E "req\.json\(\)|req\.body|request\.json\(\)" "$route_path"

# Validates input (not just trusting request)
grep -E "schema\.parse|validate|zod|yup|joi" "$route_path"
```

**Functional verification (human or automated):**
- Does GET return real data from database?
- Does POST actually create a record?
- Does error response have correct status code?
- Are auth checks actually enforced?

</api_routes>

<database_schema>

## Database Schema (Prisma / Drizzle / SQL)

**Existence check:**
```bash
# Schema file exists
[ -f "prisma/schema.prisma" ] || [ -f "drizzle/schema.ts" ] || [ -f "src/db/schema.sql" ]

# Model/table is defined
grep -E "^model $model_name|CREATE TABLE $table_name|export const $table_name" "$schema_path"
```

**Substantive check:**
```bash
# Has expected fields (not just id)
grep -A 20 "model $model_name" "$schema_path" | grep -E "^\s+\w+\s+\w+"

# Has relationships if expected
grep -E "@relation|REFERENCES|FOREIGN KEY" "$schema_path"

# Has appropriate field types (not all String)
grep -A 20 "model $model_name" "$schema_path" | grep -E "Int|DateTime|Boolean|Float|Decimal|Json"
```

**Stub patterns specific to schemas:**
```prisma
// RED FLAGS - These are stubs:
model User {
  id String @id
  // TODO: add fields
}

model Message {
  id        String @id
  content   String  // Only one real field
}

// Missing critical fields:
model Order {
  id     String @id
  // No: userId, items, total, status, createdAt
}
```

**Wiring check:**
```bash
# Migrations exist and are applied
ls prisma/migrations/ 2>/dev/null | wc -l  # Should be > 0
npx prisma migrate status 2>/dev/null | grep -v "pending"

# Client is generated
[ -d "node_modules/.prisma/client" ]
```

**Functional verification:**
```bash
# Can query the table (automated)
npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM $table_name"
```

</database_schema>

<hooks_utilities>

## Custom Hooks and Utilities

**Existence check:**
```bash
# File exists and exports function
[ -f "$hook_path" ] && grep -E "export (default )?(function|const)" "$hook_path"
```

**Substantive check:**
```bash
# Hook uses React hooks (for custom hooks)
grep -E "useState|useEffect|useCallback|useMemo|useRef|useContext" "$hook_path"

# Has meaningful return value
grep -E "return \{|return \[" "$hook_path"

# More than trivial length
[ $(wc -l < "$hook_path") -gt 10 ]
```

**Stub patterns specific to hooks:**
```typescript
// RED FLAGS - These are stubs:
export function useAuth() {
  return { user: null, login: () => {}, logout: () => {} }
}

export function useCart() {
  const [items, setItems] = useState([])
  return { items, addItem: () => console.log('add'), removeItem: () => {} }
}

// Hardcoded return:
export function useUser() {
  return { name: "Test User", email: "test@example.com" }
}
```

**Wiring check:**
```bash
# Hook is actually imported somewhere
grep -r "import.*$hook_name" src/ --include="*.tsx" --include="*.ts" | grep -v "$hook_path"

# Hook is actually called
grep -r "$hook_name()" src/ --include="*.tsx" --include="*.ts" | grep -v "$hook_path"
```

</hooks_utilities>

<environment_config>

## Environment Variables and Configuration

**Existence check:**
```bash
# .env file exists
[ -f ".env" ] || [ -f ".env.local" ]

# Required variable is defined
grep -E "^$VAR_NAME=" .env .env.local 2>/dev/null
```

**Substantive check:**
```bash
# Variable has actual value (not placeholder)
grep -E "^$VAR_NAME=.+" .env .env.local 2>/dev/null | grep -v "your-.*-here|xxx|placeholder|TODO" -i

# Value looks valid for type:
# - URLs should start with http
# - Keys should be long enough
# - Booleans should be true/false
```

**Stub patterns specific to env:**
```bash
# RED FLAGS - These are stubs:
DATABASE_URL=your-database-url-here
STRIPE_SECRET_KEY=sk_test_xxx
API_KEY=placeholder
NEXT_PUBLIC_API_URL=http://localhost:3000  # Still pointing to localhost in prod
```

**Wiring check:**
```bash
# Variable is actually used in code
grep -r "process\.env\.$VAR_NAME|env\.$VAR_NAME" src/ --include="*.ts" --include="*.tsx"

# Variable is in validation schema (if using zod/etc for env)
grep -E "$VAR_NAME" src/env.ts src/env.mjs 2>/dev/null
```

</environment_config>

<wiring_verification>

## Wiring Verification Patterns

Wiring verification checks that components actually communicate. This is where most stubs hide.

### Pattern: Component -> API

**Check:** Does the component actually call the API?

```bash
# Find the fetch/axios call
grep -E "fetch\(['\"].*$api_path|axios\.(get|post).*$api_path" "$component_path"

# Verify it's not commented out
grep -E "fetch\(|axios\." "$component_path" | grep -v "^.*//.*fetch"

# Check the response is used
grep -E "await.*fetch|\.then\(|setData|setState" "$component_path"
```

**Red flags:**
```typescript
// Fetch exists but response ignored:
fetch('/api/messages')  // No await, no .then, no assignment

// Fetch in comment:
// fetch('/api/messages').then(r => r.json()).then(setMessages)

// Fetch to wrong endpoint:
fetch('/api/message')  // Typo - should be /api/messages
```

### Pattern: API -> Database

**Check:** Does the API route actually query the database?

```bash
# Find the database call
grep -E "prisma\.$model|db\.query|Model\.find" "$route_path"

# Verify it's awaited
grep -E "await.*prisma|await.*db\." "$route_path"

# Check result is returned
grep -E "return.*json.*data|res\.json.*result" "$route_path"
```

**Red flags:**
```typescript
// Query exists but result not returned:
await prisma.message.findMany()
return Response.json({ ok: true })  // Returns static, not query result

// Query not awaited:
const messages = prisma.message.findMany()  // Missing await
return Response.json(messages)  // Returns Promise, not data
```

### Pattern: Form -> Handler

**Check:** Does the form submission actually do something?

```bash
# Find onSubmit handler
grep -E "onSubmit=\{|handleSubmit" "$component_path"

# Check handler has content
grep -A 10 "onSubmit.*=" "$component_path" | grep -E "fetch|axios|mutate|dispatch"

# Verify not just preventDefault
grep -A 5 "onSubmit" "$component_path" | grep -v "only.*preventDefault" -i
```

**Red flags:**
```typescript
// Handler only prevents default:
onSubmit={(e) => e.preventDefault()}

// Handler only logs:
const handleSubmit = (data) => {
  console.log(data)
}

// Handler is empty:
onSubmit={() => {}}
```

### Pattern: State -> Render

**Check:** Does the component render state, not hardcoded content?

```bash
# Find state usage in JSX
grep -E "\{.*messages.*\}|\{.*data.*\}|\{.*items.*\}" "$component_path"

# Check map/render of state
grep -E "\.map\(|\.filter\(|\.reduce\(" "$component_path"

# Verify dynamic content
grep -E "\{[a-zA-Z_]+\." "$component_path"  # Variable interpolation
```

**Red flags:**
```tsx
// Hardcoded instead of state:
return <div>
  <p>Message 1</p>
  <p>Message 2</p>
</div>

// State exists but not rendered:
const [messages, setMessages] = useState([])
return <div>No messages</div>  // Always shows "no messages"

// Wrong state rendered:
const [messages, setMessages] = useState([])
return <div>{otherData.map(...)}</div>  // Uses different data
```

</wiring_verification>

<verification_checklist>

## Quick Verification Checklist

For each artifact type, run through this checklist:

### Component Checklist
- [ ] File exists at expected path
- [ ] Exports a function/const component
- [ ] Returns JSX (not null/empty)
- [ ] No placeholder text in render
- [ ] Uses props or state (not static)
- [ ] Event handlers have real implementations
- [ ] Imports resolve correctly
- [ ] Used somewhere in the app

### API Route Checklist
- [ ] File exists at expected path
- [ ] Exports HTTP method handlers
- [ ] Handlers have more than 5 lines
- [ ] Queries database or service
- [ ] Returns meaningful response (not empty/placeholder)
- [ ] Has error handling
- [ ] Validates input
- [ ] Called from frontend

### Schema Checklist
- [ ] Model/table defined
- [ ] Has all expected fields
- [ ] Fields have appropriate types
- [ ] Relationships defined if needed
- [ ] Migrations exist and applied
- [ ] Client generated

### Hook/Utility Checklist
- [ ] File exists at expected path
- [ ] Exports function
- [ ] Has meaningful implementation (not empty returns)
- [ ] Used somewhere in the app
- [ ] Return values consumed

### Wiring Checklist
- [ ] Component -> API: fetch/axios call exists and uses response
- [ ] API -> Database: query exists and result returned
- [ ] Form -> Handler: onSubmit calls API/mutation
- [ ] State -> Render: state variables appear in JSX

</verification_checklist>

<automated_verification_script>

## Automated Verification Approach

For the verification subagent, use this pattern:

```bash
# 1. Check existence
check_exists() {
  [ -f "$1" ] && echo "EXISTS: $1" || echo "MISSING: $1"
}

# 2. Check for stub patterns
check_stubs() {
  local file="$1"
  local stubs=$(grep -c -E "TODO|FIXME|placeholder|not implemented" "$file" 2>/dev/null || echo 0)
  [ "$stubs" -gt 0 ] && echo "STUB_PATTERNS: $stubs in $file"
}

# 3. Check wiring (component calls API)
check_wiring() {
  local component="$1"
  local api_path="$2"
  grep -q "$api_path" "$component" && echo "WIRED: $component -> $api_path" || echo "NOT_WIRED: $component -> $api_path"
}

# 4. Check substantive (more than N lines, has expected patterns)
check_substantive() {
  local file="$1"
  local min_lines="$2"
  local pattern="$3"
  local lines=$(wc -l < "$file" 2>/dev/null || echo 0)
  local has_pattern=$(grep -c -E "$pattern" "$file" 2>/dev/null || echo 0)
  [ "$lines" -ge "$min_lines" ] && [ "$has_pattern" -gt 0 ] && echo "SUBSTANTIVE: $file" || echo "THIN: $file ($lines lines, $has_pattern matches)"
}
```

Run these checks against each must-have artifact. Store results in Mosic verification page.

</automated_verification_script>

<human_verification_triggers>

## When to Require Human Verification

Some things can't be verified programmatically. Flag these for human testing:

**Always human:**
- Visual appearance (does it look right?)
- User flow completion (can you actually do the thing?)
- Real-time behavior (WebSocket, SSE)
- External service integration (Stripe, email sending)
- Error message clarity (is the message helpful?)
- Performance feel (does it feel fast?)

**Human if uncertain:**
- Complex wiring that grep can't trace
- Dynamic behavior depending on state
- Edge cases and error states
- Mobile responsiveness
- Accessibility

**Format for human verification request:**
```markdown
## Human Verification Required

### 1. Chat message sending
**Test:** Type a message and click Send
**Expected:** Message appears in list, input clears
**Check:** Does message persist after refresh?

### 2. Error handling
**Test:** Disconnect network, try to send
**Expected:** Error message appears, message not lost
**Check:** Can retry after reconnect?
```

</human_verification_triggers>

<checkpoint_automation_reference>

## Pre-Checkpoint Automation

For automation-first checkpoint patterns, server lifecycle management, CLI installation handling, and error recovery protocols, see:

**@get-shit-done/references/checkpoints.md** -> `<automation_reference>` section

Key principles:
- Claude sets up verification environment BEFORE presenting checkpoints
- Users never run CLI commands (visit URLs only)
- Server lifecycle: start before checkpoint, handle port conflicts, keep running for duration
- CLI installation: auto-install where safe, checkpoint for user choice otherwise
- Error handling: fix broken environment before checkpoint, never present checkpoint with failed setup

</checkpoint_automation_reference>

<mosic_verification_pages>

## Storing Verification Results in Mosic

Verification results are stored as M Pages linked to tasks or phases.

### Creating Verification Report Page

```javascript
// Create verification report linked to phase
const verificationPage = await mosic_create_entity_page("MTask List", phase_task_list_id, {
  title: `Verification Report: Phase ${phase_number}`,
  page_type: "Document",
  icon: "lucide:shield-check"
});

// Add verification content
await mosic_update_content_blocks(verificationPage.name, [{
  type: "paragraph",
  data: {
    text: `## Verification Report

**Phase:** ${phase_name}
**Verified at:** ${new Date().toISOString()}

### Summary
- **Total Checks:** ${totalChecks}
- **Passed:** ${passedChecks}
- **Failed:** ${failedChecks}
- **Needs Review:** ${needsReview}

### Automated Checks
${automatedResults.map(r => `- [${r.passed ? 'x' : ' '}] ${r.name}: ${r.details}`).join('\n')}

### Human Verification Required
${humanChecks.map(h => `- [ ] ${h.name}: ${h.instructions}`).join('\n')}`
  }
}]);

// Tag the verification page
await mosic_batch_add_tags_to_document("M Page", verificationPage.name, [
  "verification",
  `phase-${phase_number}`
]);
```

### Verification Status Updates

Map verification results to MTask status:

| Verification Result | MTask Update |
|---------------------|--------------|
| All checks pass | status: "Done" |
| Some checks fail | status: "Blocked", add blocker comment |
| Critical failure | status: "Blocked", create issue task |
| Needs human review | status: "In Progress", add review checklist |

### Creating Issue Tasks for Failures

When verification fails, create issue tasks automatically:

```javascript
// For each failed verification check
for (const failure of failedChecks) {
  const issueTask = await mosic_create_document("MTask", {
    title: `Fix: ${failure.artifact} - ${failure.issue}`,
    task_list: phase_task_list_id,
    status: "To Do",
    priority: "High",
    description: `## Verification Failure

**Artifact:** ${failure.artifact}
**Check:** ${failure.checkType}
**Issue:** ${failure.issue}

## Expected
${failure.expected}

## Actual
${failure.actual}

## Suggested Fix
${failure.suggestion}`
  });

  // Tag as verification failure
  await mosic_add_tag_to_document("MTask", issueTask.name, "verification-failure");

  // Create blocker relation to original task
  await mosic_create_document("M Relation", {
    source_doctype: "MTask",
    source_name: issueTask.name,
    target_doctype: "MTask",
    target_name: original_task_id,
    relation_type: "Blocker"
  });
}
```

### Linking Verification to Source Tasks

Create relations between verification results and original tasks:

```javascript
// Link verification page to source task
await mosic_create_document("M Relation", {
  source_doctype: "M Page",
  source_name: verification_page_id,
  target_doctype: "MTask",
  target_name: original_task_id,
  relation_type: "Related"
});
```

### Verification Summary in Phase Overview

Update phase overview page with verification metrics:

```javascript
// Find or create phase overview page
const overviewPages = await mosic_get_entity_pages("MTask List", phase_task_list_id, {
  tags: ["overview"]
});

const overviewPage = overviewPages[0];

// Add verification summary block
await mosic_update_content_blocks(overviewPage.name, [{
  type: "paragraph",
  data: {
    text: `## Verification Summary

- **Total Checks:** ${total}
- **Passed:** ${passed}
- **Failed:** ${failed}
- **Needs Review:** ${needsReview}

Last verified: ${timestamp}
[View Full Report](https://mosic.pro/app/page/${verification_page_id})`
  }
}], { append: true });
```

### Automated vs Human Verification Tracking

Track which verifications were automated vs human:

```javascript
// Tag verification results by type
await mosic_batch_add_tags_to_document("M Page", verification_page_id, [
  "verification",
  allPassed ? "auto-verified" : "human-verified",
  `phase-${phase_number}`
]);
```

### Querying Verification Status

Find tasks needing verification:

```javascript
// Find unverified completed tasks
const unverified = await mosic_search_tasks({
  project_id: config.project_id,
  status: "Done"
  // Then filter for those without verification tag
});

// Find verification failures
const failures = await mosic_search_documents_by_tags({
  tags: ["verification-failure"],
  doctypes: ["MTask"],
  project_id: config.project_id
});

// Find tasks blocked by verification issues
const blockedByVerification = await mosic_search_documents_by_relation({
  relation_type: "Blocker",
  target_doctypes: ["MTask"],
  source_tags: ["verification-failure"]
});
```

### Verification Report Template

Standard structure for verification pages:

```markdown
## Verification Report

**Phase:** [Phase Name]
**Plan:** [Plan Number]
**Verified at:** [Timestamp]

### Summary
| Check Type | Total | Passed | Failed |
|------------|-------|--------|--------|
| Existence  | X     | X      | X      |
| Substantive| X     | X      | X      |
| Wiring     | X     | X      | X      |
| Functional | X     | X      | X      |

### Detailed Results

#### Existence Checks
- [x] Component: src/components/Dashboard.tsx
- [x] API: src/app/api/auth/route.ts
- [ ] Schema: prisma/schema.prisma (User model missing email field)

#### Substantive Checks
- [x] Dashboard has meaningful JSX
- [ ] Auth API has TODO placeholder

#### Wiring Checks
- [x] Dashboard -> /api/data (fetch verified)
- [x] Form -> onSubmit (handler implemented)

#### Human Verification Required
- [ ] Visual: Dashboard layout matches design
- [ ] Flow: Login -> Dashboard redirect works
- [ ] Error: Invalid login shows error message

### Issues Created
- [Fix: Auth API has TODO placeholder](https://mosic.pro/app/MTask/[id])
- [Fix: User model missing email field](https://mosic.pro/app/MTask/[id])
```

</mosic_verification_pages>
