# CLI Usage

Mark can be invoked from the command line to open files and folders.

## Basic usage

```sh
# Open a file
mark document.md

# Open multiple files
mark file1.md file2.md

# Open a folder as a project
mark ~/my-docs/
```

## Flags

| Flag | Description |
|------|-------------|
| `--preview` | Open files in read-only preview mode |
| `--version` | Print version and exit |
| `--help` | Print help and exit |

## Preview mode

```sh
mark --preview report.md
```

Opens the file in a read-only tab. The content is not editable (contenteditable=false). Click anywhere in the document to exit preview mode and start editing.

Preview tabs automatically reload when the file changes on disk, making them ideal for watching agent output.

## Integration with AI agents

```sh
# In your agent's tool:
open -a Mark report.md

# Or with preview mode:
open -a Mark --args --preview report.md
```

The live-reload feature means the agent can keep writing to the file and Mark will show updates automatically, with cursor position preserved.
