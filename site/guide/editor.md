---
description: "Edit Markdown in Mark with headings, lists, links, tables, code blocks and inline formatting."
---

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
| Footnote | `text[^1]` and `[^1]: note` | Linked footnote |
| Callout | `> [!NOTE]`, `> [!WARNING]`, `> [!tip] Title`, `> [!faq]-` | Coloured callout; `-`/`+` make it foldable |
| Front matter | `---` YAML block at the top | Properties table; click it to edit the YAML |

## Callouts

GitHub's five alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) and Obsidian callouts render as callouts. Obsidian aliases such as `info`, `tldr`, `faq`, `bug` or `example` get their own colour, and an unknown type uses the note style with its name as the title. Add a title after the marker (`> [!tip] Before you start`). Add `-` (collapsed) or `+` (expanded) after the marker to make it foldable; folding never changes the file. HTML and PDF export keep the callouts.

## Front matter

A flat YAML front matter block (keys with text, numbers, lists) is shown as a properties table. Click the table to edit the YAML; click anywhere else to see the table again. Nested YAML stays a plain YAML block. Turn the table off in **Preferences → Markdown → Show YAML front matter as a properties table**.

## Images

Paste a screenshot with **Cmd+V** or drop an image file from Finder into a saved document: Mark copies it into an `assets/` folder next to the file and inserts `![](assets/…)`. The folder name is set in **Preferences → Image**. In the App Store version, Mark asks once for access to the document's folder; if you decline, the image is saved to Mark's own image folder instead.

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
