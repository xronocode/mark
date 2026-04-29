// MODULE_CONTRACT
//   PURPOSE: M-006/M-007/M-009/M-015/M-016/M-018/M-019 frontend
//            facades batched. Thin Promise wrappers over typed
//            ipcInvoke for each module's commands.
//   SCOPE:   shortcuts / spell / menu / pandoc / updater / screenshot /
//            secrets. fs/watch/search/prefs/workspace/fonts/recent live
//            in their own files.
//   DEPENDS: M-013a contract.
//   LINKS:   docs/development-plan.xml Phase-B3 step-4..12.
//   STATUS:  Phase-B3 step-12 — facade roll-up.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-12: initial facade batch.

import { ipcInvoke } from '../contract'

export const ipcShortcut = {
  register(command: string, accelerator: string): Promise<void> {
    return ipcInvoke('mt::shortcut::register', { command, accelerator })
  },
  unregister(command: string): Promise<void> {
    return ipcInvoke('mt::shortcut::unregister', { command })
  },
  list(): Promise<Array<{ command: string; accelerator: { modifiers: number; key: string } }>> {
    return ipcInvoke('mt::shortcut::list', {})
  }
}

export const ipcSpell = {
  getConfig(): Promise<{ enabled: boolean; lang: string }> {
    return ipcInvoke('mt::spell::get_config', {})
  },
  setEnabled(enabled: boolean): Promise<void> {
    return ipcInvoke('mt::spell::set_enabled', { enabled })
  },
  setLang(lang: string): Promise<void> {
    return ipcInvoke('mt::spell::set_lang', { lang })
  }
}

export interface MenuItem {
  id: string
  label: string
  command: string | null
  accelerator: string | null
  items: MenuItem[] | null
}

export const ipcMenu = {
  taxonomy(): Promise<MenuItem[]> {
    return ipcInvoke('mt::menu::taxonomy', {}) as Promise<MenuItem[]>
  }
}

export const ipcPandoc = {
  status(): Promise<{ available: boolean; version: string | null; path: string | null }> {
    return ipcInvoke('mt::pandoc::status', {})
  },
  export(input: string, format: string): Promise<Uint8Array> {
    return ipcInvoke('mt::pandoc::export', { input, format })
  }
}

export const ipcUpdater = {
  check(): Promise<{
    currentVersion: string
    available: boolean
    latestVersion: string | null
    downloadUrl: string | null
    statusNote: string | null
  }> {
    return ipcInvoke('mt::updater::check', {})
  }
}

export const ipcScreenshot = {
  capture(mode?: 'interactive' | 'window' | 'main'): Promise<Uint8Array> {
    return ipcInvoke('mt::screenshot::capture', {
      options: mode ? { mode } : {}
    })
  }
}

export const ipcSecret = {
  set(key: string, value: string): Promise<void> {
    return ipcInvoke('mt::secret::set', { key, value })
  },
  get(key: string): Promise<string | null> {
    return ipcInvoke('mt::secret::get', { key })
  },
  delete(key: string): Promise<void> {
    return ipcInvoke('mt::secret::delete', { key })
  }
}

export type IpcShortcut = typeof ipcShortcut
export type IpcSpell = typeof ipcSpell
export type IpcMenu = typeof ipcMenu
export type IpcPandoc = typeof ipcPandoc
export type IpcUpdater = typeof ipcUpdater
export type IpcScreenshot = typeof ipcScreenshot
export type IpcSecret = typeof ipcSecret
