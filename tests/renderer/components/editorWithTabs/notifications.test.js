/**
 * C-NOTIFICATION-SYSTEM T-006: tests for the per-file editor banner
 * (editorWithTabs/notifications.vue).
 *
 * Coverage focus:
 *   - Queue semantics unchanged (spec R-8): the queue head renders, OK
 *     answers true, close answers false, answered items shift out.
 *   - The shared visual family: severity glyph mapping for the legacy
 *     style values.
 *   - Copy-on-select works on the banner message (spec R-3/R-8): release
 *     with a selection copies; user-select none is gone.
 *
 * Store strategy: the real editor store pulls the whole theme/config
 * graph into jsdom, so this suite stubs the two consumed stores with real
 * defineStore shapes (storeToRefs-compatible).
 */

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
let idSeq = 0
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'id-' + ++idSeq),
  isOsx: true,
  isWindows: false,
  isLinux: false
}))

vi.mock('@/store/editor', async () => {
  const { defineStore } = await import('pinia')
  return {
    useEditorStore: defineStore('editor', {
      state: () => ({ currentFile: { id: 't1', notifications: [] } })
    })
  }
})

vi.mock('@/store/layout', async () => {
  const { defineStore } = await import('pinia')
  return {
    useLayoutStore: defineStore('layout', {
      state: () => ({ showSideBar: false, sideBarWidth: 280 })
    })
  }
})

import { useEditorStore } from '@/store/editor'
import EditorBanner from '@/components/editorWithTabs/notifications.vue'

const writeText = vi.fn(() => Promise.resolve())

const mountBanner = (notifications) => {
  const editor = useEditorStore()
  editor.currentFile = { id: 't1', notifications: notifications.map((n) => ({ ...n })) }
  return mount(EditorBanner, { attachTo: document.body })
}

describe('editor banner (C-NOTIFICATION-SYSTEM T-006)', () => {
  beforeEach(() => {
    setupTestPinia()
    document.body.innerHTML = ''
    window.getSelection().removeAllRanges()
    writeText.mockClear()
    Object.defineProperty(window, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true
    })
  })

  it('renders nothing without notifications', () => {
    const wrapper = mountBanner([])
    expect(wrapper.find('.editor-notifications').exists()).toBe(false)
  })

  it('renders the queue head with the mapped severity glyph', () => {
    const wrapper = mountBanner([{ msg: 'changed on disk', style: 'warn', showConfirm: true }])
    expect(wrapper.get('.msg').text()).toBe('changed on disk')
    expect(wrapper.attributes('data-notify-severity')).toBe('warning')
    expect(wrapper.find('.sev-glyph svg').exists()).toBe(true)
  })

  it('OK answers true and shifts the queue; close answers false', async () => {
    const answered = []
    const wrapper = mountBanner([
      { msg: 'q1', style: 'crit', showConfirm: true, action: (s) => answered.push(['q1', s]) },
      { msg: 'q2', style: 'crit', action: (s) => answered.push(['q2', s]) }
    ])
    await wrapper.get('.inline-button').trigger('click') // OK on q1
    expect(answered).toEqual([['q1', true]])
    expect(useEditorStore().currentFile.notifications).toHaveLength(1)
    const close = wrapper.findAll('.inline-button').at(-1)
    await close.trigger('click')
    expect(answered).toEqual([['q1', true], ['q2', false]])
    expect(useEditorStore().currentFile.notifications).toHaveLength(0)
  })

  it('copy-on-select releases copy the banner message (spec R-3/R-8)', async () => {
    const wrapper = mountBanner([{ msg: 'the file changed on disk', style: 'warn' }])
    const msg = wrapper.get('.msg')
    const range = document.createRange()
    range.selectNodeContents(msg.element)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    await wrapper.trigger('mouseup')
    expect(writeText).toHaveBeenCalledWith('the file changed on disk')
    expect(msg.element.textContent).toBe('the file changed on disk')
  })
})
