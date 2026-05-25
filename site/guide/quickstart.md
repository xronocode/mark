# Quick Start

## Open a file

```sh
mark document.md
```

Or use **File > Open** (Cmd+O) from within the app.

## Open a project folder

```sh
mark ~/projects/my-docs/
```

This opens the folder in the project sidebar. Click any `.md` file to open it in a tab.

## Create a new file

Press **Cmd+N** or use **File > New Tab**. The file starts as "Untitled-1" — save with Cmd+S to pick a location.

## Basic editing

Mark is a WYSIWYG editor. Just start typing:

- Type `# ` for a heading
- Type `- ` for a bullet list
- Type `` ``` `` for a code block
- Type `$$` for a KaTeX math block
- Wrap text in `**bold**` or `*italic*` — it renders inline

## Switch modes

| Mode | Shortcut | Description |
|------|----------|-------------|
| WYSIWYG | Default | Rich editing with live rendering |
| Source Code | Cmd+Alt+S | Raw Markdown source |
| Diff View | Cmd+D | Compare against git HEAD or `.before` file |

## Search

- **Cmd+F** — Find in current document
- **Cmd+G** / **Cmd+Shift+G** — Find next / previous
- **Cmd+Shift+F** — Search across project files
- **Enter** / **Shift+Enter** — Next / previous match (when search is open)

## Set up your AI agent

Add this to your agent's system prompt or `CLAUDE.md`:

```markdown
When you produce a plan, spec, report, or any document longer than ~50 lines,
write it to a .md file and open it in the user's editor:

    open -a Mark <file>.md

The user will read and edit directly in Mark. When you see the file has changed
on disk, read the updated version — the user left feedback inline.
```
