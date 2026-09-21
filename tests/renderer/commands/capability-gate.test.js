/**
 * C-15 T-M5 — applyCapabilityGate prunes sandbox-hostile commands from the
 * registry in app-store builds. Pins: PDF export and screenshot removal;
 * ordinary commands survive. (Mock pattern mirrors index.test.js — the
 * commands module pulls window.electron-dependent utils at import time.)
 */
vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: true,
  isWindows: false,
  isLinux: false
}))

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { describe, it, expect, vi } from 'vitest'
import commands, { applyCapabilityGate } from '@/commands'

describe('capability gate', () => {
  it('drops only sandbox-hostile command ids', () => {
    const walk = (l) => {
      const ids = []
      for (const c of l) {
        if (c.id) ids.push(c.id)
        if (Array.isArray(c.subcommands)) ids.push(...walk(c.subcommands))
      }
      return ids
    }
    const before = walk(commands)
    expect(before).toContain('file.export-file-pdf')
    expect(before).toContain('edit.screenshot')
    expect(before).toContain('file.new-tab')

    applyCapabilityGate({
      mode: 'app-store',
      exportPandoc: false,
      screenshot: false,
      setDefaultHandler: false,
      projectSearchRipgrep: false,
      updater: false
    })

    const after = walk(commands)
    expect(after).not.toContain('file.export-file-pdf')
    expect(after).not.toContain('edit.screenshot')
    expect(after).toContain('file.new-tab')
    expect(after).toContain('edit.copy-as-html')
  })
})
