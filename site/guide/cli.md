---
description: "Open files and folders in Mark from your terminal and AI-agent workflows."
---

# CLI Usage

Homebrew and the `.dmg` install the Mark app, not a `mark` command on your PATH — the cask puts `Mark.app` into `/Applications` and nothing into a shell bin directory. There are two ways to drive Mark from a terminal.

## Open with macOS `open`

The recommended way, no set-up needed:

```sh
# Open a file (launches Mark if it is not running)
open -a Mark report.md

# Open several files, each in its own tab
open -a Mark plan.md notes.md

# Open a folder as the project shown in the sidebar
open -a Mark ~/my-docs

# Pass app flags through to the binary Mark starts
open -a Mark --args --preview report.md
```

## The app binary and its flags

The binary inside the app bundle parses the command line itself:

```sh
/Applications/Mark.app/Contents/MacOS/mark --preview report.md
```

| Flag | Description |
|------|-------------|
| `files…` | Files to open; each opens in a new tab |
| `-d`, `--dir <DIR>` | Open this folder as the project (the sidebar root) |
| `--preview` | Open files in a read-only tab; click the page to start editing |
| `-w`, `--watch` | Reload whenever the file changes on disk, even if live reload is off in Settings |
| `--diff` | Open files in diff view |
| `--new-window` | Accepted, but has no effect yet — multiple windows are not implemented |
| `-v`, `--verbose` | Verbose trace on stderr |
| `--print-version` | Print the version and exit |
| `--version`, `--help` | Print version or help and exit |

If you type `mark` often, add an alias to your shell profile:

```sh
alias mark="/Applications/Mark.app/Contents/MacOS/mark"
```

The flags above take effect when that binary starts Mark. When Mark is already running, files opened through it join the running app. Agents run non-interactive shells that ignore aliases — for them, put a symlink on your `PATH` instead, as described in [AI Agents & Clients](/guide/ai-agents).

## Preview mode

`--preview` opens the file in a read-only tab (the page is not editable). Click anywhere in the document to leave preview and start editing.

Preview tabs automatically reload when the file changes on disk, which makes them ideal for watching agent output:

```sh
mark --preview report.md                  # with the alias above
open -a Mark --args --preview report.md   # without one
```

## Integration with AI agents

The agent prompt on the home screen boils down to this: write the document to a `.md` file and hand it to Mark.

```sh
open -a Mark report.md
```

Mark reloads the tab whenever the file changes on disk, keeping your scroll position, so the agent can keep writing while you read along. ⌘D shows what changed since the last reload.
