/**
 * Tests for src/renderer/src/prefComponents/keybindings/KeybindingConfigurator.js
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

vi.mock('common/keybinding', () => ({
  isEqualAccelerator: (a, b) => {
    if (!a || !b) return false
    return a.toLowerCase() === b.toLowerCase()
  }
}))

vi.mock('@/commands/descriptions', () => ({
  default: (id) => `description:${id}`
}))

vi.mock('@/util', () => ({
  isOsx: false
}))

import KeybindingConfigurator from '@/prefComponents/keybindings/KeybindingConfigurator'

describe('KeybindingConfigurator', () => {
  let defaultKeybindings
  let userKeybindings
  let configurator

  beforeEach(() => {
    defaultKeybindings = new Map([
      ['file.new', 'Ctrl+N'],
      ['file.open', 'Ctrl+O'],
      ['file.save', 'Ctrl+S'],
      ['edit.undo', 'Ctrl+Z']
    ])
    userKeybindings = new Map()
    configurator = new KeybindingConfigurator(defaultKeybindings, userKeybindings)
  })

  describe('constructor', () => {
    it('creates a keybinding list from defaults', () => {
      const list = configurator.getKeybindings()
      expect(Array.isArray(list)).toBe(true)
      expect(list).toHaveLength(4)
    })

    it('sorts keybindings by description', () => {
      const list = configurator.getKeybindings()
      for (let i = 1; i < list.length; i++) {
        expect(list[i].description >= list[i - 1].description).toBe(true)
      }
    })

    it('isDirty is false initially', () => {
      expect(configurator.isDirty).toBe(false)
    })
  })

  describe('constructor with user keybindings', () => {
    it('overrides default with user keybindings', () => {
      const userKb = new Map([['file.new', 'Ctrl+Shift+N']])
      const cfg = new KeybindingConfigurator(defaultKeybindings, userKb)
      const list = cfg.getKeybindings()
      const entry = list.find((e) => e.id === 'file.new')
      expect(entry.accelerator).toBe('Ctrl+Shift+N')
      expect(entry.type).toBe(1) // SHORTCUT_TYPE_USER
    })
  })

  describe('getKeybindings', () => {
    it('returns the keybinding list', () => {
      const list = configurator.getKeybindings()
      expect(list).toBe(configurator.keybindingList)
    })
  })

  describe('change', () => {
    it('changes accelerator for existing id', () => {
      const success = configurator.change('file.new', 'Ctrl+Shift+N')
      expect(success).toBe(true)
      const entry = configurator.getKeybindings().find((e) => e.id === 'file.new')
      expect(entry.accelerator).toBe('Ctrl+Shift+N')
    })

    it('marks configurator as dirty', () => {
      configurator.change('file.new', 'Ctrl+Shift+N')
      expect(configurator.isDirty).toBe(true)
    })

    it('returns false for non-existent id', () => {
      const success = configurator.change('nonexistent', 'Ctrl+X')
      expect(success).toBe(false)
    })

    it('returns false for duplicate accelerator', () => {
      const success = configurator.change('file.new', 'Ctrl+O') // already used by file.open
      expect(success).toBe(false)
    })

    it('sets type to DEFAULT when matching default', () => {
      // First change to something different
      configurator.change('file.new', 'Ctrl+Shift+N')
      // Then change back to default
      configurator.change('file.new', 'Ctrl+N')
      const entry = configurator.getKeybindings().find((e) => e.id === 'file.new')
      expect(entry.type).toBe(0) // SHORTCUT_TYPE_DEFAULT
    })
  })

  describe('unbind', () => {
    it('sets accelerator to empty string', () => {
      configurator.unbind('file.new')
      const entry = configurator.getKeybindings().find((e) => e.id === 'file.new')
      expect(entry.accelerator).toBe('')
    })
  })

  describe('resetToDefault', () => {
    it('resets to default accelerator', () => {
      configurator.change('file.new', 'Ctrl+Shift+N')
      const success = configurator.resetToDefault('file.new')
      expect(success).toBe(true)
      const entry = configurator.getKeybindings().find((e) => e.id === 'file.new')
      expect(entry.accelerator).toBe('Ctrl+N')
    })

    it('returns false for unknown id', () => {
      const success = configurator.resetToDefault('nonexistent')
      expect(success).toBe(false)
    })
  })

  describe('resetAll', () => {
    it('resets all keybindings and saves', async () => {
      window.electron.ipcRenderer.invoke.mockResolvedValueOnce(true)
      configurator.change('file.new', 'Ctrl+Shift+N')
      const success = await configurator.resetAll()
      expect(success).toBe(true)
      const entry = configurator.getKeybindings().find((e) => e.id === 'file.new')
      expect(entry.accelerator).toBe('Ctrl+N')
      expect(entry.type).toBe(0)
    })
  })

  describe('save', () => {
    it('returns true immediately if not dirty', async () => {
      const success = await configurator.save()
      expect(success).toBe(true)
    })

    it('invokes ipcRenderer with user keybindings when dirty', async () => {
      configurator.change('file.new', 'Ctrl+Shift+N')
      window.electron.ipcRenderer.invoke.mockResolvedValueOnce(true)
      const success = await configurator.save()
      expect(success).toBe(true)
      expect(configurator.isDirty).toBe(false)
    })

    it('returns false when ipcRenderer returns false', async () => {
      configurator.change('file.new', 'Ctrl+Shift+N')
      window.electron.ipcRenderer.invoke.mockResolvedValueOnce(false)
      const success = await configurator.save()
      expect(success).toBe(false)
    })
  })

  describe('getDefaultAccelerator', () => {
    it('returns the default accelerator for an id', () => {
      expect(configurator.getDefaultAccelerator('file.new')).toBe('Ctrl+N')
    })

    it('returns undefined for unknown id', () => {
      expect(configurator.getDefaultAccelerator('nonexistent')).toBeUndefined()
    })
  })

  describe('rebuildKeybindingList', () => {
    it('rebuilds the list preserving user changes', () => {
      configurator.change('file.new', 'Ctrl+Shift+N')
      const list = configurator.rebuildKeybindingList()
      expect(Array.isArray(list)).toBe(true)
      const entry = list.find((e) => e.id === 'file.new')
      expect(entry.accelerator).toBe('Ctrl+Shift+N')
    })
  })

  describe('skips mt. prefixed commands on non-OSX', () => {
    it('filters mt. commands when isOsx is false', () => {
      const defaults = new Map([
        ['mt.hide', 'Cmd+H'],
        ['file.new', 'Ctrl+N']
      ])
      const cfg = new KeybindingConfigurator(defaults, new Map())
      const ids = cfg.getKeybindings().map((e) => e.id)
      expect(ids).not.toContain('mt.hide')
      expect(ids).toContain('file.new')
    })
  })
})
