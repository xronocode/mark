# Rust API

The Rust backend is documented with inline `///` doc comments. Generate and browse the full API docs locally:

```sh
cd src-tauri
cargo doc --open --no-deps
```

## Key Tauri commands

These functions are callable from the renderer via `invoke()`:

### File operations

| Command | Module | Description |
|---------|--------|-------------|
| `mt_read_file` | m002_fs | Read file contents as UTF-8 string |
| `mt_write_file` | m002_fs | Write string to file path |
| `mt_stat_file` | m002_fs | Get file metadata (size, modified) |

### Search

| Command | Module | Description |
|---------|--------|-------------|
| `mt_search_directory` | m013b | Ripgrep-powered directory search |

### Diff

| Command | Module | Description |
|---------|--------|-------------|
| `mt_diff_baseline` | m031_diff | Get baseline content for diff view |

### CLI

| Command | Module | Description |
|---------|--------|-------------|
| `mt_drain_pending_opens` | main | Drain CLI-specified files for opening |

### System

| Command | Module | Description |
|---------|--------|-------------|
| `mt_app_quit` | main | Graceful app shutdown |
| `mt_cache_root` | mt_paths | Get app cache directory |

## Testing

```sh
# Run all Rust tests
cd src-tauri
cargo test

# Run tests for a specific module
cargo test -- m031
cargo test -- m001
cargo test -- m013b
```

The test suite currently has 427 tests covering all modules.
