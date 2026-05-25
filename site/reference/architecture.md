# Architecture

## Overview

```
┌─────────────────────────────────────────────┐
│                  Mark App                    │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │  Rust Backend │    │  Vue 3 Frontend   │  │
│  │  (src-tauri/) │◄──►│  (src/renderer/)  │  │
│  │               │    │                   │  │
│  │  • File I/O   │    │  • Muya editor    │  │
│  │  • CLI parser │    │  • Pinia stores   │  │
│  │  • Git ops    │    │  • Components     │  │
│  │  • Ripgrep    │    │  • Command palette│  │
│  │  • Native menu│    │  • Theme engine   │  │
│  │  • Window mgmt│    │                   │  │
│  └──────────────┘    └───────────────────┘  │
│         ▲                    ▲               │
│         └────── Tauri IPC ───┘               │
└─────────────────────────────────────────────┘
```

## Rust modules (src-tauri/src/)

| Module | Purpose |
|--------|---------|
| `main.rs` | App entry point, Tauri builder, setup hook |
| `m001_panic.rs` | Panic hook — crash log + native dialog |
| `m002_fs.rs` | File system commands (read, write, stat) |
| `m009_menu.rs` | Native menu construction + accelerators |
| `m013b/search.rs` | Ripgrep-powered project search |
| `m020_cli.rs` | CLI argument parsing |
| `m031_diff.rs` | Diff baseline resolution (git + .before) |
| `dialog.rs` | Native OS dialogs (migration, error, info) |
| `mt_paths.rs` | App data / cache / config path resolution |
| `safe_log.rs` | Panic-safe stderr logging macro |

## Renderer stores (src/renderer/src/store/)

| Store | Purpose |
|-------|---------|
| `editor.js` | Tab state, current file, save/load lifecycle |
| `preferences.js` | User preferences (theme, font, encoding) |
| `layout.js` | Sidebar visibility, width, tab bar |
| `search.js` | Project search state (ripgrep integration) |
| `project.js` | Project tree state (folder roots) |
| `commandCenter.js` | Command palette state |

## IPC patterns

- **Commands** — `#[tauri::command]` functions called from the renderer via `invoke()`. Request-response pattern.
- **Events** — Tauri `emit()` for backend-to-frontend broadcasts (menu events, file watcher notifications).
- **Bus** — Internal renderer event bus (`src/renderer/src/bus.js`) for component-to-component communication within the frontend.
- **Menu bridge** — `menu-bridge.js` translates native menu events into command executions.

## Build pipeline

```sh
npm run build        # Vite builds the renderer → src-tauri/target/
cargo tauri build    # Packages the Tauri app bundle
```

The renderer build output is embedded into the Tauri binary. No separate web server needed at runtime.
