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
 *   - The truthful copy pulse (C-RENDER-REVIEW-FIXES T-005): the pulse only
 *     follows a resolved successful clipboard write — a missing API and a
 *     rejected write never pulse; a selection collapsed before the write
 *     resolves still pulses the captured Range snapshot (no throw, no
 *     unhandled rejection).
 *
 * Store strategy: the real editor store pulls the whole theme/config
 * graph into jsdom, so this suite stubs the two consumed stores with real
 * defineStore shapes (storeToRefs-compatible).
 */

import { mount, flushPromises } from '@vue/test-utils'
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

  // C-RENDER-REVIEW-FIXES T-005: truthful copy on the banner surface — the
  // pulse only follows a resolved successful clipboard write; the Range is
  // captured synchronously at release, so a selection that collapses before
  // the write resolves can neither throw, nor leave an unhandled rejection,
  // nor pulse a node other than the captured snapshot.
  describe('truthful copy pulse (C-RENDER-REVIEW-FIXES T-005)', () => {
    let unhandled
    let onUnhandled

    beforeEach(() => {
      unhandled = []
      onUnhandled = (reason) => { unhandled.push(reason) }
      process.on('unhandledRejection', onUnhandled)
    })

    afterEach(() => {
      process.off('unhandledRejection', onUnhandled)
      expect(unhandled).toEqual([])
    })

    const selectBanner = (wrapper) => {
      const msg = wrapper.get('.msg')
      const range = document.createRange()
      range.selectNodeContents(msg.element)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      return sel
    }

    const mountWithSelection = () => {
      const wrapper = mountBanner([{ msg: 'the file changed on disk', style: 'warn' }])
      selectBanner(wrapper)
      return wrapper
    }

    const pulseSpans = (wrapper) => wrapper.findAll('.msg .notify-copied-pulse')

    it('a resolving write pulses exactly once on the copied range', async () => {
      const wrapper = mountWithSelection()
      await wrapper.trigger('mouseup')
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(1)
      expect(wrapper.get('.msg .notify-copied-pulse').text()).toBe('the file changed on disk')
    })

    it('a missing clipboard API produces no pulse and no throw', async () => {
      Object.defineProperty(window, 'navigator', { value: {}, configurable: true })
      const wrapper = mountWithSelection()
      await wrapper.trigger('mouseup')
      await flushPromises()
      expect(writeText).not.toHaveBeenCalled()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })

    it('a rejecting clipboard write stays silent and produces no pulse', async () => {
      writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')))
      const wrapper = mountWithSelection()
      await wrapper.trigger('mouseup')
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })

    it('the selection collapses before resolution: a real write still pulses the captured snapshot', async () => {
      let resolveWrite
      writeText.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve }))
      const wrapper = mountWithSelection()
      await wrapper.trigger('mouseup')
      // The selection collapses while the write is still pending.
      window.getSelection().removeAllRanges()
      resolveWrite()
      await flushPromises()
      // The captured Range is a frozen snapshot — honest feedback for a
      // copy that did happen lands on the captured node.
      expect(pulseSpans(wrapper)).toHaveLength(1)
      expect(wrapper.get('.msg .notify-copied-pulse').text()).toBe('the file changed on disk')
    })

    it('the selection collapses before resolution: an absent API never pulses', async () => {
      Object.defineProperty(window, 'navigator', { value: {}, configurable: true })
      const wrapper = mountWithSelection()
      await wrapper.trigger('mouseup')
      window.getSelection().removeAllRanges()
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })

    it('the selection collapses before resolution: a rejected write never pulses', async () => {
      let rejectWrite
      writeText.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectWrite = reject }))
      const wrapper = mountWithSelection()
      await wrapper.trigger('mouseup')
      window.getSelection().removeAllRanges()
      rejectWrite(new Error('denied'))
      await flushPromises()
      expect(pulseSpans(wrapper)).toHaveLength(0)
    })
  })
})
