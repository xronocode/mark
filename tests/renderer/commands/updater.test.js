// FILE: tests/renderer/commands/updater.test.js
// VERSION: 2.2.0-beta
// START_MODULE_CONTRACT
//   PURPOSE: Verify the user-visible Help-menu updater command and the C-66 shared signed install flow across current, available, missing-feed, and failure states.
//   SCOPE: Renderer command orchestration with mocked Tauri APIs; network, signature cryptography, and bundle replacement are out of scope.
//   DEPENDS: src/renderer/src/commands/index.js, @tauri-apps/plugin-updater, @tauri-apps/plugin-process.
//   LINKS: docs/knowledge-graph.xml M-016; docs/verification-plan.xml V-M-016; .grace/changes/active/C-66 (shared installSignedUpdate).
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

    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({
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

    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({
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
    const downloadAndInstallMock = vi.fn()
    checkMock.mockResolvedValueOnce({ downloadAndInstall: downloadAndInstallMock })

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

  it('installSignedUpdate owns its «Update failed» catch (shared by both callers)', async () => {
    checkMock.mockRejectedValueOnce(new Error('download interrupted'))

    await installSignedUpdate({
      currentVersion: '2.5.0',
      available: true,
      latestVersion: '2.6.0',
      downloadUrl: null,
      statusNote: null
    })

    expect(relaunchMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Update failed',
      message: 'Error: download interrupted',
      type: 'warning'
    })
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
})
