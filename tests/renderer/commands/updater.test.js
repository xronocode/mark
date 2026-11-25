// FILE: tests/renderer/commands/updater.test.js
// VERSION: 2.4.0-beta
// START_MODULE_CONTRACT
//   PURPOSE: Verify the user-visible Help-menu updater command and the C-66 shared signed install flow across current, available, missing-feed, and failure states.
//   SCOPE: Renderer command orchestration with mocked Tauri APIs; network, signature cryptography, and bundle replacement are out of scope.
//   DEPENDS: src/renderer/src/commands/index.js, @tauri-apps/plugin-updater, @tauri-apps/plugin-process.
//   LINKS: docs/knowledge-graph.xml M-016; docs/verification-plan.xml V-M-016; .grace/changes/archive/C-66 (shared installSignedUpdate).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   findCmd - Resolves the command under test from the production registry.
//   checkMock - GRACE 4 synchronized symbol
//   notifyMock - GRACE 4 synchronized symbol
//   relaunchMock - GRACE 4 synchronized symbol
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-22 v2.4.0-beta (C-UPDATER-NET-BOUNDS T-001): failing-first
//     pins for the shared install flow — named check/download deadlines
//     (15000 ms / 300000 ms) through the plugin's own option seams, the
//     module-scope single-flight refusal (second overlapping call
//     invokes nothing and surfaces the localized in-progress notice, a
//     fresh retry works after the live attempt settles), fresh-data
//     toasts (the progress toast names update.version from the flow's
//     own re-check, never the queued snapshot's latestVersion), the
//     localized failure notice (updater.failureTitle/Body, raw error
//     console-only — supersedes the English «Update failed» catch pin
//     without weakening its settle-and-no-relaunch assertions) and the
//     R-7 source scan (the flow passes only timeout options, no URL
//     material anywhere in the block).
//   - 2026-10-28 v2.3.0-beta (C-UPDATER-ROLLBACK T-005): every install
//     flow now consumes the fail-closed mt_rollback_prepare step first
//     (mocks updated accordingly); new pins: prepare-before-check
//     ordering (invocationCallOrder), prepare-failure cancels with no
//     download/relaunch, help.rollback registration, and the store-level
//     confirmation semantics (OPEN gates on status, cancel is a no-op,
//     CONFIRM invokes mt_rollback_restore).
//   - 2026-10-19 v2.2.0-beta (C-66 T-002): installSignedUpdate is exported
//     and pinned directly (check → downloadAndInstall → relaunch, own
//     «Update failed» catch), plus a static pin that the manual command
//     path never consults skippedUpdateVersion (the skip gate lives only
//     in store/autoUpdates).
//   - 2026-08-07 v2.1.2-beta: replace Homebrew Terminal expectations with the unified signed updater path.
// END_CHANGE_SUMMARY

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

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({
    SET_SINGLE_PREFERENCE: vi.fn()
  })
}))

vi.mock('@/commands/utils', () => ({
  isUpdatable: () => true
}))

vi.mock('@/store/project', () => ({
  useProjectStore: () => ({
    ASK_FOR_OPEN_PROJECT: vi.fn()
  })
}))

vi.mock('@/store/editor', () => ({
  useEditorStore: () => ({ currentFile: null })
}))

const { notifyMock, checkMock, relaunchMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
  checkMock: vi.fn(),
  relaunchMock: vi.fn()
}))

vi.mock('@/services/notification', () => ({
  default: { notify: notifyMock }
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: checkMock
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: relaunchMock
}))

import { invoke } from '@tauri-apps/api/core'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import commands, { installSignedUpdate } from '@/commands/index'

const findCmd = (id) => commands.find((c) => c.id === id)

describe('file.check-update — signed in-app updater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is registered when isUpdatable() returns true', () => {
    expect(findCmd('file.check-update')).toBeDefined()
  })

  it('shows up-to-date notification when no update available', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.6',
      available: false,
      latestVersion: null,
      downloadUrl: null,
      statusNote: null
    })
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)

    await findCmd('file.check-update').execute()

    expect(invoke).toHaveBeenCalledWith('mt_updater_check')
    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Mark 2.0.6 is up to date',
      type: 'info'
    })
  })

  it('shows statusNote as warning when present', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.6',
      available: false,
      statusNote: 'updater plugin not initialized'
    })
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)

    await findCmd('file.check-update').execute()

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'updater plugin not initialized',
      type: 'warning'
    })
  })

  it('updates Homebrew-origin installs without opening Terminal', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.5',
      available: true,
      latestVersion: '2.0.6'
    })
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)

    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({
      version: '2.0.6',
      downloadAndInstall: downloadAndInstallMock
    })

    await findCmd('file.check-update').execute()

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Updating to Mark 2.0.6…',
      type: 'info'
    })
    expect(invoke).not.toHaveBeenCalledWith('mt_updater_brew_upgrade')
    expect(downloadAndInstallMock).toHaveBeenCalled()
    expect(relaunchMock).toHaveBeenCalled()
  })

  it('does in-place update for DMG installs', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.5',
      available: true,
      latestVersion: '2.0.6'
    })
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)

    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({
      version: '2.0.6',
      downloadAndInstall: downloadAndInstallMock
    })

    await findCmd('file.check-update').execute()

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Updating to Mark 2.0.6…',
      type: 'info'
    })
    expect(checkMock).toHaveBeenCalled()
    expect(downloadAndInstallMock).toHaveBeenCalled()
    expect(relaunchMock).toHaveBeenCalled()
  })

  it('shows up-to-date when plugin-updater check returns null', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.5',
      available: true,
      latestVersion: '2.0.6'
    })
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)

    checkMock.mockResolvedValueOnce(null)

    await findCmd('file.check-update').execute()

    expect(relaunchMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Mark 2.0.5 is up to date',
      type: 'info'
    })
  })

  it('shows warning on error', async () => {
    invoke.mockRejectedValueOnce(new Error('network timeout'))

    await findCmd('file.check-update').execute()

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Update failed',
      message: 'Error: network timeout',
      type: 'warning'
    })
  })

  it('shares one in-flight check between rapid invocations (guard audit f-005)', async () => {
    // The first mt_updater_check is still pending when the second
    // invocation starts: the second must ride the live check instead of
    // starting a second concurrent network check, and the shared outcome
    // notifies once. The guard clears when the check settles.
    let resolveCheck
    invoke.mockImplementationOnce(
      () => new Promise((res) => { resolveCheck = res })
    )
    const first = findCmd('file.check-update').execute()
    // Let the command's dynamic imports settle so the shared check is
    // genuinely in flight, then start the second invocation against the
    // still-pending first.
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('mt_updater_check'))
    const second = findCmd('file.check-update').execute()
    resolveCheck({
      currentVersion: '2.0.6',
      available: false,
      latestVersion: null,
      downloadUrl: null,
      statusNote: null
    })
    await Promise.all([first, second])
    expect(
      invoke.mock.calls.filter(([id]) => id === 'mt_updater_check')
    ).toHaveLength(1)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Mark 2.0.6 is up to date',
      type: 'info'
    })
  })

  it('ships updater capability and no obsolete Terminal command', () => {
    const workspaceRoot = resolve(import.meta.dirname, '../../..')
    const capability = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'src-tauri/capabilities/default.json'), 'utf8')
    )
    const updaterSource = readFileSync(
      resolve(workspaceRoot, 'src-tauri/src/m016_updater.rs'),
      'utf8'
    )

    expect(capability.permissions).toContain('updater:default')
    expect(updaterSource).not.toContain('mark@alpha')
    expect(updaterSource).not.toContain('osascript')
    expect(updaterSource).not.toContain('brew upgrade')
  })

  // START_BLOCK_C66_SHARED_INSTALL
  // C-66: the exported installSignedUpdate is the single signed install
  // flow — the manual command and the automatic-check notice both end
  // here, so their behaviour is identical by construction.
  it('installSignedUpdate drives check → downloadAndInstall → relaunch', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)
    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({ version: '2.6.0', downloadAndInstall: downloadAndInstallMock })

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Updating to Mark 2.6.0…',
      type: 'info'
    })
    expect(downloadAndInstallMock).toHaveBeenCalled()
    expect(relaunchMock).toHaveBeenCalled()
  })

  it('installSignedUpdate reports up-to-date when the plugin re-check finds nothing', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)
    checkMock.mockResolvedValueOnce(null)

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(relaunchMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Mark 2.5.0 is up to date',
      type: 'info'
    })
  })

  it('install_failure_is_localized_and_console_only (supersedes the English «Update failed» catch pin)', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare (C-UPDATER-ROLLBACK)
    checkMock.mockRejectedValueOnce(new Error('download interrupted'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await installSignedUpdate({
        currentVersion: '2.5.0',
        available: true,
        latestVersion: '2.6.0',
        downloadUrl: null,
        statusNote: null
      })
    } finally {
      errorSpy.mockRestore()
    }

    expect(relaunchMock).not.toHaveBeenCalled()
    // Exactly one localized notice; the raw error is demoted to the
    // console marker and never reaches the notify payload.
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const notice = notifyMock.mock.calls[0][0]
    expect(notice.title).toBe('t:updater.failureTitle')
    expect(typeof notice.message).toBe('string')
    expect(notice.message.length).toBeGreaterThan(0)
    expect(notice.message).not.toContain('download interrupted')
  })

  it('the manual path never consults the skip state (no skippedUpdateVersion in commands)', () => {
    const workspaceRoot = resolve(import.meta.dirname, '../../..')
    const commandsSource = readFileSync(
      resolve(workspaceRoot, 'src/renderer/src/commands/index.js'),
      'utf8'
    )
    expect(commandsSource).not.toContain('skippedUpdateVersion')
  })
  // END_BLOCK_C66_SHARED_INSTALL

  // START_BLOCK_NET_BOUNDS_SHARED_INSTALL
  // C-UPDATER-NET-BOUNDS: the shared flow carries named deadlines
  // through the plugin's own option seams, serializes installs with a
  // module-scope single-flight guard, builds its toasts from the fresh
  // re-check and settles failures into localized notices.
  it('install_passes_the_check_deadline', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare
    const downloadAndInstallMock = vi.fn().mockResolvedValue(undefined)
    checkMock.mockResolvedValueOnce({ version: '2.7.0', downloadAndInstall: downloadAndInstallMock })

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(checkMock).toHaveBeenCalledWith({ timeout: 15000 })
    expect(relaunchMock).toHaveBeenCalled()
  })

  it('install_passes_the_download_deadline', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare
    const downloadAndInstallMock = vi.fn().mockResolvedValue(undefined)
    checkMock.mockResolvedValueOnce({ version: '2.7.0', downloadAndInstall: downloadAndInstallMock })

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(downloadAndInstallMock).toHaveBeenCalledWith(undefined, { timeout: 300000 })
  })

  it('install_is_single_flight (second overlapping call refuses, invokes nothing, retry works)', async () => {
    invoke.mockResolvedValue(undefined) // mt_rollback_prepare (every attempt)
    const downloadAndInstallMock = vi.fn()
    let releaseDownload
    downloadAndInstallMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        releaseDownload = reject
      })
    )
    checkMock.mockResolvedValue({ version: '2.7.0', downloadAndInstall: downloadAndInstallMock })
    const status = {
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    }

    // First invocation is held in-flight by the pending download.
    const first = installSignedUpdate(status)
    await vi.waitFor(() => expect(downloadAndInstallMock).toHaveBeenCalledTimes(1))

    // A second overlapping invocation settles immediately: the localized
    // in-progress refusal, and it invoked nothing.
    await installSignedUpdate(status)

    const prepareCalls = invoke.mock.calls.filter(([cmd]) => cmd === 'mt_rollback_prepare').length
    expect(prepareCalls, 'no second mt_rollback_prepare').toBe(1)
    expect(checkMock, 'no second check').toHaveBeenCalledTimes(1)
    expect(downloadAndInstallMock, 'no second download').toHaveBeenCalledTimes(1)
    expect(relaunchMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 't:updater.inProgressTitle',
        message: 't:updater.inProgressBody'
      })
    )

    // The live attempt settles into the localized failure…
    releaseDownload(new Error('download interrupted'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await first
    } finally {
      errorSpy.mockRestore()
    }
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 't:updater.failureTitle' })
    )

    // …and a fresh third invocation runs the normal flow (retry-after-
    // failure preserved — the guard re-arms after the attempt settles).
    const retryDownloadMock = vi.fn().mockResolvedValue(undefined)
    checkMock.mockResolvedValue({ version: '2.7.0', downloadAndInstall: retryDownloadMock })
    await installSignedUpdate(status)

    const prepareCallsAfterRetry = invoke.mock.calls.filter(
      ([cmd]) => cmd === 'mt_rollback_prepare'
    ).length
    expect(prepareCallsAfterRetry, 'the retry runs its own prepare').toBe(2)
    expect(retryDownloadMock).toHaveBeenCalledTimes(1)
    expect(relaunchMock).toHaveBeenCalledTimes(1)
  })

  it('install_toasts_come_from_the_fresh_recheck (never the queued snapshot)', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare
    const downloadAndInstallMock = vi.fn().mockResolvedValue(undefined)
    // The queued snapshot says 2.6.0; the flow's own fresh re-check
    // answers 2.7.0 — the toast must name 2.7.0.
    checkMock.mockResolvedValueOnce({ version: '2.7.0', downloadAndInstall: downloadAndInstallMock })

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Updating to Mark 2.7.0…',
      type: 'info'
    })
    for (const call of notifyMock.mock.calls) {
      expect(JSON.stringify(call), 'no visible string carries the stale 2.6.0').not.toContain(
        '2.6.0'
      )
    }
    expect(relaunchMock).toHaveBeenCalled()
  })

  it('install_flow_passes_no_url_and_only_timeout_options (R-7 renderer pin)', () => {
    const workspaceRoot = resolve(import.meta.dirname, '../../..')
    const commandsSource = readFileSync(
      resolve(workspaceRoot, 'src/renderer/src/commands/index.js'),
      'utf8'
    )
    const start = commandsSource.indexOf('// START_BLOCK_INSTALL_SIGNED_UPDATE')
    const end = commandsSource.indexOf('// END_BLOCK_INSTALL_SIGNED_UPDATE')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = commandsSource.slice(start, end)
    // The only plugin-call shapes: named deadline constants through the
    // plugin's own timeout seams.
    expect(block).toContain('check({ timeout: UPDATER_CHECK_TIMEOUT_MS })')
    expect(block).toContain('downloadAndInstall(undefined, { timeout: UPDATER_DOWNLOAD_TIMEOUT_MS })')
    // No URL material anywhere in the flow: no fetch call, no http
    // string, no headers argument (the feed's URL is used as-is).
    expect(block).not.toContain('fetch(')
    expect(block).not.toContain('http://')
    expect(block).not.toContain('https://')
    expect(block).not.toContain('headers')
  })
  // END_BLOCK_NET_BOUNDS_SHARED_INSTALL

  // START_BLOCK_C66_ROLLBACK_PREPARE
  // C-UPDATER-ROLLBACK T-005: fail-closed prepare ordering pins.
  it('installSignedUpdate invokes mt_rollback_prepare before check/downloadAndInstall', async () => {
    invoke.mockResolvedValueOnce(undefined) // mt_rollback_prepare
    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({ downloadAndInstall: downloadAndInstallMock })

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(invoke).toHaveBeenCalledWith('mt_rollback_prepare')
    const prepareOrder = invoke.mock.invocationCallOrder[0]
    expect(prepareOrder).toBeLessThan(checkMock.mock.invocationCallOrder[0])
    expect(checkMock.mock.invocationCallOrder[0]).toBeLessThan(
      downloadAndInstallMock.mock.invocationCallOrder[0]
    )
  })

  it('a prepare failure cancels the update fail-closed (no download, no relaunch)', async () => {
    invoke.mockRejectedValueOnce(new Error('disk full'))

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(checkMock).not.toHaveBeenCalled()
    expect(relaunchMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update cancelled', type: 'warning' })
    )
  })

  it('registers help.rollback (desktop registry)', () => {
    expect(findCmd('help.rollback')).toBeDefined()
  })
  // END_BLOCK_C66_ROLLBACK_PREPARE

  // START_BLOCK_ROLLBACK_CONFIRM_STORE
  // C-UPDATER-ROLLBACK: store-level confirmation semantics — OPEN gates
  // on mt_rollback_status, CANCEL is a strict no-op.
  describe('autoUpdates rollback confirmation', () => {
    beforeEach(async () => {
      const { createPinia, setActivePinia } = await import('pinia')
      setActivePinia(createPinia())
    })

    it('OPEN_ROLLBACK_CONFIRM hides the card when no valid snapshot exists', async () => {
      invoke.mockResolvedValueOnce({ available: false, previousVersion: null, currentVersion: '2.9.1' })
      const store = useAutoUpdatesStore()
      const shown = await store.OPEN_ROLLBACK_CONFIRM({ invokeFn: invoke })
      expect(shown).toBe(false)
      expect(store.rollback.visible).toBe(false)
    })

    it('rollback_confirm_cancel_is_a_noop: CLOSE invokes nothing', async () => {
      invoke.mockResolvedValueOnce({ available: true, previousVersion: '2.9.0', currentVersion: '2.9.1' })
      const store = useAutoUpdatesStore()
      await store.OPEN_ROLLBACK_CONFIRM({ invokeFn: invoke })
      invoke.mockClear()
      store.CLOSE_ROLLBACK_CONFIRM()
      expect(store.rollback.visible).toBe(false)
      expect(invoke).not.toHaveBeenCalled()
    })

    it('CONFIRM_ROLLBACK invokes mt_rollback_restore only after explicit confirm', async () => {
      invoke.mockResolvedValueOnce({ available: true, previousVersion: '2.9.0', currentVersion: '2.9.1' })
      const store = useAutoUpdatesStore()
      await store.OPEN_ROLLBACK_CONFIRM({ invokeFn: invoke })
      invoke.mockClear()
      invoke.mockResolvedValueOnce(undefined)
      await store.CONFIRM_ROLLBACK({ invokeFn: invoke })
      expect(invoke).toHaveBeenCalledWith('mt_rollback_restore')
    })
  })
  // END_BLOCK_ROLLBACK_CONFIRM_STORE
})
