/**
 * Unit tests for src/renderer/src/store/commandCenter.js
 *
 * Covers:
 *   - initial state: rootCommand is a RootCommand wrapping staticCommands
 *   - REGISTER_COMMAND pushes to subcommands
 *   - SORT_COMMANDS sorts via localeCompare on description
 *   - LISTEN_COMMAND_CENTER_BUS:
 *       * fetches commands via getCommandsWithDescriptions, sorts
 *       * registers handlers for language-changed / cmd::sort-commands /
 *         cmd::register-command / cmd::execute
 *       * language-changed re-fetches descriptions
 *       * cmd::execute path → finds + runs command
 *   - EXECUTE_COMMAND_BY_ID throws when command is missing
 */

import { setupTestPinia } from '../pinia'

// Per-file bus mock with a captureable on() that records handlers.
const busHandlers: Record<string, (...args: unknown[]) => void> = {}
const busOnMock = vi.fn((event: string, handler: (...a: unknown[]) => void) => {
  busHandlers[event] = handler
})
vi.mock('@/bus', () => ({
  default: {
    on: busOnMock,
    emit: vi.fn(),
    off: vi.fn()
  }
}))

// electron-log alias points to a shim, but mock here to avoid surprises.
vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

// Mock the entire commands module — the real one imports tons of code
// (i18n, prefs store, etc.) that we don't need to exercise here.
class FakeRootCommand {
  id = '#'
  description = '#'
  subcommands: Array<{ id: string; description: string; execute: () => void }>
  subcommandSelectedIndex = -1
  constructor(subcommands: any[] = []) {
    // Copy so module-shared default array isn't mutated across tests.
    this.subcommands = [...subcommands]
  }
}
// Use a getter so each `import` of `@/commands` (per-test, fresh Pinia)
// receives a NEW array — REGISTER_COMMAND would otherwise mutate the
// module-shared array and leak across tests.
const makeStaticCommands = () => [
  { id: 'cmd.b', description: 'Banana', execute: vi.fn() },
  { id: 'cmd.a', description: 'Apple', execute: vi.fn() }
]
let initialStaticCommands = makeStaticCommands()
const descriptionsBatch = [
  { id: 'cmd.c', description: 'Cherry', execute: vi.fn() },
  { id: 'cmd.a2', description: 'Avocado', execute: vi.fn() }
]
const getCommandsWithDescriptionsMock = vi.fn(async () => [...descriptionsBatch])

vi.mock('@/commands', () => ({
  default: initialStaticCommands,
  RootCommand: FakeRootCommand,
  getCommandsWithDescriptions: getCommandsWithDescriptionsMock
}))

describe('store/commandCenter', () => {
  beforeEach(() => {
    setupTestPinia()
    busOnMock.mockClear()
    Object.keys(busHandlers).forEach((k) => delete busHandlers[k])
    getCommandsWithDescriptionsMock.mockClear()
  })

  it('initial state: rootCommand wraps staticCommands', async () => {
    const { useCommandCenterStore } = await import('@/store/commandCenter')
    const s = useCommandCenterStore()
    expect(s.rootCommand).toBeInstanceOf(FakeRootCommand)
    expect(s.rootCommand.subcommands).toHaveLength(2)
    expect(s.rootCommand.subcommands[0].id).toBe('cmd.b')
  })

  it('REGISTER_COMMAND pushes onto subcommands', async () => {
    const { useCommandCenterStore } = await import('@/store/commandCenter')
    const s = useCommandCenterStore()
    const before = s.rootCommand.subcommands.length
    s.REGISTER_COMMAND({ id: 'cmd.x', description: 'X', execute: vi.fn() })
    expect(s.rootCommand.subcommands.length).toBe(before + 1)
    expect(s.rootCommand.subcommands.some((c: any) => c.id === 'cmd.x')).toBe(true)
  })

  it('SORT_COMMANDS sorts subcommands by description (localeCompare)', async () => {
    const { useCommandCenterStore } = await import('@/store/commandCenter')
    const s = useCommandCenterStore()
    s.SORT_COMMANDS()
    const order = s.rootCommand.subcommands.map((c: any) => c.description)
    // Initial state has [Banana, Apple]; sorted should be [Apple, Banana]
    expect(order).toEqual(['Apple', 'Banana'])
  })

  describe('LISTEN_COMMAND_CENTER_BUS', () => {
    it('populates subcommands from getCommandsWithDescriptions and sorts', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      await s.LISTEN_COMMAND_CENTER_BUS()
      expect(getCommandsWithDescriptionsMock).toHaveBeenCalledTimes(1)
      const order = s.rootCommand.subcommands.map((c: any) => c.description)
      expect(order).toEqual(['Avocado', 'Cherry'])
    })

    it('registers handlers for the four bus events', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      await s.LISTEN_COMMAND_CENTER_BUS()
      const events = busOnMock.mock.calls.map((c) => c[0])
      expect(events).toContain('language-changed')
      expect(events).toContain('cmd::sort-commands')
      expect(events).toContain('cmd::register-command')
      expect(events).toContain('cmd::execute')
    })

    it('language-changed handler re-fetches descriptions and re-sorts', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      await s.LISTEN_COMMAND_CENTER_BUS()
      getCommandsWithDescriptionsMock.mockClear()
      getCommandsWithDescriptionsMock.mockResolvedValueOnce([
        { id: 'cmd.z', description: 'Zelda', execute: vi.fn() },
        { id: 'cmd.q', description: 'Quokka', execute: vi.fn() }
      ])
      await busHandlers['language-changed']()
      expect(getCommandsWithDescriptionsMock).toHaveBeenCalledTimes(1)
      const order = s.rootCommand.subcommands.map((c: any) => c.description)
      expect(order).toEqual(['Quokka', 'Zelda'])
    })

    it('cmd::sort-commands handler triggers SORT_COMMANDS', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      await s.LISTEN_COMMAND_CENTER_BUS()
      // Insert one out-of-order item, then dispatch
      s.rootCommand.subcommands.push({ id: 'cmd.aa', description: 'AAA', execute: vi.fn() })
      busHandlers['cmd::sort-commands']()
      const order = s.rootCommand.subcommands.map((c: any) => c.description)
      expect(order[0]).toBe('AAA')
    })

    it('cmd::register-command handler appends a command', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      await s.LISTEN_COMMAND_CENTER_BUS()
      const fresh = { id: 'cmd.fresh', description: 'Fresh', execute: vi.fn() }
      const before = s.rootCommand.subcommands.length
      busHandlers['cmd::register-command'](fresh)
      expect(s.rootCommand.subcommands.length).toBe(before + 1)
      expect(s.rootCommand.subcommands.some((c: any) => c.id === 'cmd.fresh')).toBe(true)
    })

    it('cmd::execute handler runs the matching command', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      await s.LISTEN_COMMAND_CENTER_BUS()
      const target = s.rootCommand.subcommands.find((c: any) => c.id === 'cmd.c')!
      busHandlers['cmd::execute']('cmd.c')
      expect(target.execute).toHaveBeenCalled()
    })
  })

  describe('EXECUTE_COMMAND_BY_ID', () => {
    it('runs the matching command', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      const cmd = { id: 'cmd.run', description: 'Run', execute: vi.fn() }
      s.REGISTER_COMMAND(cmd)
      s.EXECUTE_COMMAND_BY_ID('cmd.run')
      expect(cmd.execute).toHaveBeenCalled()
    })

    it('throws when the command is missing', async () => {
      const { useCommandCenterStore } = await import('@/store/commandCenter')
      const s = useCommandCenterStore()
      expect(() => s.EXECUTE_COMMAND_BY_ID('cmd.does-not-exist')).toThrow(/missing/)
    })
  })
})
