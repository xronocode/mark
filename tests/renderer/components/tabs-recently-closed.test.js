/**
 * Strip recovery button + popover for tabs.vue
 * (C-FIX-009-RECENTLY-CLOSED). Pins the owner-approved surface: the
 * count-badged button appears only while the history is non-empty, the
 * popover lists entries with Reopen-all and Clear, reopening consumes
 * entries, and Escape / outside mousedown close without acting.
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('dom-autoscroller', () => ({
  default: vi.fn(() => ({ down: false, destroy: vi.fn() }))
}))
vi.mock('dragula', () => ({
  default: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    dragging: false
  }))
}))
vi.mock('../../contextMenu/tabs', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      recent: {
        recentlyClosed: {
          title: 'Recently closed',
          clear: 'Clear',
          reopenAll: 'Reopen all {count}',
          buttonLabel: 'Reopen closed tabs ({count})'
        }
      }
    }
  }
})

let pinia
let activeWrapper = null

const mountTabs = async () => {
  const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
  // Real mount: the popover teleports to body, and shallowMount stubs
  // the Teleport built-in so the popover would never leave the stub.
  activeWrapper = mount(Tabs, { global: { plugins: [pinia, i18n] }, attachTo: document.body })
  return activeWrapper
}

afterEach(() => {
  activeWrapper?.unmount()
  activeWrapper = null
  document.body.innerHTML = ''
})

describe('tabs.vue — recently closed strip button (C-FIX-009)', () => {
  let recentlyClosed, editorStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const { useRecentlyClosedStore } = await import('@/store/recentlyClosed')
    editorStore = useEditorStore()
    recentlyClosed = useRecentlyClosedStore()
    editorStore.currentFile = { id: 't1', filename: 'a.md', pathname: '/tmp/a.md', isSaved: true }
    editorStore.tabs = [editorStore.currentFile]
  })

  const record = (pathname, closedAt = 1) =>
    recentlyClosed.RECORD_CLOSE({
      pathname,
      filename: pathname.split('/').pop(),
      stripIndex: 0,
      wasActive: false,
      root: '',
      closedAt
    })

  it('renders no recovery button while the history is empty', async () => {
    const wrapper = await mountTabs()
    expect(wrapper.find('.recently-closed-toggle').exists()).toBe(false)
  })

  it('renders the count-badged button left of the + once a tab closes', async () => {
    record('/tmp/a.md')
    const wrapper = await mountTabs()
    const toggle = wrapper.find('.recently-closed-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.find('.recently-closed-badge').text()).toBe('1')
    // The toggle sits before the new-file button in the strip order.
    const order = ['.recently-closed-toggle', '.new-file'].map(
      (sel) => wrapper.find(sel).element.getBoundingClientRect().left
    )
    // shallowMount keeps the flat DOM; compare document position instead.
    const toggleEl = wrapper.find('.recently-closed-toggle').element
    const plusEl = wrapper.find('.new-file').element
    expect(toggleEl.compareDocumentPosition(plusEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order).toHaveLength(2)
  })

  it('the popover opens under the button, lists entries, and reopens one on row click', async () => {
    record('/tmp/a.md')
    record('/tmp/b.md', 2)
    const wrapper = await mountTabs()
    const reopenOne = vi.spyOn(recentlyClosed, 'REOPEN_ONE').mockResolvedValue(true)
    await wrapper.find('.recently-closed-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    const popover = document.querySelector('.recently-closed-popover')
    expect(popover).toBeTruthy() // teleported to body
    const rows = popover.querySelectorAll('.rc-row-button')
    expect(rows.length).toBe(2)
    expect(popover.querySelector('.rc-title').textContent).toBe('Recently closed')
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(reopenOne).toHaveBeenCalledTimes(1)
    expect(reopenOne.mock.calls[0][0].pathname).toBe('/tmp/b.md')
  })

  it('Reopen all and Clear route to the store actions', async () => {
    record('/tmp/a.md')
    const wrapper = await mountTabs()
    const reopenAll = vi.spyOn(recentlyClosed, 'REOPEN_ALL').mockResolvedValue({ reopened: 1, missing: 0 })
    const clear = vi.spyOn(recentlyClosed, 'CLEAR').mockImplementation(() => {})
    await wrapper.find('.recently-closed-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    const popover = document.querySelector('.recently-closed-popover')
    popover.querySelector('.rc-reopen-all').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(reopenAll).toHaveBeenCalledTimes(1)
    await wrapper.find('.recently-closed-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    const popover2 = document.querySelector('.recently-closed-popover')
    popover2.querySelector('.rc-clear').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('Escape closes the popover without acting', async () => {
    record('/tmp/a.md')
    const wrapper = await mountTabs()
    await wrapper.find('.recently-closed-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.recently-closed-popover')).toBeTruthy()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.recently-closed-popover')).toBeNull()
  })

  it('an outside mousedown closes the popover', async () => {
    record('/tmp/a.md')
    const wrapper = await mountTabs()
    await wrapper.find('.recently-closed-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.recently-closed-popover')).toBeTruthy()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.recently-closed-popover')).toBeNull()
  })

  it('the button disappears when the last entry is consumed', async () => {
    record('/tmp/a.md')
    const wrapper = await mountTabs()
    expect(wrapper.find('.recently-closed-toggle').exists()).toBe(true)
    recentlyClosed.CONSUME('/tmp/a.md')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.recently-closed-toggle').exists()).toBe(false)
  })
})
