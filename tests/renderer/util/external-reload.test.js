// @vitest-environment node
// FILE: tests/renderer/util/external-reload.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Characterize the C-EXTERNAL-RELOAD-OPERATION owner module through injected fakes: the admission policy matrix, ready-data and disk admission, the single settle/read mechanism, the confirmation lifecycle, attempt identity binding, the replacement manifest and the synchronous commit pins — with mutation controls proving stale, declined and skipped attempts leave the tab untouched.
//   SCOPE: src/renderer/src/util/externalReload.js only (RELOAD_PERMISSIONS, SETTLE_DELAY_MS, decideAdmission, buildReplacementManifest, commitReplacement, readWithSettle, createExternalReloadController). No Pinia, no muya, no module mocks — the owner takes plain fakes.
//   DEPENDS: src/renderer/src/util/externalReload.js, vitest.
//   LINKS: .grace/changes/active/C-EXTERNAL-RELOAD-OPERATION; tests/renderer/store/live-reload.test.js and live-reload-snapshots.test.js (store-level reused evidence of preserved behavior).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PATH - the fixture pathname shared by attempts and changes.
//   tokenSeq - counter minting unique document tokens per built state.
//   fakeBuildSingleFileState - deterministic injected state builder.
//   readyData - build a ready-data change payload.
//   diskChange - build a disk-source change payload.
//   makeTab - plain tab fixture with the fields the owner reads or writes.
//   makeDeps - injected fake dep set: manual-flush settle scheduler, controlled read promise, spies for log/bus/recorders/notify/t and a fresh-state builder honouring the getSingleFileState contract.
//   makeStore - plain store double: tabs, currentFile, pushTabNotification and APPLY_FILE_CHANGE spies.
//   makeAttempt - store-shaped attempt: generation + exact path + dispatch-time filename + isLive/localContentChanged closures over a mutable generations map and the store's tabs array.
//   flushMicrotasks - deterministic drain of the read/commit continuation chain.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.0.0 - 2026-11-20 C-EXTERNAL-RELOAD-OPERATION: initial focused suite for the extracted reload owner.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import {
  RELOAD_PERMISSIONS,
  SETTLE_DELAY_MS,
  decideAdmission,
  buildReplacementManifest,
  commitReplacement,
  readWithSettle,
  createExternalReloadController
} from '@/util/externalReload'

// ─── fixtures ─────────────────────────────────────────────────────────

const PATH = '/tmp/test.md'

function makeTab(overrides = {}) {
  return {
    id: 'tab-1',
    pathname: PATH,
    filename: 'test.md',
    markdown: '# original',
    isSaved: true,
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 3,
    isMixedLineEndings: false,
    contentRevision: 0,
    history: { stack: [], index: -1, lastEditIndex: -1 },
    cursor: { line: 5, ch: 10 },
    scrollTop: 42,
    muyaIndexCursor: null,
    notifications: [],
    blocks: [{ key: 'stale-block' }],
    splitSession: null,
    previewMode: false,
    watchMode: false,
    ...overrides
  }
}

let tokenSeq = 0

// Mirrors the store's real builder contract (store/help.js getSingleFileState):
// fresh defaults, fresh documentToken, text/format checkpoints set to the
// incoming content, lastSavedHistoryId -1.
function fakeBuildSingleFileState({ markdown, filename, pathname, options }) {
  return {
    contentRevision: 0,
    savedMarkdown: markdown,
    savedFormat: Object.freeze({ encoding: 'utf8', isBom: false, lineEnding: 'lf', finalNewline: 3 }),
    requiresExplicitSave: false,
    isSaved: true,
    pathname,
    filename,
    markdown,
    encoding: { ...(options.encoding ?? { encoding: 'utf8', isBom: false }) },
    lineEnding: options.lineEnding,
    adjustLineEndingOnSave: options.adjustLineEndingOnSave,
    trimTrailingNewline: options.trimTrailingNewline,
    history: { stack: [], index: -1 },
    cursor: null,
    notifications: [],
    documentToken: `tok-${++tokenSeq}`,
    lastSavedHistoryId: -1
  }
}

function makeDeps() {
  const pendingSettle = []
  let readControl = null
  const deps = {
    // One controlled read promise per call — tests resolve/reject explicitly.
    read: vi.fn(() => new Promise((resolve, reject) => {
      readControl = { resolve, reject }
    })),
    // Manual-flush scheduler: the settle fires only when the test flushes.
    schedule: vi.fn((fn) => {
      pendingSettle.push(fn)
      return pendingSettle.length
    }),
    log: { log: vi.fn(), error: vi.fn() },
    bus: { emit: vi.fn() },
    isSamePath: (a, b) => a === b,
    buildSingleFileState: vi.fn(fakeBuildSingleFileState),
    recordPreReloadSnapshot: vi.fn(),
    recordOpenedSnapshot: vi.fn(),
    notify: vi.fn(),
    t: vi.fn((key, params) => `${key}:${JSON.stringify(params ?? null)}`)
  }
  return {
    deps,
    pendingSettle,
    flushSettle: () => {
      const fns = pendingSettle.splice(0)
      fns.forEach((fn) => fn())
    },
    resolveRead: (value) => readControl.resolve(value),
    rejectRead: (err) => readControl.reject(err)
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 25; i++) await Promise.resolve()
}

function makeStore(tab, overrides = {}) {
  return {
    tabs: overrides.tabs ?? [tab],
    currentFile: overrides.currentFile ?? tab,
    pushTabNotification: vi.fn(),
    APPLY_FILE_CHANGE: vi.fn()
  }
}

// Store-shaped attempt: the same closures APPLY_FILE_CHANGE builds, over a
// generations map and the store's live tabs array so tests can supersede,
// close/reopen or rename exactly like the store world can. Pass a shared
// `generations` map for multi-attempt scenarios — each new attempt bumps
// it, exactly like the store's liveReloadGenerations bookkeeping.
function makeAttempt({ tab, store, generation = 1, permission = RELOAD_PERMISSIONS.AUTOMATIC, pathname = tab.pathname, generations } = {}) {
  const gens = generations ?? new Map()
  gens.set(pathname, generation) // every dispatch bumps the shared map
  const reloadMarkdown = tab.markdown
  const reloadRevision = tab.contentRevision || 0
  const attempt = {
    generation,
    pathname,
    filename: tab.filename,
    permission,
    isLive: () => gens.get(pathname) === generation &&
      store.tabs.includes(tab) && tab.pathname === pathname,
    localContentChanged: () => tab.markdown !== reloadMarkdown ||
      (tab.contentRevision || 0) !== reloadRevision
  }
  return { attempt, generations: gens }
}

function readyData(markdown, overrides = {}) {
  return {
    markdown,
    filename: 'test.md',
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 3,
    isMixedLineEndings: false,
    ...overrides
  }
}

const diskChange = (pathname = PATH) => ({ pathname })

// ─── module contract ──────────────────────────────────────────────────

describe('externalReload — module contract', () => {
  it('freezes the two permission kinds with the locked values', () => {
    expect(RELOAD_PERMISSIONS).toEqual({ AUTOMATIC: 'automatic', CONFIRMED: 'confirmed' })
    expect(Object.isFrozen(RELOAD_PERMISSIONS)).toBe(true)
  })

  it('pins the single settle constant at 100ms', () => {
    expect(SETTLE_DELAY_MS).toBe(100)
  })

  it('exposes the controller factory returning the three owned operations', () => {
    const { deps } = makeDeps()
    const controller = createExternalReloadController(deps)
    expect(Object.keys(controller).sort()).toEqual([
      'applyLoadedChange',
      'buildConflictAction',
      'handleFileChange'
    ])
    expect(typeof controller.handleFileChange).toBe('function')
    expect(typeof controller.applyLoadedChange).toBe('function')
    expect(typeof controller.buildConflictAction).toBe('function')
  })
})

// ─── 1. decideAdmission — policy matrix ───────────────────────────────

describe('decideAdmission — policy matrix', () => {
  // automatic+equal skips regardless of pathname; snapshot only when
  // unequal AND pathful; confirmed always replaces.
  it.each([
    ['automatic', 'equal', true, { action: 'skip' }],
    ['automatic', 'equal', false, { action: 'skip' }],
    ['automatic', 'unequal', true, { action: 'replace', snapshot: true }],
    ['automatic', 'unequal', false, { action: 'replace', snapshot: false }],
    ['confirmed', 'equal', true, { action: 'replace', snapshot: false }],
    ['confirmed', 'equal', false, { action: 'replace', snapshot: false }],
    ['confirmed', 'unequal', true, { action: 'replace', snapshot: true }],
    ['confirmed', 'unequal', false, { action: 'replace', snapshot: false }]
  ])('%s + %s text + hasPathname=%j', (permission, relation, hasPathname, expected) => {
    const decision = decideAdmission({
      permission,
      currentText: '# current',
      incomingText: relation === 'equal' ? '# current' : '# incoming',
      hasPathname
    })
    expect(decision).toEqual(expected)
  })
})

// ─── 2. ready-data admission ──────────────────────────────────────────

describe('ready-data admission (handleFileChange, change.data present)', () => {
  const dataChange = (markdown, permission) => {
    const { deps } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab({ markdown: '# original' })
    const store = makeStore(tab)
    const { attempt } = makeAttempt({ tab, store, permission })
    const before = JSON.stringify(tab)
    return { deps, controller, tab, store, attempt, before, change: { pathname: PATH, data: readyData(markdown) } }
  }

  it('automatic + equal text: zero side effects and no BLOCK_LIVE_RELOAD log', () => {
    const { deps, controller, tab, before, change, store, attempt } = dataChange('# original', RELOAD_PERMISSIONS.AUTOMATIC)
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    expect(JSON.stringify(tab)).toBe(before)
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
    expect(deps.log.log).not.toHaveBeenCalled()
    expect(store.pushTabNotification).not.toHaveBeenCalled()
  })

  it('automatic + unequal text: BLOCK_LIVE_RELOAD(source=data), one pre-reload snapshot, commit and announce', () => {
    const { deps, controller, tab, change, store, attempt } = dataChange('# incoming', RELOAD_PERMISSIONS.AUTOMATIC)
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    expect(deps.log.log).toHaveBeenCalledWith('[editor][live_reload][BLOCK_LIVE_RELOAD path=test.md source=data]')
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledWith('tab-1', '# original')
    expect(tab.markdown).toBe('# incoming')
    expect(tab.documentToken).toMatch(/^tok-/)
    expect(tab.isSaved).toBe(true)
    expect(tab.savedMarkdown).toBe('# incoming')
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.bus.emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({
      id: 'tab-1',
      markdown: '# incoming',
      contentReloaded: true,
      renderCursor: true
    }))
  })

  it('ready metadata (filename/format) flows through the injected builder unchanged', () => {
    const { deps, controller, tab, change, store, attempt } = dataChange('# incoming', RELOAD_PERMISSIONS.AUTOMATIC)
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    expect(deps.buildSingleFileState).toHaveBeenCalledWith({
      markdown: '# incoming',
      filename: 'test.md',
      pathname: PATH,
      options: {
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 3
      }
    })
  })

  it('confirmed + equal text: replaces with a fresh state but records NO pre-reload snapshot', () => {
    const { deps, controller, tab, change, store, attempt } = dataChange('# original', RELOAD_PERMISSIONS.CONFIRMED)
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    // CONFIRMED admission is actionability-gated: handleFileChange only
    // raises the exclusive conflict choice; the commit happens inside the
    // one-shot action, where the ready-data confirmation stays synchronous.
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(store.pushTabNotification).toHaveBeenCalledTimes(1)
    const action = store.pushTabNotification.mock.calls[0][0].action
    action(true)
    expect(deps.buildSingleFileState).toHaveBeenCalledTimes(1)
    expect(tab.documentToken).toMatch(/^tok-/)
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledTimes(1)
    expect(tab.contentReloaded).toBe(true)
  })

  it('confirmed + unequal text: snapshot and replace', () => {
    const { deps, controller, tab, change, store, attempt } = dataChange('# external', RELOAD_PERMISSIONS.CONFIRMED)
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    // No snapshot before the explicit choice is made.
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    const action = store.pushTabNotification.mock.calls[0][0].action
    action(true)
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledWith('tab-1', '# original')
    expect(tab.markdown).toBe('# external')
  })

  it('a stale ready-data attempt (superseded event) is silent', () => {
    const { deps, controller, tab, change, store } = dataChange('# incoming', RELOAD_PERMISSIONS.AUTOMATIC)
    const { attempt, generations } = makeAttempt({ tab, store, permission: RELOAD_PERMISSIONS.AUTOMATIC })
    generations.set(PATH, 2) // a newer event superseded this attempt
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    expect(tab.markdown).toBe('# original')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
  })
})

// ─── 3. disk read/settle ──────────────────────────────────────────────

describe('disk read and settle (handleFileChange, watcher path)', () => {
  function diskFixture(permission = RELOAD_PERMISSIONS.AUTOMATIC, tabOverrides = {}) {
    const { deps, flushSettle, resolveRead, rejectRead } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab(tabOverrides)
    const store = makeStore(tab)
    const { attempt, generations } = makeAttempt({ tab, store, permission })
    return { deps, flushSettle, resolveRead, rejectRead, controller, tab, store, attempt, generations }
  }

  it('one settle then one read; unequal disk content snapshots and commits', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store, attempt } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    expect(deps.schedule).toHaveBeenCalledTimes(1)
    expect(deps.read).not.toHaveBeenCalled() // nothing before the settle
    flushSettle()
    await flushMicrotasks()
    expect(deps.read).toHaveBeenCalledTimes(1)
    expect(deps.read).toHaveBeenCalledWith(PATH)
    resolveRead('# from disk')
    await flushMicrotasks()
    expect(deps.schedule).toHaveBeenCalledTimes(1) // still one settle
    expect(tab.markdown).toBe('# from disk')
    expect(deps.log.log).toHaveBeenCalledWith('[editor][live_reload][BLOCK_LIVE_RELOAD path=test.md source=disk]')
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledWith('tab-1', '# original')
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledTimes(1)
  })

  it('equal disk content: BLOCK_RELOAD_SKIPPED(hash-match), no replacement, no snapshot', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store, attempt } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    resolveRead('# original')
    await flushMicrotasks()
    expect(tab.markdown).toBe('# original')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
    expect(deps.log.log).toHaveBeenCalledWith('[editor][live_reload][BLOCK_RELOAD_SKIPPED path=test.md reason=hash-match]')
  })

  it('edits during the settle window: re-dispatch through APPLY_FILE_CHANGE, no read started', async () => {
    const { deps, flushSettle, controller, tab, store, attempt } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    tab.markdown = '# typed during settle'
    tab.isSaved = false
    flushSettle()
    await flushMicrotasks()
    expect(deps.read).not.toHaveBeenCalled()
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledTimes(1)
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledWith('change', diskChange())
  })

  it('edits during the in-flight read: re-dispatch, no commit', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store, attempt } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    tab.markdown = '# typed during read'
    tab.isSaved = false
    resolveRead('# stale disk read')
    await flushMicrotasks()
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledTimes(1)
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledWith('change', diskChange())
    expect(tab.markdown).toBe('# typed during read')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
  })

  it('edit-and-save during the read: the fresh conflict resolution re-reads the new content', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store, attempt } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    tab.markdown = '# newly saved'
    tab.contentRevision = 1
    tab.isSaved = true // saved during the read window
    resolveRead('# disk before save')
    await flushMicrotasks()
    // The stale result re-enters the current conflict flow as a fresh
    // dispatch (which the store would resolve with its own new attempt).
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledTimes(1)
    expect(tab.markdown).toBe('# newly saved')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
  })

  it('a newer event before the older read completes: stale attempt stays silent', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store, attempt, generations } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    generations.set(PATH, 2) // newer event landed before the read resolved
    resolveRead('# stale event')
    await flushMicrotasks()
    expect(store.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    expect(tab.markdown).toBe('# original')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
  })

  it('read rejection: BLOCK_READ_FAILED, nothing applied, and no retry on later flushes', async () => {
    const { deps, flushSettle, rejectRead, controller, tab, store, attempt } = diskFixture()
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    rejectRead(new Error('io boom'))
    await flushMicrotasks()
    expect(deps.log.error).toHaveBeenCalledWith(
      '[editor][live_reload][BLOCK_READ_FAILED path=/tmp/test.md]',
      expect.any(Error)
    )
    expect(tab.markdown).toBe('# original')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(store.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    // No retry: the dead attempt schedules and reads nothing further.
    flushSettle()
    await flushMicrotasks()
    expect(deps.read).toHaveBeenCalledTimes(1)
    expect(deps.schedule).toHaveBeenCalledTimes(1)
  })

  it('disk construction uses the completion-time tab fields with isMixedLineEndings: false', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store, attempt } = diskFixture(
      RELOAD_PERMISSIONS.AUTOMATIC,
      { lineEnding: 'crlf', adjustLineEndingOnSave: true, trimTrailingNewline: 1, encoding: { encoding: 'shift_jis', isBom: true }, filename: 'report.md' }
    )
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    resolveRead('# from disk')
    await flushMicrotasks()
    expect(deps.buildSingleFileState).toHaveBeenCalledWith({
      markdown: '# from disk',
      filename: 'report.md',
      pathname: PATH,
      options: {
        encoding: { encoding: 'shift_jis', isBom: true },
        lineEnding: 'crlf',
        adjustLineEndingOnSave: true,
        trimTrailingNewline: 1
      }
    })
    expect(tab.isMixedLineEndings).toBe(false)
  })

  it('a background tab is replaced and stamped but never announced', async () => {
    const { deps, flushSettle, resolveRead, controller, tab } = diskFixture()
    const current = makeTab({ id: 'tab-2', pathname: '/tmp/other.md' })
    const store = makeStore(tab, { currentFile: current })
    const { attempt } = makeAttempt({ tab, store })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    resolveRead('# from disk')
    await flushMicrotasks()
    expect(tab.markdown).toBe('# from disk')
    expect(tab.contentReloaded).toBe(true)
    expect(deps.bus.emit).not.toHaveBeenCalled()
    expect(store.currentFile).toBe(current)
  })

  it('readWithSettle resolves the markdown for a live attempt', async () => {
    const { deps, flushSettle, resolveRead } = makeDeps()
    const tab = makeTab()
    const store = makeStore(tab)
    const { attempt } = makeAttempt({ tab, store })
    const pending = readWithSettle({ pathname: PATH, attempt, deps })
    flushSettle()
    await flushMicrotasks() // let the settle continuation issue the read
    resolveRead('# text')
    await expect(pending).resolves.toBe('# text')
    expect(deps.schedule).toHaveBeenCalledTimes(1)
    expect(deps.read).toHaveBeenCalledTimes(1)
  })

  it('readWithSettle returns null without reading when the attempt died during the settle', async () => {
    const { deps, flushSettle } = makeDeps()
    const tab = makeTab()
    const store = makeStore(tab)
    const { attempt, generations } = makeAttempt({ tab, store })
    const pending = readWithSettle({ pathname: PATH, attempt, deps })
    flushSettle()
    generations.set(PATH, 2)
    await expect(pending).resolves.toBeNull()
    expect(deps.read).not.toHaveBeenCalled()
  })

  it('readWithSettle returns null (after one read) when the attempt died during the read', async () => {
    const { deps, flushSettle, resolveRead } = makeDeps()
    const tab = makeTab()
    const store = makeStore(tab)
    const { attempt, generations } = makeAttempt({ tab, store })
    const pending = readWithSettle({ pathname: PATH, attempt, deps })
    flushSettle()
    await flushMicrotasks() // the read is now issued
    generations.set(PATH, 2)
    resolveRead('# too late')
    await expect(pending).resolves.toBeNull()
    expect(deps.read).toHaveBeenCalledTimes(1)
    expect(tab.markdown).toBe('# original')
  })
})

// ─── 4. confirmation lifecycle ────────────────────────────────────────

describe('confirmation lifecycle (dirty-tab conflict choice)', () => {
  function conflictFixture({ permission = RELOAD_PERMISSIONS.CONFIRMED, change = diskChange() } = {}) {
    const { deps, flushSettle, resolveRead, rejectRead } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab({ isSaved: false, markdown: '# local' })
    const store = makeStore(tab)
    const { attempt, generations } = makeAttempt({ tab, store, permission })
    controller.handleFileChange({ type: 'change', change, tab, store, attempt })
    expect(store.pushTabNotification).toHaveBeenCalledTimes(1)
    const notification = store.pushTabNotification.mock.calls[0][0]
    return { deps, flushSettle, resolveRead, rejectRead, controller, tab, store, attempt, generations, notification }
  }

  it('the conflict notification is the exclusive confirm choice and logs BLOCK_RELOAD_CONFLICT', () => {
    const { deps, notification, tab } = conflictFixture()
    expect(deps.log.log).toHaveBeenCalledWith('[editor][live_reload][BLOCK_RELOAD_CONFLICT path=test.md reason=dirty-tab]')
    expect(tab.isSaved).toBe(false)
    expect(notification.showConfirm).toBe(true)
    expect(notification.exclusiveType).toBe('file_changed')
    expect(notification.msg).toContain('fileChangedOnDisk')
    expect(typeof notification.action).toBe('function')
  })

  it('confirmed ready data replaces synchronously and consumes the choice exactly once', () => {
    const { deps, notification, tab } = conflictFixture({
      change: { pathname: PATH, data: readyData('# external') }
    })
    notification.action(true)
    expect(tab.markdown).toBe('# external')
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledTimes(1) // unequal
    notification.action(true) // second click — consumed
    expect(deps.buildSingleFileState).toHaveBeenCalledTimes(1) // no second commit
    expect(deps.recordPreReloadSnapshot).toHaveBeenCalledTimes(1)
  })

  it('a declined choice neither commits nor consumes: a later accept still works', async () => {
    const { deps, flushSettle, resolveRead, notification, tab } = conflictFixture()
    notification.action(false)
    await flushMicrotasks()
    expect(deps.read).not.toHaveBeenCalled()
    expect(tab.markdown).toBe('# local')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    notification.action(true) // not consumed by the decline
    flushSettle()
    await flushMicrotasks() // let the settle continuation issue the read
    resolveRead('# external truth')
    await flushMicrotasks()
    expect(tab.markdown).toBe('# external truth')
  })

  it('a stale-generation choice never commits nor starts a read', async () => {
    const { deps, flushSettle, notification, tab, generations } = conflictFixture()
    generations.set(PATH, 2) // superseded while the dialog was open
    notification.action(true)
    await flushMicrotasks()
    flushSettle()
    await flushMicrotasks()
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(tab.markdown).toBe('# local')
  })

  it('confirmed equal-text ready data replaces WITHOUT a pre-reload snapshot', () => {
    const { deps, notification, tab } = conflictFixture({
      change: { pathname: PATH, data: readyData('# local') }
    })
    notification.action(true)
    expect(tab.documentToken).toMatch(/^tok-/)
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledTimes(1)
  })

  it('edits after the choice but before the read completes require a fresh resolution', async () => {
    const { deps, flushSettle, resolveRead, notification, tab, store } = conflictFixture()
    notification.action(true) // choice-time capture: '# local', revision 0
    flushSettle()
    await flushMicrotasks()
    tab.markdown = '# newer local edits'
    tab.contentRevision = 1
    resolveRead('# external')
    await flushMicrotasks()
    // The stale result is dead: the current conflict flow is re-entered.
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledTimes(1)
    expect(store.APPLY_FILE_CHANGE).toHaveBeenCalledWith('change', diskChange())
    expect(tab.markdown).toBe('# newer local edits')
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
  })

  it('older conflict choices die when a newer event supersedes them; the latest one commits', async () => {
    const { deps, flushSettle, resolveRead } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab({ isSaved: false, markdown: '# local' })
    const store = makeStore(tab)
    const sharedGenerations = new Map()
    const first = makeAttempt({ tab, store, generation: 1, permission: RELOAD_PERMISSIONS.CONFIRMED, generations: sharedGenerations })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt: first.attempt })
    const firstAction = store.pushTabNotification.mock.calls[0][0].action

    // A newer dirty event supersedes the first dialog (shared map bumped).
    const second = makeAttempt({ tab, store, generation: 2, permission: RELOAD_PERMISSIONS.CONFIRMED, generations: sharedGenerations })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt: second.attempt })
    expect(store.pushTabNotification).toHaveBeenCalledTimes(2)
    const secondAction = store.pushTabNotification.mock.calls[1][0].action

    firstAction(true)
    expect(tab.markdown).toBe('# local') // older choice is dead
    secondAction(true)
    flushSettle()
    await flushMicrotasks() // let the settle continuation issue the read
    resolveRead('# external two')
    await flushMicrotasks()
    expect(tab.markdown).toBe('# external two') // the latest choice remains actionable
  })
})

// ─── 5. identity binding ──────────────────────────────────────────────

describe('attempt identity binding', () => {
  function silenceFixture() {
    const { deps, flushSettle, resolveRead } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab()
    const store = makeStore(tab)
    return { deps, flushSettle, resolveRead, controller, tab, store }
  }

  // Silence control for identity-stale attempts: zero re-dispatch, zero
  // recorders, zero announce, and the tab's content is whatever the caller
  // says it must still be (successor lifetimes carry their own markdown).
  const expectSilent = ({ deps, tab, store, markdown }) => {
    expect(store.APPLY_FILE_CHANGE).not.toHaveBeenCalled()
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
    expect(tab.markdown).toBe(markdown)
  }

  it('generation reuse after close/reopen (same number, different tab object) is stale', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store } = silenceFixture()
    const { attempt } = makeAttempt({ tab, store, generation: 1 })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    // Close, then reopen: same generation number reused, successor object.
    store.tabs.length = 0
    const reopened = makeTab({ id: 'tab-1', markdown: '# reopened' })
    store.tabs.push(reopened)
    resolveRead('# stale closed tab')
    await flushMicrotasks()
    expectSilent({ deps, tab: reopened, store, markdown: '# reopened' })
  })

  it('a same-id new lifetime replacing the tab object is stale', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store } = silenceFixture()
    const { attempt } = makeAttempt({ tab, store })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    const successor = makeTab({ id: 'tab-1', markdown: '# successor' })
    store.tabs.splice(0, 1, successor)
    resolveRead('# stale read')
    await flushMicrotasks()
    expectSilent({ deps, tab: successor, store, markdown: '# successor' })
  })

  it('rename/path replacement (tab.pathname moved) is stale', async () => {
    const { deps, flushSettle, resolveRead, controller, tab, store } = silenceFixture()
    const { attempt } = makeAttempt({ tab, store })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks()
    tab.pathname = '/tmp/renamed.md'
    resolveRead('# stale read')
    await flushMicrotasks()
    expectSilent({ deps, tab, store, markdown: '# original' })
  })
})

// ─── 6. manifest ──────────────────────────────────────────────────────

describe('buildReplacementManifest — one explicit replacement manifest', () => {
  it('captures the replacement state once without mutating the tab', () => {
    const { deps } = makeDeps()
    const tab = makeTab({
      markdown: '# pre-reload',
      history: { stack: [{ markdown: '# old-doc' }], index: 0, lastEditIndex: 0 },
      splitSession: { ratio: 0.5 }, // non-unified → eligible
      cursor: { line: 9, ch: 1 },
      scrollTop: 77,
      muyaIndexCursor: { blockIndex: 4, offset: 2 },
      notifications: [{ msg: 'keep' }]
    })
    const manifest = buildReplacementManifest({
      tab,
      pathname: PATH,
      data: readyData('# incoming'),
      buildSingleFileState: deps.buildSingleFileState
    })
    expect(manifest.tab).toBe(tab)
    expect(manifest.pathname).toBe(PATH)
    expect(manifest.incomingMarkdown).toBe('# incoming')
    expect(manifest.preReloadMarkdown).toBe('# pre-reload')
    expect(manifest.oldId).toBe('tab-1')
    expect(manifest.oldNotifications).toBe(tab.notifications)
    expect(manifest.oldHistory).toEqual({ stack: [{ markdown: '# old-doc' }], index: 0 })
    expect(manifest.savedCursor).toEqual({ line: 9, ch: 1 })
    expect(manifest.savedScrollTop).toBe(77)
    expect(manifest.savedMuyaIndexCursor).toEqual({ blockIndex: 4, offset: 2 })
    expect(manifest.newFileState.documentToken).toMatch(/^tok-/)
    expect(manifest.filename).toBe('test.md')
    expect(manifest.lineEnding).toBe('lf')
    expect(manifest.mixedLineEndings).toBe(false)
    expect(manifest.splitSessionRetired).toBe(true)
    expect(manifest.blocksDropped).toBe(true)
    expect(manifest.snapshotRequired).toBe(false)
    // Capture without surgery: the eligible history stays put.
    expect(tab.history.stack).toHaveLength(1)
    expect(tab.history.index).toBe(0)
    expect(tab.splitSession).toEqual({ ratio: 0.5 })
  })

  it('a unified split session is not eligible for the old-history restore', () => {
    const { deps } = makeDeps()
    const tab = makeTab({
      history: { stack: [{ markdown: '# old-doc' }], index: 0, lastEditIndex: 0 },
      splitSession: { unified: true }
    })
    const manifest = buildReplacementManifest({
      tab,
      pathname: PATH,
      data: readyData('# incoming'),
      buildSingleFileState: deps.buildSingleFileState
    })
    expect(manifest.oldHistory).toBeNull()
  })
})

// ─── 7. commitReplacement ─────────────────────────────────────────────

describe('commitReplacement — the synchronous commit stage', () => {
  function commitFixture({ tabOverrides = {}, mixed = false, snapshotRequired = false } = {}) {
    const { deps } = makeDeps()
    const tab = makeTab({
      markdown: '# pre-reload',
      history: { stack: [{ markdown: '# old-doc' }], index: 0, lastEditIndex: 0 },
      splitSession: { ratio: 0.5 },
      cursor: { line: 9, ch: 1 },
      scrollTop: 77,
      muyaIndexCursor: { blockIndex: 4, offset: 2 },
      notifications: [{ msg: 'keep' }],
      ...tabOverrides
    })
    const store = makeStore(tab)
    const manifest = buildReplacementManifest({
      tab,
      pathname: PATH,
      data: readyData('# incoming', { isMixedLineEndings: mixed }),
      buildSingleFileState: deps.buildSingleFileState
    })
    manifest.snapshotRequired = snapshotRequired
    const originalStack = tab.history.stack
    commitReplacement(manifest, { store, deps })
    return { deps, tab, store, manifest, originalStack }
  }

  it('preserves the exact tab object, old id and notifications; fresh token used once', () => {
    const { deps, tab, manifest } = commitFixture()
    expect(tab).toBe(manifest.tab)
    expect(tab.id).toBe('tab-1')
    expect(tab.notifications).toEqual([{ msg: 'keep' }])
    expect(tab.documentToken).toBe(manifest.newFileState.documentToken)
    expect(deps.buildSingleFileState).toHaveBeenCalledTimes(1)
  })

  it('restores cursor/scrollTop/muyaIndexCursor the fresh defaults overwrote', () => {
    const { tab } = commitFixture()
    expect(tab.cursor).toEqual({ line: 9, ch: 1 })
    expect(tab.scrollTop).toBe(77)
    expect(tab.muyaIndexCursor).toEqual({ blockIndex: 4, offset: 2 })
  })

  it('keeps the save checkpoints truthful for the incoming content', () => {
    const { tab } = commitFixture()
    expect(tab.markdown).toBe('# incoming')
    expect(tab.savedMarkdown).toBe('# incoming')
    expect(tab.isSaved).toBe(true)
    expect(tab.contentRevision).toBe(0)
    expect(tab.requiresExplicitSave).toBe(false)
    expect(tab.lastSavedHistoryId).toBe(-1)
  })

  it('retires splitSession and drops the stale muya blocks', () => {
    const { tab } = commitFixture()
    expect(tab.splitSession).toBeUndefined()
    expect('splitSession' in tab).toBe(false)
    expect(tab.blocks).toBeUndefined()
  })

  it('records the opened snapshot once and stamps contentReloaded', () => {
    const { deps, tab } = commitFixture()
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledWith('tab-1', '# incoming')
    expect(tab.contentReloaded).toBe(true)
  })

  it('eligible non-unified history: pops the old stack, restores the single-entry ring', () => {
    const { tab, manifest, originalStack } = commitFixture()
    expect(originalStack).toHaveLength(0) // reference freed by the pop
    expect(tab.history).toBe(manifest.oldHistory)
    expect(tab.history).toEqual({ stack: [{ markdown: '# old-doc' }], index: 0 })
  })

  it('unified reset: no surgery and the fresh history stays', () => {
    const { tab, manifest, originalStack } = commitFixture({
      tabOverrides: { splitSession: { unified: true } }
    })
    expect(manifest.oldHistory).toBeNull()
    expect(originalStack).toHaveLength(1) // untouched
    expect(tab.history).toEqual({ stack: [], index: -1 }) // fresh state's history
  })

  it('snapshotRequired=false records no pre-reload snapshot; true records exactly one', () => {
    const a = commitFixture({ snapshotRequired: false })
    expect(a.deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    const b = commitFixture({ snapshotRequired: true })
    expect(b.deps.recordPreReloadSnapshot).toHaveBeenCalledTimes(1)
    expect(b.deps.recordPreReloadSnapshot).toHaveBeenCalledWith('tab-1', '# pre-reload')
  })

  it('mixed-line-ending notice routes through the store with the localized info message', () => {
    const { deps, store } = commitFixture({ mixed: true })
    expect(deps.t).toHaveBeenCalledWith('store.editor.mixedLineEndingsNormalized', {
      name: 'test.md',
      lineEnding: 'LF'
    })
    expect(store.pushTabNotification).toHaveBeenCalledTimes(1)
    expect(store.pushTabNotification).toHaveBeenCalledWith({
      tabId: 'tab-1',
      msg: expect.stringContaining('mixedLineEndingsNormalized'),
      showConfirm: false,
      style: 'info',
      exclusiveType: ''
    })
  })

  it('current-tab announce: exact payload keys, no stale blocks field', () => {
    const { deps, tab, store } = commitFixture()
    const payload = deps.bus.emit.mock.calls[0][1]
    expect(deps.bus.emit).toHaveBeenCalledTimes(1)
    expect(deps.bus.emit).toHaveBeenCalledWith('file-changed', payload)
    expect(Object.keys(payload).sort()).toEqual([
      'contentReloaded', 'cursor', 'history', 'id', 'markdown', 'muyaIndexCursor', 'renderCursor', 'scrollTop'
    ])
    expect(payload.id).toBe('tab-1')
    expect(payload.markdown).toBe('# incoming')
    expect(payload.renderCursor).toBe(true)
    expect(payload.contentReloaded).toBe(true)
    expect(payload).not.toHaveProperty('blocks')
    expect(store.currentFile).toBe(tab)
  })

  it('background tab: silent announce, store.currentFile untouched', () => {
    const { deps } = makeDeps()
    const tab = makeTab({ markdown: '# pre-reload' })
    const current = { pathname: '/tmp/other.md' }
    const store = makeStore(tab, { currentFile: current })
    const manifest = buildReplacementManifest({
      tab,
      pathname: PATH,
      data: readyData('# incoming'),
      buildSingleFileState: deps.buildSingleFileState
    })
    commitReplacement(manifest, { store, deps })
    expect(deps.bus.emit).not.toHaveBeenCalled()
    expect(store.currentFile).toBe(current)
    expect(tab.contentReloaded).toBe(true)
  })
})

// ─── 8. applyLoadedChange (the loadChange target) ─────────────────────

describe('applyLoadedChange — committed replacement entry (no admission)', () => {
  function loadedFixture() {
    const { deps } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab()
    const store = makeStore(tab)
    return { deps, controller, tab, store }
  }

  it('preserves the missing-tab error text and the error notify payload', () => {
    const { deps, controller, store } = loadedFixture()
    store.tabs = []
    controller.applyLoadedChange({ change: { pathname: PATH, data: readyData('# x') }, store })
    expect(deps.log.error).toHaveBeenCalledWith('loadChange: Cannot find tab in tab list.')
    expect(deps.notify).toHaveBeenCalledWith({
      title: expect.stringContaining('store.editor.errorLoadingTabTitle'),
      message: expect.stringContaining('store.editor.errorLoadingTabMessage'),
      type: 'error',
      time: 20000,
      showConfirm: false
    })
  })

  it('performs NO admission: an equal-text load still replaces', () => {
    const { deps, controller, tab, store } = loadedFixture()
    controller.applyLoadedChange({ change: { pathname: PATH, data: readyData('# original') }, store })
    expect(deps.buildSingleFileState).toHaveBeenCalledTimes(1)
    expect(tab.documentToken).toMatch(/^tok-/)
    expect(tab.savedMarkdown).toBe('# original')
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).toHaveBeenCalledTimes(1)
  })

  it('an equal-text load through applyLoadedChange announces to the current tab', () => {
    const { deps, controller, tab, store } = loadedFixture()
    controller.applyLoadedChange({ change: { pathname: PATH, data: readyData('# original') }, store })
    expect(deps.bus.emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({
      id: 'tab-1',
      markdown: '# original',
      contentReloaded: true
    }))
  })

  it('carries the mixed-line-ending flag from ready data into the notice', () => {
    const { deps, controller, tab, store } = loadedFixture()
    controller.applyLoadedChange({
      change: { pathname: PATH, data: readyData('# incoming', { isMixedLineEndings: true }) },
      store
    })
    expect(store.pushTabNotification).toHaveBeenCalledTimes(1)
    expect(store.pushTabNotification.mock.calls[0][0].style).toBe('info')
    expect(store.pushTabNotification.mock.calls[0][0].showConfirm).toBe(false)
    expect(deps.t).toHaveBeenCalledWith('store.editor.mixedLineEndingsNormalized', {
      name: 'test.md',
      lineEnding: 'LF'
    })
    expect(tab.markdown).toBe('# incoming')
  })
})

// ─── 9. mutation controls ─────────────────────────────────────────────

describe('mutation controls — stale, declined and skipped attempts', () => {
  const snapshotOf = (tab) => JSON.stringify(tab)

  function expectUntouched(deps, tab, before) {
    expect(JSON.stringify(tab)).toBe(before)
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).not.toHaveBeenCalled()
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
  }

  it('declined confirmation leaves the tab byte-identical', async () => {
    const { deps, flushSettle } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab({ isSaved: false, markdown: '# keep me' })
    const store = makeStore(tab)
    const { attempt } = makeAttempt({ tab, store, permission: RELOAD_PERMISSIONS.CONFIRMED })
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    const notification = store.pushTabNotification.mock.calls[0][0]
    const before = snapshotOf(tab) // after the legal isSaved=false conflict flip
    notification.action(false)
    flushSettle()
    await flushMicrotasks()
    expect(JSON.stringify(tab)).toBe(before)
    expect(deps.recordPreReloadSnapshot).not.toHaveBeenCalled()
    expect(deps.recordOpenedSnapshot).not.toHaveBeenCalled()
    expect(deps.buildSingleFileState).not.toHaveBeenCalled()
    expect(deps.bus.emit).not.toHaveBeenCalled()
    expect(deps.read).not.toHaveBeenCalled()
  })

  it('stale disk resolution leaves the tab byte-identical', async () => {
    const { deps, flushSettle, resolveRead } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab()
    const store = makeStore(tab)
    const { attempt, generations } = makeAttempt({ tab, store })
    const before = snapshotOf(tab)
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks() // let the settle continuation issue the read
    generations.set(PATH, 2)
    resolveRead('# stale')
    await flushMicrotasks()
    expectUntouched(deps, tab, before)
  })

  it('automatic equal-text skip leaves the tab byte-identical with zero recorder calls', async () => {
    const { deps, flushSettle, resolveRead } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab({ markdown: '# same' })
    const store = makeStore(tab)
    const { attempt } = makeAttempt({ tab, store })
    const before = snapshotOf(tab)
    controller.handleFileChange({ type: 'change', change: diskChange(), tab, store, attempt })
    flushSettle()
    await flushMicrotasks() // let the settle continuation issue the read
    resolveRead('# same')
    await flushMicrotasks()
    expectUntouched(deps, tab, before)
    expect(deps.log.log).toHaveBeenCalledWith(
      '[editor][live_reload][BLOCK_RELOAD_SKIPPED path=test.md reason=hash-match]'
    )
  })

  it('a stale ready-data dispatch leaves the tab byte-identical', () => {
    const { deps } = makeDeps()
    const controller = createExternalReloadController(deps)
    const tab = makeTab()
    const store = makeStore(tab)
    const { attempt, generations } = makeAttempt({ tab, store })
    const before = snapshotOf(tab)
    generations.set(PATH, 3)
    controller.handleFileChange({
      type: 'change',
      change: { pathname: PATH, data: readyData('# incoming') },
      tab, store, attempt
    })
    expectUntouched(deps, tab, before)
  })
})
