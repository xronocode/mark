// MODULE_CONTRACT
//   PURPOSE: M-008 frontend fonts facade. List system fonts for the
//            renderer font-picker (theme + editor + UI font prefs).
//   SCOPE:   list only.
//   DEPENDS: M-013a contract.
//   LINKS:   docs/development-plan.xml Phase-B3 step-6.
//   STATUS:  Phase-B3 step-6 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-6: initial facade.

import { ipcInvoke } from '../contract'

export const ipcFonts = {
  list(): Promise<string[]> {
    return ipcInvoke('mt::fonts::list', {})
  }
}

export type IpcFonts = typeof ipcFonts
