import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/assets/icons/import_file.svg?url', () => ({
  default: 'import_file.svg'
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      import: { title: 'Import', description: 'Drop files here' }
    }
  }
})

// ===================== import/index.vue =====================
describe('import/index.vue — deep coverage', () => {
  let pinia, bus, ImportModal

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    ImportModal = (await import('@/components/import/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(ImportModal, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: { template: '<div><slot /></div>' }
        }
      }
    })

  describe('showDialog', () => {
    it('opens dialog when passed true', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'importDialog')[1]

      handler(true)
      expect(wrapper.vm.showImport).toBe(true)
    })

    it('closes dialog when passed false', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'importDialog')[1]

      handler(true)
      expect(wrapper.vm.showImport).toBe(true)
      handler(false)
      expect(wrapper.vm.showImport).toBe(false)
    })

    it('does nothing when value matches current state', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'importDialog')[1]

      // Initial state is false
      handler(false)
      expect(wrapper.vm.showImport).toBe(false) // unchanged
    })
  })

  describe('drag handlers', () => {
    it('dragOverHandler sets isOver to true', () => {
      const wrapper = mountComponent()
      wrapper.vm.dragOverHandler()
      expect(wrapper.vm.isOver).toBe(true)
    })

    it('dragLeaveHandler sets isOver to false', () => {
      const wrapper = mountComponent()
      wrapper.vm.isOver = true
      wrapper.vm.dragLeaveHandler()
      expect(wrapper.vm.isOver).toBe(false)
    })
  })

  describe('dropHandler', () => {
    it('handles files from dataTransfer.files', () => {
      window.electron.webUtils.getPathForFile = vi.fn((f) => f.path)

      const wrapper = mountComponent()
      const fakeFile = { path: '/tmp/doc.md', name: 'doc.md' }
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: {
          files: [fakeFile],
          items: []
        }
      }

      wrapper.vm.dropHandler(event)

      expect(window.electron.webUtils.getPathForFile).toHaveBeenCalledWith(fakeFile)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::window::drop',
        expect.any(Array)
      )
    })

    it('handles items from dataTransfer.items when files is empty', () => {
      window.electron.webUtils.getPathForFile = vi.fn(() => '/tmp/item.md')

      const wrapper = mountComponent()
      const fakeItem = {
        kind: 'file',
        getAsFile: vi.fn(() => ({ name: 'item.md' }))
      }
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: {
          files: [],
          items: [fakeItem, { kind: 'string' }]
        }
      }

      wrapper.vm.dropHandler(event)

      expect(fakeItem.getAsFile).toHaveBeenCalled()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::window::drop',
        ['/tmp/item.md']
      )
    })
  })

  describe('unmount', () => {
    it('unregisters importDialog bus listener', () => {
      const wrapper = mountComponent()
      wrapper.unmount()
      expect(bus.off).toHaveBeenCalledWith('importDialog', expect.any(Function))
    })
  })
})

// ===================== rename/index.vue =====================
describe('rename/index.vue — deep coverage', () => {
  let pinia, bus, Rename

  const renameI18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md'
    }
    editorStore.rename = vi.fn()

    Rename = (await import('@/components/rename/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(Rename, {
      global: {
        plugins: [pinia, renameI18n],
        stubs: {
          ElDialog: { template: '<div><slot name="title" /><slot /></div>' }
        }
      }
    })

  describe('handleRename', () => {
    it('opens dialog and sets tempName to current filename', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'rename')[1]

      handler()

      expect(wrapper.vm.showRename).toBe(true)
      expect(wrapper.vm.tempName).toBe('test.md')
    })
  })

  describe('confirm', () => {
    it('calls editorStore.rename and closes dialog', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()

      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'rename')[1]
      handler()

      wrapper.vm.tempName = 'renamed.md'
      wrapper.vm.confirm()

      expect(editorStore.rename).toHaveBeenCalledWith('renamed.md')
      expect(wrapper.vm.showRename).toBe(false)
    })
  })

  describe('unmount', () => {
    it('unregisters rename bus listener', () => {
      const wrapper = mountComponent()
      wrapper.unmount()
      expect(bus.off).toHaveBeenCalledWith('rename', expect.any(Function))
    })
  })
})
