// FILE: tests/renderer/chrome/mica-window.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-38 T-007 N4 e Mica bridge — the boot state query installing/removing the mica-active root class (true / false / rejecting / malformed answers), the theme re-tint invoking mt_window_set_mica_theme only while active (and retiring the class on a mica:false answer), the app.vue wiring, and that every transparency rule in the stylesheets lives under .mica-active.
//   SCOPE: Unit tests over util/micaWindow.js with the global @tauri-apps/api/core mock, plus static reads of assets/styles/index.css and pages/app.vue.
//   DEPENDS: Vitest (globals), jsdom document root, the setup.ts invoke mock.
//   LINKS: .grace/verification/runtime.xml V-M-058; .grace/graph/runtime.xml M-058.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   readSource - reads a renderer source file for the static wiring/CSS pins.
//   resetMica - deactivate the module + strip the root class before each test.
//   invokeCallsFor - invoke mock calls filtered by command name.
//   rootHasClass - whether <html> carries the mica-active class.
//   backgroundRulesTouching - stylesheet rules that set a background on a given selector.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-38 T-007 initial pins.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { invoke } from '@tauri-apps/api/core'
import {
  MICA_ROOT_CLASS,
  deactivateMicaWindowEffect,
  installMicaWindowEffect,
  isMicaActive,
  syncMicaTheme
} from '@/util/micaWindow'

// CRLF-normalised for the Windows CI checkout.
const readSource = (relative) =>
  readFileSync(resolve(__dirname, '../../../src/renderer/src', relative), 'utf8').replace(/\r\n/g, '\n')

const resetMica = () => {
  deactivateMicaWindowEffect()
  document.documentElement.classList.remove(MICA_ROOT_CLASS)
}

const invokeCallsFor = (cmd) =>
  invoke.mock.calls.filter(([name]) => name === cmd)

const rootHasClass = () => document.documentElement.classList.contains(MICA_ROOT_CLASS)

// Every rule block that paints one of the full-window surfaces and
// mentions a background longhand — each must be scoped under
// .mica-active or it would leak transparency into the default look.
const backgroundRulesTouching = (css, selector) =>
  (css.match(new RegExp(String.raw`[^{}]*\.${selector}[^{}]*\{[^}]*background[^}]*\}`, 'g')) || [])
    .filter((block) => /background(-color)?:\s*(?!var\()/.test(block))

describe('mica window bridge (C-38 T-007 N4 e)', () => {
  beforeEach(() => {
    resetMica()
    invoke.mockImplementation(async () => undefined)
  })

  describe('boot state query installs the root class only on confirmed mica:true', () => {
    it('adds mica-active and reports active when the backend confirms the effect', async () => {
      invoke.mockImplementation(async (cmd) => {
        if (cmd === 'mt_window_effects_state') return { mica: true }
        return undefined
      })
      await expect(installMicaWindowEffect()).resolves.toBe(true)
      expect(rootHasClass()).toBe(true)
      expect(isMicaActive()).toBe(true)
      expect(invokeCallsFor('mt_window_effects_state')).toHaveLength(1)
    })

    it('adds nothing when the backend reports mica:false (Windows 10 / macOS / Linux)', async () => {
      invoke.mockImplementation(async () => ({ mica: false }))
      await expect(installMicaWindowEffect()).resolves.toBe(false)
      expect(rootHasClass()).toBe(false)
      expect(isMicaActive()).toBe(false)
    })

    it('adds nothing when the invoke rejects (missing/failed command)', async () => {
      invoke.mockImplementation(async () => {
        throw new Error('ipc gone')
      })
      await expect(installMicaWindowEffect()).resolves.toBe(false)
      expect(rootHasClass()).toBe(false)
      expect(isMicaActive()).toBe(false)
    })

    it('adds nothing on a malformed answer and strips a stale class on re-run', async () => {
      invoke.mockImplementation(async () => undefined)
      await expect(installMicaWindowEffect()).resolves.toBe(false)
      expect(rootHasClass()).toBe(false)

      // A later boot cycle that flips to inactive must remove the class
      // (idempotent both ways).
      invoke.mockImplementation(async () => ({ mica: true }))
      await expect(installMicaWindowEffect()).resolves.toBe(true)
      expect(rootHasClass()).toBe(true)
      invoke.mockImplementation(async () => ({ mica: false }))
      await expect(installMicaWindowEffect()).resolves.toBe(false)
      expect(rootHasClass()).toBe(false)
      expect(isMicaActive()).toBe(false)
    })
  })

  describe('theme re-tint runs only while the effect is active', () => {
    it('does not invoke mt_window_set_mica_theme when inactive', async () => {
      invoke.mockImplementation(async () => ({ mica: false }))
      await installMicaWindowEffect()
      await expect(syncMicaTheme(true)).resolves.toBe(false)
      expect(invokeCallsFor('mt_window_set_mica_theme')).toHaveLength(0)
    })

    it('re-tints with the app-theme darkness when active', async () => {
      invoke.mockImplementation(async () => ({ mica: true }))
      await installMicaWindowEffect()

      await expect(syncMicaTheme(true)).resolves.toBe(true)
      expect(invokeCallsFor('mt_window_set_mica_theme')).toEqual([
        ['mt_window_set_mica_theme', { dark: true }]
      ])
      expect(rootHasClass()).toBe(true)

      await expect(syncMicaTheme(false)).resolves.toBe(true)
      expect(invokeCallsFor('mt_window_set_mica_theme')).toHaveLength(2)
      expect(invoke.mock.calls.at(-1)).toEqual(['mt_window_set_mica_theme', { dark: false }])
    })

    it('retires the class when the backend answers mica:false (effect lost)', async () => {
      invoke.mockImplementation(async () => ({ mica: true }))
      await installMicaWindowEffect()

      invoke.mockImplementation(async () => ({ mica: false }))
      await expect(syncMicaTheme(true)).resolves.toBe(false)
      expect(rootHasClass()).toBe(false)
      expect(isMicaActive()).toBe(false)

      // Subsequent theme changes no longer reach the backend.
      invoke.mockClear()
      await syncMicaTheme(true)
      expect(invokeCallsFor('mt_window_set_mica_theme')).toHaveLength(0)
    })

    it('keeps the class when the re-tint invoke rejects (transient failure)', async () => {
      invoke.mockImplementation(async () => ({ mica: true }))
      await installMicaWindowEffect()

      invoke.mockImplementation(async () => {
        throw new Error('busy')
      })
      await expect(syncMicaTheme(true)).resolves.toBe(false)
      expect(rootHasClass()).toBe(true)
      expect(isMicaActive()).toBe(true)
    })
  })

  describe('app.vue wiring (boot + theme watcher)', () => {
    it('boots through installMicaWindowEffect and syncs the theme watcher', () => {
      const source = readSource('pages/app.vue')
      // Boot: detached install, then the initial re-tint to the hydrated theme.
      expect(source).toContain('installMicaWindowEffect().then(() =>')
      expect(source).toContain('syncMicaTheme(isDarkTheme(preferencesStore.theme))')
      // Theme changes: the same watcher that applies the CSS re-tints Mica.
      expect(source).toContain('void syncMicaTheme(isDarkTheme(value))')
      // The module is the only Mica entry point.
      expect(source).toContain("from '@/util/micaWindow'")
    })
  })

  describe('transparency CSS exists only under .mica-active', () => {
    const css = readSource('assets/styles/index.css')

    it('keys every mica rule on the root class with :root specificity', () => {
      expect(css).toMatch(
        /:root\.mica-active body,\s*\n:root\.mica-active \.editor-container,\s*\n:root\.mica-active \.editor-placeholder \{\s*\n\s*background-color: transparent;/
      )
      expect(css).toMatch(/:root\.mica-active \.side-bar \{\s*\n\s*background-color: transparent;/)
      expect(css).toMatch(/:root\.mica-active \.title-bar-editor-bg \{\s*\n\s*background: transparent;/)
    })

    it('keeps the editor/sidebar surfaces opaque below the title-bar strip', () => {
      // Two bottom-anchored gradients (container cluster + sidebar) that
      // skip exactly the title-bar height: the below-strip paint keeps
      // today's colours, only the strip opens for the material.
      const strips = css.match(
        /background-size: 100% calc\(100% - var\(--titleBarHeight\)\);/g
      )
      expect(strips).toHaveLength(2)
      expect(css.match(/linear-gradient\(var\(--editorBgColor, #ffffff\), var\(--editorBgColor, #ffffff\)\)/g)).toHaveLength(1)
      expect(css.match(/linear-gradient\(var\(--sideBarBgColor\), var\(--sideBarBgColor\)\)/g)).toHaveLength(1)
    })

    it('never paints those surfaces transparent outside a .mica-active selector', () => {
      for (const selector of ['title-bar-editor-bg', 'side-bar', 'editor-container', 'editor-placeholder']) {
        for (const block of backgroundRulesTouching(css, selector)) {
          expect(block, `${selector} background rule must be mica-gated:\n${block}`).toMatch(
            /\.mica-active/
          )
        }
      }
      // The document root itself only goes transparent under the class.
      for (const block of css.match(/:root[^{}]*\{[^}]*background[^}]*\}/g) || []) {
        if (/background(-color)?:\s*(transparent|rgba\(0, ?0, ?0, ?0\))/.test(block)) {
          expect(block).toContain('.mica-active')
        }
      }
    })
  })
})
