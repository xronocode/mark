// FILE: tests/renderer/components/whatsNew.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 What's New sheet component — opens on the
//            whatsNewDialog bus event, renders the 2.3.1 items from the
//            en table, Esc/Continue close it, focus is trapped and
//            returned, "See the guide" opens the guide at the top
//            (mt::open-guide with {}), and the dialog label is localized.
//   SCOPE: src/renderer/src/components/whatsNew/index.vue behaviour.
//   DEPENDS: @vue/test-utils, mocked @/bus, real i18n t (en table).
//   LINKS: .grace/changes/active/C-48/spec.xml R-1; V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountSheet - mount the sheet with a real DOM body and return helpers.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-48 review fix: guide link payload is
//   {} (C-40 has no 'whats-new' section); aria-label follows the active
//   locale (ru pin) instead of a hard-coded English string.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/bus', () => {
  const handlers = new Map()
  return {
    default: {
      on: vi.fn((event, handler) => {
        if (!handlers.has(event)) handlers.set(event, [])
        handlers.get(event).push(handler)
      }),
      off: vi.fn((event, handler) => {
        const list = handlers.get(event) || []
        const idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }),
      emit: vi.fn((event, payload) => {
        for (const handler of [...(handlers.get(event) || [])]) handler(payload)
      })
    },
    __handlers: handlers
  }
})

import bus from '@/bus'
import { i18n } from '@/i18n'
import ruTranslations from '../../../static/locales/ru.json'
import WhatsNewSheet from '@/components/whatsNew/index.vue'

// TOP-LEVEL helper (TEST/LOCALS).
const mountSheet = () => mount(WhatsNewSheet, { attachTo: document.body })

describe('components/whatsNew — sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('is hidden until the whatsNewDialog event opens it', () => {
    const wrapper = mountSheet()
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the eyebrow, title and all four 2.3.1 items from the en table', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.3.1' })
    await nextTick()

    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(true)
    expect(wrapper.find('.eyebrow').text()).toBe('Mark 2.3.1')
    expect(wrapper.find('.title').text()).toBe("What's new")
    const items = wrapper.findAll('.news li')
    expect(items).toHaveLength(4)
    expect(items[0].find('b').text()).toBe('Zoom into diagrams and tables')
    expect(items[0].find('.news-body span').text()).toContain('fullscreen view')
    expect(items[2].find('b').text()).toBe('Paper and Ink')
    // icons mirror the approved board 3 mockup
    const icons = wrapper.findAll('.news-icon').map((i) => i.text())
    expect(icons).toEqual(['⤢', '±', '◐', '▦'])
    expect(wrapper.find('.guide-link').text()).toBe('See the guide')
    expect(wrapper.find('.continue-button').text()).toBe('Continue')

    wrapper.unmount()
  })

  it('a version without content never opens the sheet', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '9.9.9' })
    await nextTick()
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Continue closes the sheet', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.3.1' })
    await nextTick()
    await wrapper.find('.continue-button').trigger('click')
    await nextTick()
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Esc on the sheet closes it', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.3.1' })
    await nextTick()
    await wrapper.find('.ag-whats-new-sheet').trigger('keydown.esc')
    await nextTick()
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(false)
    wrapper.unmount()
  })

  it('focuses Continue on open and returns focus to the previous element on close', async () => {
    const before = document.createElement('button')
    before.className = 'outside-focus-target'
    document.body.appendChild(before)
    before.focus()

    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.3.1' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('.continue-button').element)

    await wrapper.find('.continue-button').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(before)
    wrapper.unmount()
    before.remove()
  })

  it('traps Tab inside the sheet footer controls', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.3.1' })
    await nextTick()
    await nextTick()

    const sheet = wrapper.find('.ag-whats-new-sheet')
    const guide = wrapper.find('.guide-link')
    const cont = wrapper.find('.continue-button')

    // Continue → wraps forward to the guide link
    await cont.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(guide.element)
    // Guide → Shift+Tab wraps back to Continue
    await guide.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cont.element)

    wrapper.unmount()
  })

  it('See the guide opens the guide at the top (no unknown section) and keeps the sheet open', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.3.1' })
    await nextTick()

    await wrapper.find('.guide-link').trigger('click')
    expect(bus.emit).toHaveBeenCalledWith('mt::open-guide', {})
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(true)

    wrapper.unmount()
  })

  it('the dialog aria-label is the localized whatsNew.title (not hard-coded English)', async () => {
    i18n.global.setLocaleMessage('ru', ruTranslations)
    i18n.global.locale.value = 'ru'
    try {
      const wrapper = mountSheet()
      bus.emit('whatsNewDialog', { version: '2.3.1' })
      await nextTick()
      expect(wrapper.find('.ag-whats-new-sheet').attributes('aria-label')).toBe(
        ruTranslations.whatsNew.title
      )
      wrapper.unmount()
    } finally {
      i18n.global.locale.value = 'en'
    }
  })

  it('unmount removes the bus subscription', () => {
    const wrapper = mountSheet()
    wrapper.unmount()
    expect(bus.off).toHaveBeenCalledWith('whatsNewDialog', expect.any(Function))
  })
})
