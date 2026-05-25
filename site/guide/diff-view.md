# Diff View

Diff view compares the current file content against a baseline, showing changes inline.

## Toggle diff view

Press **Cmd+D** or use **View > Diff Mode**.

Diff mode is per-tab — each tab can have its own diff state.

## Baseline resolution

Mark resolves the baseline in this order:

1. **`.before` file** — if `document.md.before` exists alongside `document.md`, it is used as the baseline. This lets you create explicit comparison points.
2. **Git HEAD** — falls back to `git show HEAD:{relative_path}` for the last committed version.

If neither is available (e.g., the file is new and untracked), an error message is shown.

## Creating a `.before` baseline

```sh
cp document.md document.md.before
# ... make edits to document.md ...
# Open in Mark, press Cmd+D to see the diff
```

This is useful for reviewing changes before committing, or for comparing against a specific snapshot.

## Display

The diff view uses CodeMirror's MergeView with inline diff rendering. Identical sections are collapsed to focus on changes. The view is read-only — switch back to normal mode (Cmd+D again) to resume editing.
