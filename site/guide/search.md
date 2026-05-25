# Search

Mark has two search modes: in-document search and project-wide search.

## In-document search (Cmd+F)

Opens a floating search bar at the top-right of the editor. Supports:

- **Case sensitive** — toggle with the `Aa` button
- **Whole word** — toggle with the `\b` button
- **Regular expressions** — toggle with the `.*` button
- **Find & Replace** — click the arrow on the left to expand the replace row

### Navigation

| Action | Shortcut |
|--------|----------|
| Open search | Cmd+F |
| Find next | Enter or Cmd+G |
| Find previous | Shift+Enter or Cmd+Shift+G |
| Close search | Escape or X button |
| Open replace | Cmd+H |

The search bar stays open while you edit. Click the X button or press Escape to close it.

## Project search (Cmd+Shift+F)

Opens a floating panel for searching across all files in the current project. Powered by ripgrep for fast full-text search.

- Type a query to search across all Markdown files in the project
- Results are grouped by file with match previews
- Click a match to open the file at that line
- Supports the same case-sensitive, whole-word, and regex options

### Requirements

Project search requires an open folder (use Cmd+Shift+O or `mark folder/` from the CLI).
