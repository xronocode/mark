# Reference

Technical documentation for Mark's internals.

## Architecture

Mark is a [Tauri v2](https://tauri.app) application:

- **Backend** — Rust process (`src-tauri/`) handles file I/O, CLI parsing, native menus, git operations, ripgrep search, and window management.
- **Frontend** — Vue 3 + Pinia renderer (`src/renderer/`) with the [Muya](https://github.com/marktext/muya) WYSIWYG editor engine.
- **IPC** — Tauri commands (`#[tauri::command]`) and event emitters bridge the two layers.

See [Architecture](./architecture) for a detailed breakdown.

## API documentation

### Rust (cargo doc)

Generate Rust API docs locally:

```sh
cd src-tauri
cargo doc --open --no-deps
```

This opens the rustdoc output for all `src-tauri/src/*.rs` modules.

### Renderer

The renderer source is in `src/renderer/src/`. Key directories:

| Directory | Purpose |
|-----------|---------|
| `components/` | Vue components (editor, sidebar, search, dialogs) |
| `store/` | Pinia stores (editor state, preferences, layout, search) |
| `commands/` | Command registry with keyboard shortcuts |
| `util/` | Theme, file, and format utilities |
| `i18n/` | Internationalization |

See [Rust API](./rust-api) for module-level documentation.
