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
import commands from '@/commands/index'

const findCmd = (id) => commands.find((c) => c.id === id)

describe('file.check-update — three-path updater', () => {
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
      statusNote: null,
      installMethod: 'dmg'
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
      statusNote: 'updater plugin not initialized',
      installMethod: 'dmg'
    })

    await findCmd('file.check-update').execute()

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'updater plugin not initialized',
      type: 'warning'
    })
  })

  it('launches brew upgrade for homebrew installs', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.5',
      available: true,
      latestVersion: '2.0.6',
      installMethod: 'homebrew'
    })

    await findCmd('file.check-update').execute()

    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Mark 2.0.6 available',
      message: 'Opening Terminal for brew upgrade…',
      type: 'info'
    })
    expect(invoke).toHaveBeenCalledWith('mt_updater_brew_upgrade')
  })

  it('does in-place update for DMG installs', async () => {
    invoke.mockResolvedValueOnce({
      currentVersion: '2.0.5',
      available: true,
      latestVersion: '2.0.6',
      installMethod: 'dmg'
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
      latestVersion: '2.0.6',
      installMethod: 'dmg'
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
})
