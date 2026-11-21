// FILE: tests/renderer/pages/common/sheet.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-COMPACT-WINDOWS-FIT T-004 (M-011) — pin the shared Advanced-sheet keyboard modality: the ElFocusTrap wiring (element-plus deep per-component import, trapped bound to the open prop, loop enabled) moves initial focus inside the panel, wraps Tab/Shift+Tab at both edges in both directions, restores the invoking control's focus when the sheet closes via either path, and the capture-phase Escape closer survives byte-identical.
//   SCOPE: Vue/jsdom component tests over the real sheet component with the real en locale; the geometric/wrap proof is behavioral here (jsdom supports focus and keyboard dispatch) and the source-level anchors pin the unchanged Esc handler, the 560px metrics and the close-button focus rule.
//   DEPENDS: Vitest, Vue Test Utils, static/locales/en.json, prefComponents/common/sheet, element-plus/es/components/focus-trap (through the component).
//   LINKS: C-COMPACT-WINDOWS-FIT; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011; tests/e2e/compact-windows-fit.spec.ts (the e2e trap tier).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   enMessages - the shipped static/locales/en.json instance the sheet renders its Close label from.
//   settle - flushPromises + nextTick drains so the trap's start/stop cycles complete.
//   pressTab - a real cancelable keydown dispatched at the active element (bubbles to the trap container).
//   i18n - the test i18n instance the sheet renders its Close label through.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-21 C-COMPACT-WINDOWS-FIT T-004: new suite — initial focus, both-direction wrap, restore on Escape and Close-button paths, the unchanged capture-phase Escape anchor and the 560px/close-focus source pins.
// END_CHANGE_SUMMARY

import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createI18n } from 'vue-i18n'

import Sheet from '@/prefComponents/common/sheet/index.vue'

const enMessages = JSON.parse(readFileSync(resolve('static/locales/en.json'), 'utf8'))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: enMessages }
})

const settle = async () => {
  await flushPromises()
  await nextTick()
  await nextTick()
  await nextTick()
}

// The trap container is the .pref-sheet element; its native keydown
// listener receives bubbling Tab keystrokes from the focused descendant.
const pressTab = (shift = false) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab', code: 'Tab', shiftKey: shift, bubbles: true, cancelable: true
  })
  document.activeElement.dispatchEvent(event)
  return event
}

describe('prefComponents/common/sheet/index.vue — ElFocusTrap keyboard modality (C-COMPACT-WINDOWS-FIT)', () => {
  let invoke

  beforeEach(() => {
    // The "invoking control" behind the sheet: the trap must restore it.
    invoke = document.createElement('button')
    invoke.className = 'invoker'
    invoke.textContent = 'Invoke'
    document.body.appendChild(invoke)
  })

  afterEach(() => {
    document.activeElement instanceof HTMLElement && document.activeElement.blur()
    invoke?.remove()
    invoke = null
  })

  const mountSheet = async () => {
    let setOpen
    // Attach to the document: ElFocusTrap drives document.activeElement, and
    // jsdom focus() on detached nodes is a no-op — the trap must run in the
    // real document tree.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mount(Sheet, {
      attachTo: host,
      props: {
        open: true,
        title: enMessages.preferences.advanced.sheets.shortcutsTitle,
        onClose: () => setOpen(false)
      },
      slots: {
        default:
          '<div class="sheet-content">' +
          '<button type="button" class="sheet-first">First</button>' +
          '<input class="sheet-input" />' +
          '<button type="button" class="sheet-last">Last</button>' +
          '</div>'
      },
      global: { plugins: [i18n] }
    })
    setOpen = (v) => wrapper.setProps({ open: v })
    await settle()
    const origUnmount = wrapper.unmount.bind(wrapper)
    wrapper.unmount = () => { origUnmount(); host.remove() }
    return wrapper
  }

  const sheetFocusables = (wrapper) =>
    wrapper.findAll('.pref-sheet button, .pref-sheet input').map((c) => c.element)

  it('moves initial focus inside the sheet panel', async () => {
    invoke.focus()
    expect(document.activeElement).toBe(invoke)
    const wrapper = await mountSheet()
    const panel = wrapper.find('.pref-sheet').element
    expect(document.activeElement).not.toBe(invoke)
    expect(panel.contains(document.activeElement), 'the trap claims focus inside the panel').toBe(true)
    await wrapper.unmount()
  })

  it('wraps Tab at the last focusable back to the first', async () => {
    const wrapper = await mountSheet()
    const focusables = sheetFocusables(wrapper)
    const first = wrapper.find('.pref-sheet-close').element
    const last = focusables[focusables.length - 1]
    expect(first).not.toBe(last)
    last.focus()
    expect(document.activeElement).toBe(last)
    const event = pressTab()
    expect(document.activeElement, 'Tab at the last focusable wraps to the first').toBe(first)
    expect(event.defaultPrevented, 'the wrapping Tab never reaches the browser default').toBe(true)
    await wrapper.unmount()
  })

  it('wraps Shift+Tab at the first focusable back to the last', async () => {
    const wrapper = await mountSheet()
    const focusables = sheetFocusables(wrapper)
    const first = wrapper.find('.pref-sheet-close').element
    const last = focusables[focusables.length - 1]
    first.focus()
    expect(document.activeElement).toBe(first)
    const event = pressTab(true)
    expect(document.activeElement, 'Shift+Tab at the first focusable wraps to the last').toBe(last)
    expect(event.defaultPrevented, 'the wrapping Shift+Tab never reaches the browser default').toBe(true)
    await wrapper.unmount()
  })

  it('restores focus to the invoking control when the sheet closes', async () => {
    // Escape path: the capture handler closes, the trap releases and
    // focus returns to the invoking control.
    invoke.focus()
    const escapeWrapper = await mountSheet()
    expect(document.activeElement).not.toBe(invoke)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await settle()
    expect(escapeWrapper.emitted('close')).toBeTruthy()
    expect(document.activeElement, 'Escape restores the invoking control').toBe(invoke)
    await escapeWrapper.unmount()

    // Close-button path: reopen, close through the header button.
    invoke.focus()
    const buttonWrapper = await mountSheet()
    expect(document.activeElement).not.toBe(invoke)
    await buttonWrapper.find('.pref-sheet-close').trigger('click')
    await settle()
    expect(buttonWrapper.emitted('close')).toBeTruthy()
    expect(document.activeElement, 'the Close button restores the invoking control').toBe(invoke)
    await buttonWrapper.unmount()
  })

  it('closes on Escape with the capture handler unchanged', async () => {
    const wrapper = await mountSheet()
    let documentSawEscape = false
    const spy = () => { documentSawEscape = true }
    document.addEventListener('keydown', spy)
    // Dispatch at the page beneath: the window capture handler must
    // close the sheet AND stop the Escape from reaching document
    // listeners (the dimmed page behind never sees it).
    invoke.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.removeEventListener('keydown', spy)
    await settle()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(documentSawEscape, 'the capture-phase handler stops the Escape from reaching the page').toBe(false)

    // Source-level anchors (jsdom mounts no SFC stylesheets): the Esc
    // handler byte-anchors, the trap wiring, the 560px metrics and the
    // close-button focus rule.
    const sfc = readFileSync(
      resolve('src/renderer/src/prefComponents/common/sheet/index.vue'),
      'utf8'
    )
    expect(sfc).toContain("if (event.key === 'Escape')")
    expect(sfc).toContain('event.stopPropagation()')
    expect(sfc).toContain("window.addEventListener('keydown', onKeydown, true)")
    expect(sfc).toContain('ElFocusTrap')
    expect(sfc).toContain('element-plus/es/components/focus-trap/index.mjs')
    expect(sfc).toContain(':trapped="open"')
    expect(sfc).toContain('width: 560px;')
    expect(sfc).toContain('pref-sheet-close:focus-visible')
    expect(sfc).toContain('outline: 2px solid var(--prefAccent);')
    await wrapper.unmount()
  })
})
