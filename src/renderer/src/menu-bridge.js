// MODULE_CONTRACT
//   PURPOSE: Bridge `mt::menu-invoked` events emitted by the Tauri
//            backend's on_menu_event handler (m009_menu.rs +
//            main.rs Builder.on_menu_event) to the renderer's static
//            command registry in `src/renderer/src/commands/index.js`.
//   SCOPE:   Listen on `mt::menu-invoked`, look up the command by id
//            (depth-first walk including subcommands), invoke its
//            `execute()`. Logs an error if no matching id is found.
//   DEPENDS: window.electron.ipcRenderer.on (provided by
//            _shims/install-window-globals.js — must be loaded
//            BEFORE this module).
//   LINKS:   docs/development-plan.xml Phase-B4-pre-alpha step-1
//            (closes F-MENU-WIRE-TAURI together with backend changes
//            in src-tauri/src/m009_menu.rs + main.rs).
//
// CHANGE_SUMMARY:
//   - 2026-05-08 B4-pre-alpha-step-1: initial bridge.

import staticCommands from './commands'

const findCommandById = (commands, id) => {
  for (const c of commands) {
    if (c?.id === id) return c
    if (Array.isArray(c?.subcommands)) {
      const nested = findCommandById(c.subcommands, id)
      if (nested) return nested
    }
  }
  return null
}

export const installMenuBridge = () => {
  const ipc = window?.electron?.ipcRenderer
  if (!ipc?.on) {
    console.warn('[menu-bridge] window.electron.ipcRenderer.on missing — skipping')
    return
  }

  ipc.on('mt::menu-invoked', async (_event, payload) => {
    // Backend emits the id as a plain string; defensive against
    // shape evolution (some Tauri versions wrap into {id}).
    const id =
      typeof payload === 'string'
        ? payload
        : typeof payload?.id === 'string'
          ? payload.id
          : ''
    if (!id) {
      console.warn('[menu-bridge] received menu event with no id', payload)
      return
    }

    const command = findCommandById(staticCommands, id)
    if (!command) {
      console.warn(`[menu-bridge] no command for menu id "${id}" — ignoring`)
      return
    }
    if (typeof command.execute !== 'function') {
      console.warn(`[menu-bridge] command "${id}" has no execute() — ignoring`)
      return
    }
    try {
      await command.execute()
    } catch (e) {
      console.error(`[menu-bridge] command "${id}" execute failed:`, e)
    }
  })
}
