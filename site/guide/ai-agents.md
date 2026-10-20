---
description: "Wire Mark into AI coding clients and agent workflows — Claude Code, Codex, ZCode: the mark CLI in PATH, live-reloading preview for agent output, default-editor setup, and recipes for clients with fixed editor menus."
---

# AI Agents & Clients

Mark treats agent-written Markdown as a first-class case: agents keep writing files, Mark renders them live while you read. This page is the wiring guide for humans *and* for coding agents — it is also listed in [`/llms.txt`](/llms.txt) so an agent that reaches this site can set everything up itself.

Everything below applies to Mark 2.5 on macOS. The CLI flags work the same on Windows; only the default-editor and menu recipes are macOS-specific and marked as such.

## What Mark gives agent workflows

- **`mark file.md` opens a tab, not a window.** Mark is single-instance: if it is already running, the file opens as a new tab in the existing window (Finder double-clicks and `open` land in the same queue).
- **Live-reloading preview.** `--preview` opens a read-only tab that reloads whenever the file changes on disk, keeping your scroll position, so an agent can keep writing while you watch. Click the page when you want to start editing.
- **`--watch`** forces live-reload for regular (editable) tabs, for this open only.
- **`--diff`** opens the file in [Diff View](/guide/diff-view) against git HEAD (or a `.before` sidecar) — the review mode for agent-generated edits.
- **`-d <folder>`** opens a folder as the project sidebar root, so an agent can point you at a workspace: `mark -d ~/notes ~/notes/todo.md`.

## Step 1 — put `mark` in PATH

The CLI lives inside the app bundle. Expose it with a symlink (any directory already on your `PATH` works; `~/.local/bin` is a common choice). Use a symlink rather than the shell alias from [CLI Usage](/guide/cli): agents run non-interactive shells that do not load your aliases.

```sh
mkdir -p ~/.local/bin
ln -sfn /Applications/Mark.app/Contents/MacOS/mark ~/.local/bin/mark
```

Verify — must print the version and exit immediately:

```sh
mark --print-version   # prints e.g. "mark 2.5.3"
```

Because the symlink points *through* the app bundle, it always matches the installed version, DMG or App Store — both editions ship the same bundle (`com.xronocode.mark`) and the same CLI. On Windows, the same flags work with the app executable (`mark.exe`) wherever you installed it.

Revert: `rm ~/.local/bin/mark`.

## Step 2 — make Mark the default `.md` editor (macOS)

Mark registers itself as an editor for `.md`, `.markdown`, `.mmd`, `.mkd`, `.mkdn`, `.mdown`. To make it the *default*:

**Finder (GUI):** right-click any `.md` file → *Get Info* → *Open With:* → Mark → **Change All…**

**Or scripted** with [duti](https://github.com/moretension/duti):

```sh
brew install duti
duti -s com.xronocode.mark net.daringfireball.markdown all
duti -s com.xronocode.mark public.markdown all
```

Verify: `open notes.md` from any terminal must bring up Mark.

This covers everything that goes through the system: Finder double-clicks, `open file.md`, and any coding client that opens files via the OS. On Windows the equivalent lives in *Settings → Apps → Default apps → Mark*.

## Step 3 — clients with a fixed "Open in…" editor menu

Some desktop clients (ZCode is one) do **not** read the system default for their per-file *Open in* / *Reveal* menu. Their editor list is hardcoded — typically VS Code, Cursor, Zed, Sublime, JetBrains, plus Finder and terminals — and an entry appears only when the matching `.app` exists in `/Applications`. There is no settings hook for adding your own editor.

The workaround is a **free-slot symlink**: pick an editor from the client's list that you do *not* have installed, and symlink its expected path to Mark.

```sh
# example: the "Trae" slot, pointing at Mark
ln -s /Applications/Mark.app /Applications/Trae.app
```

The client now shows that entry (with Mark's icon); choosing it runs `open -a /Applications/Trae.app <file>`, which resolves to Mark and opens the file as a tab. Any free slot works — pick one you will never install for real.

Revert: `rm /Applications/Trae.app` (do this before ever installing the real app under that name).

Two honest caveats:

- The menu label will read the slot's name (e.g. "Trae"), not "Mark". Relabeling means patching the client's app bundle — possible (the entry is plain text inside its resources) but it breaks the app's code signature and every client update reverts it. We recommend the symlink, or better:
- **Ask the client's vendor** to add Mark to the list (or make the list configurable). That is the real fix, and vendors of AI coding clients are receptive to editor-integration requests.

## Step 4 — teach terminal agents to use Mark (Claude Code, Codex, ZCode, Gemini CLI…)

Terminal agents won't open files in Mark unless your instructions say so. Add a short block to the instruction file the client already reads (`AGENTS.md`, `CLAUDE.md`, `~/.codex/AGENTS.md`, or the client's global instructions):

```markdown
## Markdown viewing
When showing me a markdown file, open it in Mark instead of printing it to the
terminal: `mark --preview <path>` (read-only, reloads every time you save it).
When I ask to review your changes to a file: `mark --diff <path>`.
```

After that, "show me the notes" / "open the README" lands in a live-updating Mark tab.

## What *not* to do: `$EDITOR`

Do not point `EDITOR`/`VISUAL` at Mark. Terminal tools launch `$EDITOR`, wait for it to exit, then read the file back. A GUI app breaks that contract twice over: it never "exits" when you're done with the file, and with single-instance forwarding the launching process exits immediately. Keep a terminal editor for `$EDITOR`; Mark is for *viewing and reviewing*, driven by the recipes above.

## Quick checklist

- [ ] `mark --print-version` prints a version (Step 1)
- [ ] `open anything.md` brings up Mark (Step 2)
- [ ] The client's editor menu has a working Mark slot, if it needs one (Step 3)
- [ ] Agents open markdown in Mark when asked (Step 4)

See also: [CLI Usage](/guide/cli) for the full flag reference and [Diff View](/guide/diff-view) for the review flow.
