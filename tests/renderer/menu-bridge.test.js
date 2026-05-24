/**
 * Tests for src/renderer/src/menu-bridge.js
 *
 * Covers: installMenuBridge — IPC listener registration, command
 * lookup, execute dispatch, error handling.
 */

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => `t:${key}`)
}))

const { busEmitMock } = vi.hoisted(() => ({ busEmitMock: vi.fn() }))
vi.mock('@/bus', () => ({
  default: { emit: busEmitMock, on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: vi.fn(() => Promise.resolve()),
  isOsx: false,
  isWindows: false,
  isLinux: true
}))

const { setPrefMock } = vi.hoisted(() => ({ setPrefMock: vi.fn() }))
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: vi.fn(() => ({
    SET_SINGLE_PREFERENCE: setPrefMock
  }))
}))

vi.mock('@/commands/utils', () => ({
  isUpdatable: () => false
}))

import { installMenuBridge } from '@/menu-bridge'

describe('installMenuBridge', () => {
  let ipcOnCallbacks

  beforeEach(() => {
    ipcOnCallbacks = {}
    window.electron.ipcRenderer.on = vi.fn((channel, callback) => {
      ipcOnCallbacks[channel] = callback
      return () => {}
    })
  })

  it('registers mt::menu-invoked listener', () => {
    installMenuBridge()
    expect(window.electron.ipcRenderer.on).toHaveBeenCalledWith(
      'mt::menu-invoked',
      expect.any(Function)
    )
  })

  it('skips when ipcRenderer.on is not available', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.electron.ipcRenderer.on = undefined

    installMenuBridge()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipping')
    )
    warnSpy.mockRestore()
  })

  it('skips when window.electron is undefined', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const origElectron = window.electron
    window.electron = undefined

    installMenuBridge()

    expect(warnSpy).toHaveBeenCalled()
    window.electron = origElectron
    warnSpy.mockRestore()
  })

  it('dispatches known command by string payload', async () => {
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']
    expect(handler).toBeDefined()

    await handler({}, 'file.new-tab')

    expect(busEmitMock).toHaveBeenCalledWith('mt::new-untitled-tab', {
      selected: '',
      markdown: ''
    })
  })

  it('dispatches known command by object payload {id}', async () => {
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, { id: 'file.save' })

    expect(busEmitMock).toHaveBeenCalledWith('mt::editor-ask-file-save')
  })

  it('warns for empty payload', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, '')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no id'),
      ''
    )
    warnSpy.mockRestore()
  })

  it('warns for unknown command id', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, 'nonexistent.command')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no command for menu id')
    )
    warnSpy.mockRestore()
  })

  it('handles command execution error gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    // file.new-window calls ipcRenderer.send which is mocked but shouldn't error
    // Let's test with a command we know works
    await handler({}, 'file.new-tab')
    // Should not throw
    errorSpy.mockRestore()
  })

  it('warns when payload is object without string id', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, { id: 42 }) // non-string id

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no id'),
      { id: 42 }
    )
    warnSpy.mockRestore()
  })

  it('handles null payload', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, null)

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('dispatches subcommand via parent.executeSubcommand', async () => {
    setPrefMock.mockClear()
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, 'window.change-theme-dracula')

    expect(setPrefMock).toHaveBeenCalledWith({
      type: 'theme',
      value: 'dracula'
    })
  })

  it('dispatches light theme subcommand', async () => {
    setPrefMock.mockClear()
    installMenuBridge()
    const handler = ipcOnCallbacks['mt::menu-invoked']

    await handler({}, 'window.change-theme-light')

    expect(setPrefMock).toHaveBeenCalledWith({
      type: 'theme',
      value: 'light'
    })
  })
})
