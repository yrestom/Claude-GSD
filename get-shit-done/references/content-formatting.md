# Content Formatting Reference for Mosic MCP

**CRITICAL:** Mosic requires specific content formats for different entity types. Using incorrect formats will cause display issues in the Mosic UI.

## Format Requirements Summary

| Entity Type | Content Field | Required Format |
|-------------|---------------|-----------------|
| M Page | content | Editor.js JSON blocks |
| MTask | description | Editor.js JSON blocks |
| MSpace | description | HTML |
| MProject | description | HTML |
| MTask List | description | HTML |
| M Comment | content | HTML |

## Editor.js Format (for M Page and MTask)

Editor.js format is a structured JSON object with a `blocks` array. Each block has a `type` and `data` field.

### Basic Structure

```javascript
{
  blocks: [
    {
      type: "header",
      data: { text: "Title", level: 1 }
    },
    {
      type: "paragraph",
      data: { text: "Body text with **bold** and *italic*" }
    }
  ]
}
```

### Supported Block Types

#### Header
```javascript
{
  type: "header",
  data: { text: "Heading Text", level: 1 }  // level: 1-6
}
```

#### Paragraph
```javascript
{
  type: "paragraph",
  data: { text: "Paragraph content. Supports **bold**, *italic*, `code`." }
}
```

#### List (Unordered)
```javascript
{
  type: "list",
  data: {
    style: "unordered",
    items: ["Item 1", "Item 2", "Item 3"]
  }
}
```

#### List (Ordered)
```javascript
{
  type: "list",
  data: {
    style: "ordered",
    items: ["First item", "Second item", "Third item"]
  }
}
```

#### Table
```javascript
{
  type: "table",
  data: {
    content: [
      ["Header 1", "Header 2", "Header 3"],
      ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
      ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"]
    ]
  }
}
```

#### Code Block
```javascript
{
  type: "code",
  data: {
    code: "const x = 1;\nconsole.log(x);",
    language: "javascript"
  }
}
```

#### Quote
```javascript
{
  type: "quote",
  data: {
    text: "Quote text here",
    caption: "Author or source"
  }
}
```

#### Delimiter (Horizontal Rule)
```javascript
{
  type: "delimiter",
  data: {}
}
```

#### Checklist
```javascript
{
  type: "checklist",
  data: {
    items: [
      { text: "Task 1", checked: true },
      { text: "Task 2", checked: false }
    ]
  }
}
```

### MTask Description Example (Editor.js)

```javascript
// Creating a task with Editor.js description
mosic_create_document("MTask", {
  workspace: workspace_id,
  task_list: task_list_id,
  title: "Implement user authentication",
  description: {
    blocks: [
      {
        type: "paragraph",
        data: { text: "Implement OAuth2 authentication flow for the application." }
      },
      {
        type: "header",
        data: { text: "Acceptance Criteria", level: 2 }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: [
            "Users can log in with Google",
            "Session persists across page refreshes",
            "Logout clears session completely"
          ]
        }
      },
      {
        type: "header",
        data: { text: "Technical Notes", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "Use the existing auth service in `src/services/auth.ts`" }
      }
    ]
  },
  status: "ToDo",
  priority: "High"
})
```

### Updating Task Description (Editor.js)

```javascript
// Appending to existing description
mosic_update_document("MTask", task_id, {
  description: {
    blocks: [
      // ... existing blocks ...
      {
        type: "delimiter",
        data: {}
      },
      {
        type: "header",
        data: { text: "Completion Summary", level: 2 }
      },
      {
        type: "paragraph",
        data: { text: "**Completed:** " + format_date(now) }
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: ["Commit: `abc123`", "Duration: 45 minutes"]
        }
      }
    ]
  }
})
```

### MProject / MTask List / MSpace Description Example (HTML)

```javascript
// Creating a project with HTML description
mosic_create_document("MProject", {
  workspace: workspace_id,
  title: "Authentication System",
  description: "<p><strong>Goal:</strong> Implement secure user authentication</p>" +
    "<p><strong>Status:</strong> In Progress</p>" +
    "<ul>" +
    "<li>OAuth2 support</li>" +
    "<li>Session management</li>" +
    "</ul>"
})

// Creating a task list (phase) with HTML description
mosic_create_document("MTask List", {
  workspace: workspace_id,
  project: project_id,
  title: "Phase 01: Core Auth",
  description: "<p><strong>Goal:</strong> Implement core authentication flow</p>" +
    "<p><strong>Status:</strong> Not planned yet</p>" +
    "<p>Run <code>/gsd:plan-phase 01</code> to create execution plans.</p>"
})
```

## HTML Format (for M Comment)

M Comment content uses HTML format for rich text display.

### Basic HTML Elements

| Markdown | HTML |
|----------|------|
| `**bold**` | `<strong>bold</strong>` |
| `*italic*` | `<em>italic</em>` |
| `` `code` `` | `<code>code</code>` |
| `[link](url)` | `<a href="url">link</a>` |
| Line break | `<br>` |
| Paragraph | `<p>text</p>` |

### M Comment Examples

#### Simple Status Comment
```javascript
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask",
  reference_name: task_id,
  content: "<p><strong>Status Update</strong></p><p>Task is now in progress.</p>"
})
```

#### Completion Comment with Details
```javascript
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask",
  reference_name: task_id,
  content: "<p><strong>Completed</strong></p>" +
    "<p>Commit: <code>" + commit_hash + "</code></p>" +
    "<p><a href=\"https://mosic.pro/app/page/" + summary_page_id + "\">View Summary</a></p>"
})
```

#### Comment with List
```javascript
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "MTask",
  reference_name: task_id,
  content: "<p><strong>Task Complete</strong></p>" +
    "<ul>" +
    "<li>Duration: " + duration + "</li>" +
    "<li>Subtasks: " + completed + "/" + total + "</li>" +
    "<li>Deviations: " + deviation_count + "</li>" +
    "</ul>" +
    "<p><a href=\"page/" + summary_page_id + "\">Summary</a></p>"
})
```

#### UAT Result Comment
```javascript
mosic_create_document("M Comment", {
  workspace_id: workspace_id,
  reference_doctype: "M Page",
  reference_name: uat_page_id,
  content: "<p><strong>UAT Complete</strong></p>" +
    "<ul>" +
    "<li>Passed: " + passed_count + "</li>" +
    "<li>Issues: " + issues_count + "</li>" +
    "<li>Skipped: " + skipped_count + "</li>" +
    "</ul>"
})
```

## Converting Markdown to Editor.js

When you have markdown content that needs to be stored as Editor.js:

### Pattern: Convert Section by Section

```javascript
// Input markdown:
// ## Problem
// The API returns 500 errors when...
//
// ## Solution
// Add error handling in the controller

// Output Editor.js:
{
  blocks: [
    {
      type: "header",
      data: { text: "Problem", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: "The API returns 500 errors when..." }
    },
    {
      type: "header",
      data: { text: "Solution", level: 2 }
    },
    {
      type: "paragraph",
      data: { text: "Add error handling in the controller" }
    }
  ]
}
```

### Pattern: Convert List Items

```javascript
// Input markdown:
// - Item 1
// - Item 2
// - Item 3

// Output Editor.js:
{
  type: "list",
  data: {
    style: "unordered",
    items: ["Item 1", "Item 2", "Item 3"]
  }
}
```

## Converting Markdown to HTML (for Comments)

```javascript
// Input markdown:
// **Completed**
//
// Commit: `abc123`
//
// [View Summary](https://mosic.pro/app/page/xyz)

// Output HTML:
"<p><strong>Completed</strong></p>" +
"<p>Commit: <code>abc123</code></p>" +
"<p><a href=\"https://mosic.pro/app/page/xyz\">View Summary</a></p>"
```

## Anti-Patterns (DO NOT DO)

### Wrong: Plain Markdown String for Task Description
```javascript
// WRONG - will not render properly
mosic_create_document("MTask", {
  description: "## Problem\n\nThe API fails...\n\n## Solution\n\nAdd error handling"
})
```

### Wrong: Markdown for Comment
```javascript
// WRONG - markdown won't render
mosic_create_document("M Comment", {
  content: "**Completed**\n\nCommit: `abc123`"
})
```

### Wrong: Editor.js for Comment
```javascript
// WRONG - comments don't support Editor.js
mosic_create_document("M Comment", {
  content: { blocks: [...] }  // Comments use HTML, not Editor.js
})
```

## Quick Reference

| Task | Format | Example |
|------|--------|---------|
| Create M Page | Editor.js | `content: { blocks: [...] }` |
| Update M Page | Editor.js | `mosic_update_content_blocks(...)` |
| Create MTask | Editor.js | `description: { blocks: [...] }` |
| Update MTask | Editor.js | `description: { blocks: [...] }` |
| Create M Comment | HTML | `content: "<p><strong>...</strong></p>"` |
