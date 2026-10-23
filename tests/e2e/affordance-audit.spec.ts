// FILE: tests/e2e/affordance-audit.spec.ts
// VERSION: 1.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Behavioral half of the C-73 affordance audit — everything the UI advertises must visibly respond when used: desktop chords pressed as real keys, every registry leaf command dispatched through the mt::menu-invoked bridge, and welcome-screen action buttons.
//   SCOPE: Real-key presses on the booted Muya surface; menu-bridge walk over registry leaf ids parsed from source; welcome action-button responses. Static advertised-chord ↔ route agreement lives in tests/renderer/commands/shortcut-routing-audit.test.js.
//   DEPENDS: Playwright, renderer-only Tauri shim (__emitFakeEvent reaches the menu bridge through window.electron.ipcRenderer.on), editor boot helpers, src/renderer/src/commands/index.js and src-tauri/src/m009_menu.rs read for id extraction.
//   LINKS: .grace/graph/runtime.xml M-009, M-012; .grace/verification/runtime.xml V-M-009, V-M-012; docs/release-trains/2.5.x-next.md FIX-005/FIX-006/FIX-009/FIX-010; .grace/changes/active/C-73.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MOD - Platform modifier name for Playwright key presses (Meta on darwin, Control elsewhere).
//   ROOT - repository root resolved from this spec for source reads.
//   registryLeafIds - Leaf command ids parsed from commands/index.js (parents and platform-excluded macOS-only leaves are excluded).
//   registryAdvertisedChords - { id, keys } for every shortcut: array in the registry (darwin branch), driving the pressed-chord cases.
//   Snapshot - Response counters captured before an action (bus calls, mutations, invokes, state digest).
//   installResponseRecorder - Wraps the app bus emit, counts body mutations, opts into the shim invoke log and exposes a state digest.
//   snapshot - Capture the current response counters.
//   waitForResponse - Poll until any counter moved past a snapshot, up to a timeout.
//   resetBusLog - Clear the recorded bus events between dispatches.
//   bootWithDocument - Boot the editor with a three-paragraph document and the recorder installed.
//   focusFirstParagraph - Click the first paragraph span to focus the WYSIWYG surface.
//   dispatchMenuId - Emits mt::menu-invoked through the shim and returns the listener count (0 means the bridge never installed).
//   nativeRiddenIds - Registry ids whose chord rides a native m009 accelerator and therefore cannot be pressed in a browser.
//   NO_RESPONSE_ALLOWLIST - Registry ids whose execution legitimately cannot show a response in the browser harness, each with a reason.
//   EXPECTED_BRIDGE_WARNINGS - Already-tracked bridge-warning findings (help.rate capability gate); anything new fails the walk.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.1 - 2026-10-20 FIX-010 review: exclude the explicitly macOS-only registry leaf from non-Darwin bridge walks.
//   PREV: v1.1.0 - 2026-10-20 FIX-010/FIX-012: Shift+Meta+P opens the populated root Command Palette on macOS; tab cycling after opening the Guide must keep render ancestry valid.
//   v1.0.0 - C-73: initial audit — desktop keydown/zoom chords as real key presses with generic response detection (bus event, DOM mutation, invoke or state digest), menu-bridge walk over all registry leaves, welcome action-button responses; the FIX-009 Last-session case lands as fixme until its repair ships.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from './fixtures/tauri-shim'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ─── source extraction (Node side) ────────────────────────────────

const registryLeafIds = (): string[] => {
  const js = readFileSync(resolve(ROOT, 'src/renderer/src/commands/index.js'), 'utf-8')
  const lines = js.split('\n')
  const ids: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*id:\s*'([^']+)'/)
    if (!m || m[1] === '#') continue
    // A parent declares subcommands shortly after its own id; its
    // behavior needs a value payload, so the walk skips parents.
    const isParent = lines.slice(i, i + 10).some((l) => /^\s*subcommands:/.test(l))
    if (!isParent) ids.push(m[1])
  }
  return ids.filter((id) => process.platform === 'darwin' || id !== 'view.command-palette')
}

const registryAdvertisedChords = (): Array<{ id: string, keys: string[] }> => {
  const js = readFileSync(resolve(ROOT, 'src/renderer/src/commands/index.js'), 'utf-8')
  const lines = js.split('\n')
  const out: Array<{ id: string, keys: string[] }> = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*shortcut:\s*\[/.test(lines[i])) continue
    const inner = lines[i].slice(lines[i].indexOf('[') + 1, lines[i].lastIndexOf(']'))
    const keys: string[] = []
    for (const token of inner.split(',')) {
      const t = token.trim()
      if (t === "isOsx ? 'Cmd' : 'Ctrl'") keys.push(MOD)
      else {
        const m = t.match(/^'([^']+)'$/)
        if (m) keys.push(m[1])
      }
    }
    for (let j = i; j >= Math.max(i - 12, 0); j--) {
      const idm = lines[j].match(/^\s*id:\s*'([^']+)'/)
      if (idm) {
        out.push({ id: idm[1], keys })
        break
      }
    }
  }
  return out
}

// ─── response recorder (page side) ────────────────────────────────

interface Snapshot {
  bus: number
  mutations: number
  invokes: number
  digest: string
}

const installResponseRecorder = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const w = window as any
    // Opt into the shim's invoke-order trace.
    w.__invokeLog = w.__invokeLog || []
    w.__affordance = { bus: [] as string[], mutations: 0 }
    // Wrap the app bus singleton's emit — every listener still fires.
    if (w.__bus?.emit) {
      const original = w.__bus.emit.bind(w.__bus)
      w.__bus.emit = (name: string, ...args: unknown[]) => {
        w.__affordance.bus.push(String(name))
        return original(name, ...args)
      }
    }
    new MutationObserver((records) => {
      w.__affordance.mutations += records.length
    }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })
  })
}

const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const w = window as any
    const app = document.querySelector('#app') as any
    let digest = ''
    try {
      digest = JSON.stringify(app.__vue_app__.config.globalProperties.$pinia.state.value).length + ':' +
        Object.keys(app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile ?? {}).length
    } catch { digest = 'n/a' }
    return {
      bus: w.__affordance?.bus.length ?? 0,
      mutations: w.__affordance?.mutations ?? 0,
      invokes: w.__invokeLog?.length ?? 0,
      digest
    }
  })

const waitForResponse = async (page: Page, before: Snapshot, timeout = 2500): Promise<boolean> => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const now = await snapshot(page)
    if (now.bus > before.bus || now.mutations > before.mutations || now.invokes > before.invokes || now.digest !== before.digest) {
      return true
    }
    await page.waitForTimeout(100)
  }
  return false
}

const resetBusLog = (page: Page): Promise<void> =>
  page.evaluate(() => { (window as any).__affordance.bus.length = 0 })

// ─── shared boot ──────────────────────────────────────────────────

const bootWithDocument = async (page: Page): Promise<void> => {
  await installTauriShim(page)
  await page.addInitScript(() => {
    const w = window as any
    w.__mockInvoke = { ...(w.__mockInvoke || {}), mt_prefs_set: () => null }
  })
  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: false,
      markdownList: ['# Audit title\n\nfirst paragraph\n\nsecond paragraph'],
      lineEnding: 'lf',
      sideBarVisibility: false,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })
  await page.locator('.editor-with-tabs').waitFor({ state: 'visible', timeout: 15_000 })
  await installResponseRecorder(page)
}

const focusFirstParagraph = async (page: Page): Promise<void> => {
  await page.locator('#ag-editor-id span.ag-paragraph').first().click()
}

const dispatchMenuId = (page: Page, id: string): Promise<number> =>
  page.evaluate((menuId) => (window as any).__emitFakeEvent('mt::menu-invoked', menuId), id)

// ─── the audit ────────────────────────────────────────────────────

// Registry leaves whose execution legitimately cannot show a response
// in the browser harness. Every entry needs a reason; the default for
// a leaf is "must respond". Trim entries when the harness learns the
// surface, not when a command breaks.
const NO_RESPONSE_ALLOWLIST: Record<string, string> = {
  'file.open-file': 'opens the native file dialog; the shim invoke returns null with no renderer surface',
  // C-MULTI-SOURCE-WORKSPACE: the retired overloaded open-folder id is
  // replaced by the explicit Add Folder… / Replace Workspace… pair — both
  // open the native folder picker (no renderer surface in the shim).
  'file.add-folder': 'opens the native folder dialog; the shim invoke returns null with no renderer surface',
  'file.replace-workspace': 'opens the native folder dialog; the shim invoke returns null with no renderer surface',
  'help.rate': 'capability-gated (m048 review=false): applyCapabilityGate prunes it in this harness, mirroring the cfg-gated native menu item in non-MAS builds',
  'file.reopen-closed-tab': 'empty closed-tab history is the owner-approved quiet no-op (FIX-009); the walk boots a fresh document, so the strip button and reopen transport never engage'
}

// Bridge warnings that are already-tracked findings. A NEW warning
// fails the walk; removing the underlying defect removes its entry.
const EXPECTED_BRIDGE_WARNINGS: Record<string, string> = {
  'help.rate': 'no-command warning from the capability gate (see NO_RESPONSE_ALLOWLIST)'
}

// Chords whose route is the native menu accelerator cannot be pressed
// in a browser (no OS menu); their bridge dispatch is covered by the
// walk below instead. Everything else advertised must survive a real
// key press. Derived: native accelerator ids parsed from m009.
const nativeRiddenIds = (): Set<string> => {
  const rust = readFileSync(resolve(ROOT, 'src-tauri/src/m009_menu.rs'), 'utf-8')
  const ids = new Set<string>()
  let currentId: string | null = null
  for (const line of rust.split('\n')) {
    const idm = line.match(/^\s*id:\s*"([^"]+)"/)
    if (idm) { currentId = idm[1]; continue }
    if (line.match(/^\s*accelerator:\s*Some\("/) && currentId) { ids.add(currentId); currentId = null; continue }
    const bid = line.match(/with_id\("([^"]+)"/)
    if (bid) { currentId = bid[1]; continue }
    if (line.match(/^\s*\.accelerator\("/) && currentId) { ids.add(currentId); currentId = null }
  }
  return ids
}

test.describe('affordance audit — desktop chords (C-73)', () => {
  test('every non-native advertised chord responds to a real key press', async ({ page }) => {
    await bootWithDocument(page)
    const native = nativeRiddenIds()
    const pressable = registryAdvertisedChords().filter(
      (c) => !native.has(c.id) && c.keys.length > 0
    )
    // Population guard: the extractor must keep finding the paragraph
    // family (the zoom family rides native accelerators and is covered
    // by the bridge walk instead), or this audit passes vacuously.
    expect(pressable.map((c) => c.id)).toEqual(expect.arrayContaining([
      'edit.duplicate', 'edit.create-paragraph', 'edit.delete-paragraph',
      'paragraph.heading-1', 'paragraph.heading-6'
    ]))
    expect(pressable.length).toBeGreaterThanOrEqual(9)

    for (const chord of pressable) {
      await focusFirstParagraph(page)
      await resetBusLog(page)
      const before = await snapshot(page)
      await page.keyboard.press(chord.keys.join('+'))
      const responded = await waitForResponse(page, before)
      expect(responded, `${chord.id} (${chord.keys.join('+')}) produced no visible response`).toBe(true)
    }
  })

  test('duplicate and heading chords change the document markdown', async ({ page }) => {
    await bootWithDocument(page)
    const markdown = (): Promise<string> =>
      page.evaluate(() => {
        const app = document.querySelector('#app') as any
        return app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown
      })

    // Target the paragraph by text: the first .ag-paragraph is the H1
    // block itself, and transforming it would assert the wrong thing.
    await page.locator('#ag-editor-id span.ag-paragraph', { hasText: 'first paragraph' }).first().click()
    await page.keyboard.press(`${MOD}+2`)
    await expect.poll(markdown, { timeout: 3000 }).toContain('## first paragraph')

    await page.locator('#ag-editor-id span.ag-paragraph', { hasText: 'first paragraph' }).first().click()
    await page.keyboard.press(`Shift+${MOD}+D`)
    await expect.poll(markdown, { timeout: 3000 }).toContain('## first paragraph\n\n## first paragraph')
  })

  test('Shift+Command+P opens and closes the root Command Palette (FIX-010)', async ({ page }) => {
    test.skip(process.platform !== 'darwin', 'FIX-010 is intentionally scoped to macOS')
    await bootWithDocument(page)
    await focusFirstParagraph(page)

    await page.keyboard.press('Shift+Meta+P')
    const palette = page.locator('.command-palette input.search')
    await expect(palette).toBeVisible()
    await expect(page.locator('.command-palette .commands li')).not.toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })
})

test.describe('affordance audit — menu bridge walk (C-73)', () => {
  test('every registry leaf dispatched through mt::menu-invoked responds or is allowlisted', async ({ page }) => {
    await bootWithDocument(page)

    const bridgeWarnings: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[menu-bridge]')) bridgeWarnings.push(text)
    })

    const leaves = registryLeafIds()
    // Population guard: the registry must yield a substantial walk.
    expect(leaves.length).toBeGreaterThanOrEqual(40)

    const silent: string[] = []
    for (const id of leaves) {
      await resetBusLog(page)
      const before = await snapshot(page)
      const listeners = await dispatchMenuId(page, id)
      expect(listeners, `menu bridge listener missing for ${id}`).toBeGreaterThan(0)
      const responded = await waitForResponse(page, before, 2000)
      if (!responded && !NO_RESPONSE_ALLOWLIST[id]) silent.push(id)
      await page.waitForTimeout(50)
    }
    expect(silent, 'leaf commands with no observable response').toEqual([])

    const warnedFor = bridgeWarnings.map((w) => {
      const m = w.match(/menu id "([^"]+)"|command "([^"]+)"/)
      return m ? (m[1] ?? m[2]) : w
    })
    const unexpected = warnedFor.filter((id) => !EXPECTED_BRIDGE_WARNINGS[id])
    expect(unexpected, `new menu-bridge warnings during the walk:\n${bridgeWarnings.join('\n')}`).toEqual([])
  })

  test('Guide then tab cycling keeps active-block ancestry renderable (FIX-012)', async ({ page }) => {
    await bootWithDocument(page)
    const bridgeWarnings: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[menu-bridge]')) bridgeWarnings.push(text)
    })

    await dispatchMenuId(page, 'file.new-tab')
    await dispatchMenuId(page, 'help.guide')
    await page.waitForTimeout(100)
    await dispatchMenuId(page, 'tabs.cycleForward')
    await page.waitForTimeout(100)

    expect(bridgeWarnings).toEqual([])
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
  })
})

test.describe('affordance audit — welcome actions (C-73)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      const w = window as any
      w.__mockInvoke = {
        ...(w.__mockInvoke || {}),
        mt_prefs_set: () => null,
        mt_prefs_get: (args: any) => {
          if (args?.key === 'lastSessionTabs') return ['/tmp/one.md', '/tmp/two.md']
          return null
        },
        mt_recent_list: () => [
          '/tmp/mark-e2e/docs/launch-plan.md',
          '/tmp/mark-e2e/docs/architecture.md'
        ],
        mt_fs_stat: () => ({
          isFile: true, isDirectory: false, size: 128, mode: 0,
          mtimeMs: Date.now() - 3 * 60 * 1000, isSymbolicLink: false
        })
      }
      w.__invokeLog = []
    })
    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })
    // No document + no blank tab → the welcome screen mounts.
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: false,
        markdownList: [],
        lineEnding: 'lf',
        sideBarVisibility: false,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false
      })
    })
    await page.locator('.welcome-screen').waitFor({ state: 'visible', timeout: 15_000 })
    await installResponseRecorder(page)
  })

  test('New, Open File and Open Folder buttons each attempt their action', async ({ page }) => {
    const buttons = page.locator('.welcome-screen .action-button')
    await expect(buttons).toHaveCount(3)

    // Open File / Open Folder attempt their native dialog invoke —
    // the attempt itself is the advertised affordance firing, and the
    // welcome surface stays mounted while the shim returns null. The
    // folder picker resolves through a dynamic import, so the response
    // check polls instead of reading the log synchronously.
    for (const index of [0, 1]) {
      const before = await snapshot(page)
      await buttons.nth(index).click()
      const responded = await waitForResponse(page, before)
      expect(responded, `action button ${index} produced no response`).toBe(true)
    }

    // New creates a real untitled tab and leaves the welcome screen —
    // run it last so the clicks above keep their target.
    const before = await snapshot(page)
    await buttons.nth(2).click()
    expect(await waitForResponse(page, before), 'New button produced no response').toBe(true)
  })

  // FIX-009 (2026-10-20, open): after closing every tab, clicking
  // "Last session" on the welcome screen does nothing. Un-skip when
  // the FIX-009 repair lands; the case stays visible here so the
  // regression net remembers the defect class.
  test.fixme('Last session row restores the closed session (FIX-009)', async ({ page }) => {
    const sessionRow = page.locator('.welcome-screen .row-session')
    await expect(sessionRow.locator('.row-name')).toHaveText('Last session')
    await sessionRow.click()
    await page.locator('.editor-with-tabs').waitFor({ state: 'visible', timeout: 5000 })
  })
})
