// FILE: tests/renderer/components/whatsNew.test.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48/C-53 What's New sheet component — opens on the
//            whatsNewDialog bus event, renders the 2.5.0 C-55 items from
//            the en table plus the C-53 «Also» line and «See everything
//            new» external link, Esc/Continue close it, focus is trapped
//            across the three footer controls and returned, "See the
//            guide" opens the guide at the top (mt::open-guide with {}),
//            the release link opens the GitHub release page through
//            window.electron.shell.openExternal, and the dialog label is
//            localized.
//   SCOPE: src/renderer/src/components/whatsNew/index.vue behaviour.
//   DEPENDS: @vue/test-utils, mocked @/bus, real i18n t (en table),
//          tests/renderer/setup.ts window.electron.shell.openExternal.
//   LINKS: .grace/changes/active/C-53/spec.xml R-1 (D-1 sheet);
//          .grace/verification/runtime.xml V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountSheet - mount the sheet with a real DOM body and return helpers.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-18 release 2.5.0: What's New pins move to the 2.5.0 sheet (the previous release 2.4.0 becomes the upgrade source).
//   v1.2.0 - 2026-10-17 C-53 T-001/R-1: pins the four D-1
//   items (native look, home screen, themed diagrams, Markdown-only
//   folders) with the new icon set, the «Also» line, the «See everything
//   new» link (opens WHATS_NEW_RELEASE_URLS['2.5.0'] through
//   window.electron.shell.openExternal and keeps the sheet open), and
//   the Tab trap across the three footer controls.
//   PREV: v1.1.0 - 2026-10-15 C-48 review fix: guide link payload is
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
import { WHATS_NEW_RELEASE_URLS } from '@/whatsNew/data'
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

  it('renders the eyebrow, title, the four 2.5.0 C-55 items and the also line from the en table', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.5.0' })
    await nextTick()

    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(true)
    expect(wrapper.find('.eyebrow').text()).toBe('Mark 2.5.0')
    expect(wrapper.find('.title').text()).toBe("What's new")
    const items = wrapper.findAll('.news li')
    expect(items).toHaveLength(4)
    expect(items[0].find('b').text()).toBe('Diagrams as pictures')
    expect(items[0].find('.news-body span').text()).toContain('PNG')
    expect(items[1].find('b').text()).toBe('A look for each diagram')
    expect(items[2].find('b').text()).toBe('Print and PDF, each direct')
    expect(items[3].find('b').text()).toBe('Copy images back out')
    // icons stay in the board-3 glyph style (C-55 set)
    const icons = wrapper.findAll('.news-icon').map((i) => i.text())
    expect(icons).toEqual(['⧉', '◐', '⎙', '▣'])
    // the C-55 «Also» line under the items
    expect(wrapper.find('.also').text()).toBe(
      'Also: footnote settings apply instantly, and the site now has a gallery of every diagram type'
    )
    const footLinks = wrapper.findAll('.foot-links .guide-link')
    expect(footLinks[0].text()).toBe('See everything new ↗')
    expect(footLinks[1].text()).toBe('See the guide')
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
    bus.emit('whatsNewDialog', { version: '2.5.0' })
    await nextTick()
    await wrapper.find('.continue-button').trigger('click')
    await nextTick()
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Esc on the sheet closes it', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.5.0' })
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
    bus.emit('whatsNewDialog', { version: '2.5.0' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('.continue-button').element)

    await wrapper.find('.continue-button').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(before)
    wrapper.unmount()
    before.remove()
  })

  it('traps Tab inside the three footer controls', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.5.0' })
    await nextTick()
    await nextTick()

    const sheet = wrapper.find('.ag-whats-new-sheet')
    const footLinks = wrapper.findAll('.foot-links .guide-link')
    const release = footLinks[0]
    const guide = footLinks[1]
    const cont = wrapper.find('.continue-button')

    // Continue → wraps forward to the release link
    await cont.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(release.element)
    // Release → guide → Continue (native order)
    await release.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(guide.element)
    await guide.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(cont.element)
    // Continue → Shift+Tab wraps back to the guide link
    await cont.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(guide.element)

    wrapper.unmount()
  })

  it('See everything new opens the release page externally and keeps the sheet open', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.5.0' })
    await nextTick()

    const openExternal = window.electron.shell.openExternal
    await wrapper.findAll('.foot-links .guide-link')[0].trigger('click')
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith(WHATS_NEW_RELEASE_URLS['2.5.0'])
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(true)

    wrapper.unmount()
  })

  it('See the guide opens the guide at the top (no unknown section) and keeps the sheet open', async () => {
    const wrapper = mountSheet()
    bus.emit('whatsNewDialog', { version: '2.5.0' })
    await nextTick()

    await wrapper.findAll('.foot-links .guide-link')[1].trigger('click')
    expect(bus.emit).toHaveBeenCalledWith('mt::open-guide', {})
    expect(wrapper.find('.ag-whats-new-sheet').exists()).toBe(true)

    wrapper.unmount()
  })

  it('the dialog aria-label is the localized whatsNew.title (not hard-coded English)', async () => {
    i18n.global.setLocaleMessage('ru', ruTranslations)
    i18n.global.locale.value = 'ru'
    try {
      const wrapper = mountSheet()
      bus.emit('whatsNewDialog', { version: '2.5.0' })
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
