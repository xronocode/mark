/**
 * Tests for src/renderer/src/commands/index.js
 *
 * Covers: RootCommand, static commands array, getCommandsWithDescriptions,
 * focusEditorAndExecute pattern, command exports.
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

const { cmdSetPrefMock } = vi.hoisted(() => ({ cmdSetPrefMock: vi.fn() }))
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({
    SET_SINGLE_PREFERENCE: cmdSetPrefMock
  })
}))

vi.mock('@/commands/utils', () => ({
  isUpdatable: () => false
}))

import commands, {
  RootCommand,
  FileEncodingCommand,
  LineEndingCommand,
  QuickOpenCommand,
  SpellcheckerLanguageCommand,
  TrailingNewlineCommand,
  getCommandsWithDescriptions
} from '@/commands/index'
import bus from '@/bus'

describe('RootCommand', () => {
  it('has id "#"', () => {
    const root = new RootCommand()
    expect(root.id).toBe('#')
  })

  it('has description "#"', () => {
    const root = new RootCommand([])
    expect(root.description).toBe('#')
  })

  it('accepts subcommands in constructor', () => {
    const subs = [{ id: 'a' }, { id: 'b' }]
    const root = new RootCommand(subs)
    expect(root.subcommands).toBe(subs)
  })

  it('run is a no-op', async () => {
    const root = new RootCommand()
    await expect(root.run()).resolves.toBeUndefined()
  })

  it('unload is a no-op', async () => {
    const root = new RootCommand()
    await expect(root.unload()).resolves.toBeUndefined()
  })

  it('execute throws', async () => {
    const root = new RootCommand()
    await expect(root.execute()).rejects.toThrow('Root command.')
  })

  it('subcommandSelectedIndex defaults to -1', () => {
    const root = new RootCommand()
    expect(root.subcommandSelectedIndex).toBe(-1)
  })
})

describe('static commands array', () => {
  it('is an array', () => {
    expect(Array.isArray(commands)).toBe(true)
  })

  it('contains commands with id and either execute or subcommands', () => {
    for (const cmd of commands) {
      expect(cmd.id).toBeDefined()
      expect(typeof cmd.id).toBe('string')
      const hasAction = typeof cmd.execute === 'function' || Array.isArray(cmd.subcommands)
      expect(hasAction).toBe(true)
    }
  })

  it('includes file.new-tab', () => {
    expect(commands.find((c) => c.id === 'file.new-tab')).toBeDefined()
  })

  it('includes file.save', () => {
    expect(commands.find((c) => c.id === 'file.save')).toBeDefined()
  })

  it('includes edit.undo', () => {
    expect(commands.find((c) => c.id === 'edit.undo')).toBeDefined()
  })

  it('includes window.change-theme with subcommands', () => {
    const c = commands.find((c) => c.id === 'window.change-theme')
    expect(c).toBeDefined()
    expect(c.subcommands.length).toBeGreaterThan(0)
  })

  it('includes file.zoom with subcommands', () => {
    const c = commands.find((c) => c.id === 'file.zoom')
    expect(c).toBeDefined()
    expect(c.subcommands.length).toBe(12)
  })

  it('includes view.text-direction with subcommands', () => {
    const c = commands.find((c) => c.id === 'view.text-direction')
    expect(c).toBeDefined()
    expect(c.subcommands.length).toBe(2)
  })

  it('all commands have descriptions set', () => {
    for (const cmd of commands) {
      expect(cmd.description).toBeDefined()
    }
  })

  it('includes edit.screenshot on macOS', () => {
    expect(commands.find((c) => c.id === 'edit.screenshot')).toBeDefined()
  })
})

describe('command execute actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('file.new-tab emits mt::new-untitled-tab', async () => {
    const cmd = commands.find((c) => c.id === 'file.new-tab')
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('mt::new-untitled-tab', {
      selected: true,
      markdown: ''
    })
  })

  it('file.save emits mt::editor-ask-file-save', async () => {
    const cmd = commands.find((c) => c.id === 'file.save')
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('mt::editor-ask-file-save')
  })

  it('file.close-tab emits mt::editor-close-tab', async () => {
    const cmd = commands.find((c) => c.id === 'file.close-tab')
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('mt::editor-close-tab', null)
  })

  it('edit.undo emits undo after delay', () => {
    const cmd = commands.find((c) => c.id === 'edit.undo')
    cmd.execute()
    vi.advanceTimersByTime(200)
    expect(bus.emit).toHaveBeenCalledWith('editor-focus')
    expect(bus.emit).toHaveBeenCalledWith('undo', 'undo')
  })

  it('paragraph.heading-1 emits paragraph with "heading 1"', () => {
    const cmd = commands.find((c) => c.id === 'paragraph.heading-1')
    cmd.execute()
    vi.advanceTimersByTime(200)
    expect(bus.emit).toHaveBeenCalledWith('paragraph', 'heading 1')
  })

  it('format.strong emits format with "strong"', () => {
    const cmd = commands.find((c) => c.id === 'format.strong')
    cmd.execute()
    vi.advanceTimersByTime(200)
    expect(bus.emit).toHaveBeenCalledWith('format', 'strong')
  })

  it('view.toggle-sidebar emits view:toggle-layout-entry', async () => {
    const cmd = commands.find((c) => c.id === 'view.toggle-sidebar')
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('view:toggle-layout-entry', 'showSideBar')
  })

  it('file.zoom executeSubcommand emits mt::window-zoom', async () => {
    const cmd = commands.find((c) => c.id === 'file.zoom')
    await cmd.executeSubcommand(null, 1.5)
    expect(bus.emit).toHaveBeenCalledWith('mt::window-zoom', 1.5)
  })

  it('tabs.cycleForward emits mt::tabs-cycle-right', async () => {
    const cmd = commands.find((c) => c.id === 'tabs.cycleForward')
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('mt::tabs-cycle-right')
  })

  it('tabs.cycleBackward emits mt::tabs-cycle-left', async () => {
    const cmd = commands.find((c) => c.id === 'tabs.cycleBackward')
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('mt::tabs-cycle-left')
  })
})

describe('window.change-theme subcommands', () => {
  const themeCmd = commands.find((c) => c.id === 'window.change-theme')

  it('has 33 theme subcommands', () => {
    expect(themeCmd.subcommands).toHaveLength(33)
  })

  it('all subcommands have id, description, and value', () => {
    for (const sub of themeCmd.subcommands) {
      expect(sub.id).toMatch(/^window\.change-theme-/)
      expect(sub.description).toBeTruthy()
      expect(sub.value).toBeTruthy()
    }
  })

  it('subcommand ids match value pattern', () => {
    for (const sub of themeCmd.subcommands) {
      expect(sub.id).toBe(`window.change-theme-${sub.value}`)
    }
  })

  it('includes all light themes', () => {
    const values = themeCmd.subcommands.map((s) => s.value)
    for (const t of ['light', 'graphite', 'ulysses', 'ayu-light', 'catppuccin-latte',
      'everforest-light', 'gruvbox-light', 'rose-pine-dawn', 'solarized-light', 'tokyo-night-light']) {
      expect(values).toContain(t)
    }
  })

  it('includes all dark themes', () => {
    const values = themeCmd.subcommands.map((s) => s.value)
    for (const t of ['dark', 'material-dark', 'one-dark', 'dracula', 'nord',
      'catppuccin-mocha', 'tokyo-night', 'synthwave-84']) {
      expect(values).toContain(t)
    }
  })

  it('executeSubcommand sets theme preference', async () => {
    cmdSetPrefMock.mockClear()
    await themeCmd.executeSubcommand(null, 'dracula')
    expect(cmdSetPrefMock).toHaveBeenCalledWith({
      type: 'theme',
      value: 'dracula'
    })
  })

  it('no duplicate subcommand values', () => {
    const values = themeCmd.subcommands.map((s) => s.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('getCommandsWithDescriptions', () => {
  it('returns the commands array', async () => {
    const result = await getCommandsWithDescriptions()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('updates descriptions for all commands', async () => {
    const result = await getCommandsWithDescriptions()
    for (const cmd of result) {
      if (cmd.id) {
        expect(cmd.description).toBeDefined()
      }
    }
  })

  it('updates theme subcommand descriptions', async () => {
    const result = await getCommandsWithDescriptions()
    const themeCmd = result.find((c) => c.id === 'window.change-theme')
    expect(themeCmd).toBeDefined()
    for (const sub of themeCmd.subcommands) {
      expect(sub.description).toBeDefined()
    }
  })
})

describe('re-exports', () => {
  it('exports FileEncodingCommand', () => {
    expect(FileEncodingCommand).toBeDefined()
  })

  it('exports LineEndingCommand', () => {
    expect(LineEndingCommand).toBeDefined()
  })

  it('exports QuickOpenCommand', () => {
    expect(QuickOpenCommand).toBeDefined()
  })

  it('exports SpellcheckerLanguageCommand', () => {
    expect(SpellcheckerLanguageCommand).toBeDefined()
  })

  it('exports TrailingNewlineCommand', () => {
    expect(TrailingNewlineCommand).toBeDefined()
  })
})
