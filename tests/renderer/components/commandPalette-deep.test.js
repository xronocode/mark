import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const makeStubs = () => ({
  ElDialog: { template: '<div><slot name="title" /><slot /></div>' },
  Loading: true
})

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn()

describe('commandPalette/index.vue — deep coverage', () => {
  let pinia, CommandPalette, bus, log

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    log = (await import('electron-log')).default
    CommandPalette = (await import('@/components/commandPalette/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(CommandPalette, {
      global: {
        plugins: [pinia, i18n],
        stubs: makeStubs()
      }
    })

  // --- handleShow ---
  describe('handleShow', () => {
    it('opens palette with root command when no command given', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const ccStore = useCommandCenterStore()
      ccStore.rootCommand = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'cmd1', title: 'New File', description: 'Create a new file', shortcut: ['Ctrl+N'] }
        ],
        subcommandSelectedIndex: 0,
        placeholder: 'Type command...'
      }

      const wrapper = mountComponent()
      // Find the handler that was registered
      const showCall = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')
      expect(showCall).toBeTruthy()
      const handleShow = showCall[1]

      await handleShow()
      await nextTick()

      expect(ccStore.rootCommand.run).toHaveBeenCalled()
      expect(wrapper.vm.showCommandPalette).toBe(true)
      expect(wrapper.vm.availableCommands).toEqual(ccStore.rootCommand.subcommands)
      expect(wrapper.vm.selectedCommandIndex).toBe(0)
      expect(wrapper.vm.placeholderText).toBe('Type command...')
      expect(bus.emit).toHaveBeenCalledWith('editor-blur')
    })

    it('opens palette with custom command', async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [{ id: 'sub1', description: 'Sub', shortcut: [] }],
        subcommandSelectedIndex: -1,
        placeholder: null
      }

      mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]

      await handleShow(customCmd)
      await nextTick()

      expect(customCmd.run).toHaveBeenCalled()
    })

    it('uses default placeholder when command has none', async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1,
        placeholder: null
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]

      await handleShow(customCmd)
      await nextTick()

      // Should use the computed defaultPlaceholderText
      expect(wrapper.vm.placeholderText).toBeTruthy()
    })

    it('handles error with message from run()', async () => {
      const customCmd = {
        run: vi.fn().mockRejectedValue(new Error('init failed')),
        subcommands: []
      }

      mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]

      await handleShow(customCmd)
      await nextTick()

      expect(log.error).toHaveBeenCalledWith('Unable to initialize command:', expect.any(Error))
    })

    it('handles error with null message from run() (silent)', async () => {
      const customCmd = {
        run: vi.fn().mockRejectedValue(new Error()),
        subcommands: []
      }

      mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]

      await handleShow(customCmd)
      await nextTick()

      // Error has empty message, so should not log
      expect(log.error).not.toHaveBeenCalled()
    })
  })

  // --- handleDialogClose ---
  describe('handleDialogClose', () => {
    it('resets state and calls unload', async () => {
      const unloadFn = vi.fn()
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [{ id: 'a', description: 'A', shortcut: [] }],
        subcommandSelectedIndex: 0,
        unload: unloadFn
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]

      await handleShow(customCmd)
      await nextTick()

      // Now trigger close
      wrapper.vm.handleDialogClose()

      expect(wrapper.vm.selectedCommandIndex).toBe(-1)
      expect(wrapper.vm.query).toBe('')
      expect(wrapper.vm.availableCommands).toEqual([])
      expect(unloadFn).toHaveBeenCalled()
      expect(wrapper.vm.currentCommand).toBeNull()
    })

    it('handles close without unload function', async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]

      await handleShow(customCmd)
      await nextTick()

      // Should not throw
      expect(() => wrapper.vm.handleDialogClose()).not.toThrow()
    })
  })

  // --- handleBeforeInput (ArrowUp/ArrowDown) ---
  describe('handleBeforeInput — keyboard navigation', () => {
    let wrapper

    beforeEach(async () => {
      // Stub scrollIntoView for jsdom
      Element.prototype.scrollIntoView = vi.fn()

      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'a', description: 'Alpha', shortcut: [] },
          { id: 'b', description: 'Beta', shortcut: [] },
          { id: 'c', description: 'Charlie', shortcut: [] }
        ],
        subcommandSelectedIndex: 0
      }

      wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()
    })

    it('ArrowDown moves selection forward', () => {
      expect(wrapper.vm.selectedCommandIndex).toBe(0)

      wrapper.vm.handleBeforeInput({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      })

      expect(wrapper.vm.selectedCommandIndex).toBe(1)
    })

    it('ArrowDown wraps to beginning', () => {
      wrapper.vm.selectedCommandIndex = 2

      wrapper.vm.handleBeforeInput({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      })

      expect(wrapper.vm.selectedCommandIndex).toBe(0)
    })

    it('ArrowUp moves selection backward', () => {
      wrapper.vm.selectedCommandIndex = 2

      wrapper.vm.handleBeforeInput({
        key: 'ArrowUp',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      })

      expect(wrapper.vm.selectedCommandIndex).toBe(1)
    })

    it('ArrowUp wraps to end from index 0', () => {
      wrapper.vm.selectedCommandIndex = 0

      wrapper.vm.handleBeforeInput({
        key: 'ArrowUp',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      })

      expect(wrapper.vm.selectedCommandIndex).toBe(2)
    })
  })

  // --- handleInput ---
  describe('handleInput', () => {
    let wrapper

    beforeEach(async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'a', description: 'Alpha', shortcut: [] },
          { id: 'b', description: 'Beta', shortcut: [] }
        ],
        subcommandSelectedIndex: 0
      }

      wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()
    })

    it('ignores composing events', () => {
      const initial = wrapper.vm.selectedCommandIndex
      wrapper.vm.handleInput({ isComposing: true, key: 'a' })
      expect(wrapper.vm.selectedCommandIndex).toBe(initial)
    })

    it('no-ops for modifier keys', () => {
      const noops = ['Control', 'Alt', 'Meta', 'Shift', 'Escape', 'PageDown', 'PageUp', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      noops.forEach((key) => {
        wrapper.vm.handleInput({ isComposing: false, key })
      })
      // No crash or unexpected behavior
    })

    it('Enter key triggers search', () => {
      // Set selectedCommandIndex to 0 so it picks a command
      wrapper.vm.selectedCommandIndex = 0

      // Mock the executeSubcommand
      wrapper.vm.currentCommand.executeSubcommand = vi.fn()

      wrapper.vm.handleInput({ isComposing: false, key: 'Enter' })

      expect(wrapper.vm.currentCommand.executeSubcommand).toHaveBeenCalledWith(
        'a',
        undefined
      )
    })

    it('default key updates commands list (filters)', () => {
      wrapper.vm.query = 'Alp'

      wrapper.vm.handleInput({ isComposing: false, key: 'p' })

      // Should filter to only Alpha
      expect(wrapper.vm.availableCommands.length).toBe(1)
      expect(wrapper.vm.availableCommands[0].id).toBe('a')
      expect(wrapper.vm.selectedCommandIndex).toBe(0)
    })
  })

  // --- search ---
  describe('search', () => {
    it('executes command by ID when passed', async () => {
      const executeFn = vi.fn()
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'cmd1', description: 'Do thing', shortcut: [], execute: executeFn }
        ],
        subcommandSelectedIndex: 0
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.search('cmd1')

      expect(executeFn).toHaveBeenCalled()
    })

    it('executes selected command on Enter when no ID given', async () => {
      const executeFn = vi.fn()
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'cmd1', description: 'Do thing', shortcut: [], execute: executeFn }
        ],
        subcommandSelectedIndex: 0
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.selectedCommandIndex = 0
      wrapper.vm.search()

      expect(executeFn).toHaveBeenCalled()
    })

    it('updates list when no ID and no selection', async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'a', description: 'Alpha', shortcut: [] },
          { id: 'b', description: 'Beta', shortcut: [] }
        ],
        subcommandSelectedIndex: -1
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.selectedCommandIndex = -1
      wrapper.vm.query = 'Beta'
      wrapper.vm.search()

      expect(wrapper.vm.availableCommands.length).toBe(1)
    })
  })

  // --- updateCommands ---
  describe('updateCommands', () => {
    it('uses command.search when available', async () => {
      const searchFn = vi.fn().mockResolvedValue([
        { id: 'r1', description: 'Result 1', shortcut: [] }
      ])
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1,
        search: searchFn
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.query = 'hello'
      wrapper.vm.updateCommands()

      await nextTick()

      expect(searchFn).toHaveBeenCalledWith('hello')
      // Wait for promise to resolve
      await vi.waitFor(() => {
        expect(wrapper.vm.availableCommands.length).toBe(1)
        expect(wrapper.vm.searcherBusy).toBe(false)
      })
    })

    it('handles search rejection with message', async () => {
      const searchFn = vi.fn().mockRejectedValue(new Error('search fail'))
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1,
        search: searchFn
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.query = 'fail'
      wrapper.vm.updateCommands()

      await vi.waitFor(() => {
        expect(wrapper.vm.searcherBusy).toBe(false)
        expect(wrapper.vm.availableCommands).toEqual([])
        expect(wrapper.vm.selectedCommandIndex).toBe(-1)
      })
    })

    it('handles search rejection with null message (cancelled)', async () => {
      const searchFn = vi.fn().mockRejectedValue({ message: null })
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1,
        search: searchFn
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.updateCommands()

      // searcherBusy stays true when cancelled (no message)
      // Give the promise time to settle
      await new Promise((r) => setTimeout(r, 10))
      expect(wrapper.vm.searcherBusy).toBe(true)
    })

    it('shows all subcommands when query is empty', async () => {
      const subs = [
        { id: 'a', description: 'Alpha', shortcut: [] },
        { id: 'b', description: 'Beta', shortcut: [] }
      ]
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: subs,
        subcommandSelectedIndex: -1
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.query = ''
      wrapper.vm.updateCommands()

      expect(wrapper.vm.availableCommands).toEqual(subs)
      expect(wrapper.vm.selectedCommandIndex).toBe(0)
    })

    it('filters subcommands case-insensitively', async () => {
      const subs = [
        { id: 'a', description: 'Alpha', shortcut: [] },
        { id: 'b', description: 'Beta', shortcut: [] }
      ]
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: subs,
        subcommandSelectedIndex: -1
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.query = 'alpha'
      wrapper.vm.updateCommands()

      expect(wrapper.vm.availableCommands.length).toBe(1)
      expect(wrapper.vm.availableCommands[0].id).toBe('a')
    })

    it('sets selectedCommandIndex to -1 when no matches', async () => {
      const subs = [{ id: 'a', description: 'Alpha', shortcut: [] }]
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: subs,
        subcommandSelectedIndex: -1
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.query = 'zzzzz'
      wrapper.vm.updateCommands()

      expect(wrapper.vm.availableCommands.length).toBe(0)
      expect(wrapper.vm.selectedCommandIndex).toBe(-1)
    })

    it('search returns null result', async () => {
      const searchFn = vi.fn().mockResolvedValue(null)
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1,
        search: searchFn
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.updateCommands()

      await vi.waitFor(() => {
        expect(wrapper.vm.availableCommands).toEqual([])
        expect(wrapper.vm.selectedCommandIndex).toBe(-1)
      })
    })
  })

  // --- executeCommand ---
  describe('executeCommand', () => {
    it('logs error when command not found', async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [],
        subcommandSelectedIndex: -1
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.executeCommand('nonexistent')

      expect(log.error).toHaveBeenCalledWith('Command not found: nonexistent')
    })

    it('uses executeSubcommand when available on currentCommand', async () => {
      const execSubFn = vi.fn()
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [{ id: 'cmd1', description: 'Cmd', shortcut: [], value: 'val1' }],
        subcommandSelectedIndex: 0,
        executeSubcommand: execSubFn
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.executeCommand('cmd1')

      expect(execSubFn).toHaveBeenCalledWith('cmd1', 'val1')
      expect(wrapper.vm.showCommandPalette).toBe(false)
    })

    it('loads subcommands when command has no execute/run but has subcommands', async () => {
      const childSubs = [{ id: 'child1', description: 'Child', shortcut: [] }]
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'parent', description: 'Parent', shortcut: [], subcommands: childSubs }
        ],
        subcommandSelectedIndex: 0
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.executeCommand('parent')

      expect(wrapper.vm.currentCommand.id).toBe('parent')
      // After loading subcommands, updateCommands is called which sets index
      // to 0 when there are subcommands (query is empty)
      expect(wrapper.vm.selectedCommandIndex).toBe(0)
      expect(wrapper.vm.query).toBe('')
    })

    it('calls execute() when command has it', async () => {
      const executeFn = vi.fn()
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'cmd1', description: 'Run', shortcut: [], execute: executeFn }
        ],
        subcommandSelectedIndex: 0
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      wrapper.vm.executeCommand('cmd1')

      expect(executeFn).toHaveBeenCalled()
      expect(wrapper.vm.showCommandPalette).toBe(false)
    })
  })

  // --- handleLanguageChanged ---
  describe('handleLanguageChanged', () => {
    it('reloads commands when palette is open', async () => {
      const customCmd = {
        run: vi.fn().mockResolvedValue(undefined),
        subcommands: [
          { id: 'a', description: 'Alpha', shortcut: [] },
          { id: 'b', description: 'Beta', shortcut: [] }
        ],
        subcommandSelectedIndex: 0
      }

      const wrapper = mountComponent()
      const handleShow = bus.on.mock.calls.find((c) => c[0] === 'show-command-palette')[1]
      await handleShow(customCmd)
      await nextTick()

      const langHandler = bus.on.mock.calls.find((c) => c[0] === 'language-changed')[1]

      // Reset mock for run to track second call
      customCmd.run.mockClear()
      customCmd.run.mockResolvedValue(undefined)

      await langHandler()
      await nextTick()

      expect(customCmd.run).toHaveBeenCalled()
    })

    it('does nothing when palette is closed', async () => {
      const wrapper = mountComponent()
      const langHandler = bus.on.mock.calls.find((c) => c[0] === 'language-changed')[1]

      // Should not throw, palette is not open
      langHandler()
    })
  })

  // --- unmount ---
  describe('unmount', () => {
    it('unregisters bus listeners on unmount', () => {
      const wrapper = mountComponent()
      wrapper.unmount()

      expect(bus.off).toHaveBeenCalledWith('show-command-palette', expect.any(Function))
      expect(bus.off).toHaveBeenCalledWith('language-changed', expect.any(Function))
    })
  })
})
