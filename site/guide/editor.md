# Editor Basics

## WYSIWYG editing

Mark renders Markdown inline as you type. Headings, bold, italic, links, images, code blocks, tables, lists, and block quotes all render in place.

## Supported elements

| Element | Syntax | Rendered |
|---------|--------|----------|
| Heading | `# Title` | Styled heading |
| Bold | `**text**` | **text** |
| Italic | `*text*` | *text* |
| Code | `` `code` `` | Inline code |
| Link | `[text](url)` | Clickable link |
| Image | `![alt](url)` | Inline image |
| Table | Pipe syntax | Rendered table |
| Code block | Triple backtick | Syntax-highlighted block |
| Math | `$...$` or `$$...$$` | KaTeX-rendered formula |
| Mermaid | ` ```mermaid ` | Rendered diagram |
| Checkbox | `- [x]` | Interactive checkbox |

## Tabs

Mark supports multiple tabs. Each tab is an independent document with its own undo history, cursor position, and diff state.

- **Cmd+N** — New tab
- **Cmd+W** — Close tab
- **Cmd+Tab** — Cycle between tabs

## Source code mode

Press **Cmd+Alt+S** to switch to raw Markdown source editing. The source mode uses CodeMirror with syntax highlighting. Press again to return to WYSIWYG mode.

## Live reload

When an external process (your AI agent, another editor, a script) modifies the file on disk, Mark automatically reloads the content. The cursor position and scroll state are preserved.

This only applies to clean tabs (no unsaved changes). If you have unsaved edits, Mark will not overwrite them.

## Export

Use **File > Export** to save the document as:

- **PDF** — rendered through the system print engine
- **HTML** — styled HTML with the current theme applied
