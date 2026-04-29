// MODULE_CONTRACT
//   PURPOSE: Build-time replacement for electron-log/renderer + electron-log
//            top-level imports. v1.2.3 renderer relied on the upstream
//            crate; Tauri port has no electron runtime to talk to, so
//            we provide a console-backed facade that preserves the API
//            surface (info / warn / error / debug / verbose / silly +
//            a default export with .transports + .functions).
//   SCOPE:   logging only — no remote sink, no file rotation, no
//            level-based filter. F-LOG-TAURI-PLUGIN-LOG would replace
//            this with tauri-plugin-log if we want IPC-driven logs.
//   STATUS:  Phase-B-MAIN-ENTRY-WIRING shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 close F-MAIN-ENTRY-DISABLED: build-time shim.

const fmt = (level, args) => {
  const ts = new Date().toISOString()
  return [`[${ts}] [${level}]`, ...args]
}

const log = {
  info: (...args) => console.info(...fmt('info', args)),
  warn: (...args) => console.warn(...fmt('warn', args)),
  error: (...args) => console.error(...fmt('error', args)),
  debug: (...args) => console.debug(...fmt('debug', args)),
  verbose: (...args) => console.log(...fmt('verbose', args)),
  silly: (...args) => console.log(...fmt('silly', args)),
  log: (...args) => console.log(...fmt('log', args)),

  // electron-log exposes nested config objects; v1.2.3 renderer
  // accesses log.transports.console.level. Provide enough of the
  // shape that property reads + writes are no-ops without throws.
  transports: {
    console: { level: 'info' },
    file: { level: false },
    remote: { level: false },
    ipc: { level: false }
  },
  functions: {},

  // electron-log/renderer's catchErrors hook. Renderer wires it once
  // in bootstrap.js. No-op shim — the M-001 panic_hook already covers
  // unhandled-rejection capture at the Rust side.
  catchErrors: () => {},

  // Some call sites do `log.error.bind(log)` etc. Bound methods stay
  // functional with the simple console fallthrough above.
  variables: {},

  // electron-log's `create()` factory used by some libraries.
  create: () => log
}

export default log
