// FILE: tests/renderer/muya/resize-surfaces.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify table layout follows window/container/font changes independently of line numbers and stops after editor destruction.
//   SCOPE: Owning column/scroller/outline observation, foreign-editor isolation, font events and destruction with optional APIs.
//   DEPENDS: Vitest, jsdom, muya/eventHandler/resize.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; C-71.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   active - handlers destroyed after each test.
//   fontsDescriptor - original document.fonts restored after each test.
//   harness - construct a Resize listener, optionally inside an owning host, with table/gutter spies.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Reproduce late owned-outline visibility and preserve viewport-centered geometry without a window resize.
//   PREV: v1.0.0 - 2026-10-19 C-71: regression pins for missing table geometry refresh and teardown.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import Resize from 'muya/lib/eventHandler/resize'

vi.mock('muya/lib/utils', () => ({ throttle: fn => fn }))
const active = []
const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts')
const harness = (lineNumbers = false, host = null) => {
  const muya = { container: document.createElement('div'), options: { codeBlockLineNumbers: lineNumbers },
    tableResize: { refreshTableSurfaces: vi.fn() }, contentState: { resizeLineNumber: vi.fn() } }
  host?.querySelector('.editor-component').appendChild(muya.container)
  const resize = new Resize(muya)
  active.push(resize)
  return { muya, resize }
}
afterEach(() => {
  active.splice(0).forEach(r => r.destroy())
  if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor)
  else delete document.fonts
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('resize surface lifecycle', () => {
  it('observes only its owning scroller and outline, including visibility changes, and detaches them', () => {
    const host = document.createElement('div')
    host.className = 'editor-with-tabs'
    host.innerHTML = '<div class="editor-component"></div><nav data-editor-overlay-right></nav>'
    const foreign = document.createElement('nav')
    foreign.setAttribute('data-editor-overlay-right', '')
    document.body.append(foreign, host)
    const observe = vi.fn()
    const disconnect = vi.fn()
    let notify
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { notify = callback }
      observe = observe
      disconnect = disconnect
    })
    const { muya, resize } = harness(false, host)
    const surfaces = observe.mock.calls.map(([element]) => element)
    expect(surfaces).toHaveLength(3)
    expect(surfaces[0]).toBe(muya.container)
    expect(surfaces[1]).toBe(host.querySelector('.editor-component'))
    expect(surfaces[2]).toBe(host.querySelector('[data-editor-overlay-right]'))
    expect(surfaces.some(surface => surface === foreign)).toBe(false)
    notify()
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledOnce()
    resize.destroy()
    notify()
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('refreshes tables on window resize with gutters disabled and observes live option changes', () => {
    const { muya } = harness()
    window.dispatchEvent(new Event('resize'))
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledOnce()
    expect(muya.contentState.resizeLineNumber).not.toHaveBeenCalled()
    muya.options.codeBlockLineNumbers = true
    window.dispatchEvent(new Event('resize'))
    expect(muya.contentState.resizeLineNumber).toHaveBeenCalledWith(true)
  })

  it('refreshes after container resizing and disconnects the observer', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    let notify
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { notify = callback }
      observe = observe
      disconnect = disconnect
    })
    const { muya, resize } = harness(true)
    expect(observe).toHaveBeenCalledWith(muya.container)
    notify()
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledOnce()
    resize.destroy()
    notify()
    window.dispatchEvent(new Event('resize'))
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    resize.destroy()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('refreshes on initial and subsequent font loads, removing the font listener on destroy', async () => {
    const fonts = new EventTarget()
    fonts.ready = Promise.resolve()
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
    const { muya, resize } = harness()
    await Promise.resolve()
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledOnce()
    fonts.dispatchEvent(new Event('loadingdone'))
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledTimes(2)
    resize.destroy()
    fonts.dispatchEvent(new Event('loadingdone'))
    expect(muya.tableResize.refreshTableSurfaces).toHaveBeenCalledTimes(2)
  })

  it('ignores late font completion after destroy and tolerates missing optional surfaces', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
    const { muya, resize } = harness()
    delete muya.tableResize
    window.dispatchEvent(new Event('resize'))
    resize.destroy()
    await Promise.resolve()
    expect(muya.contentState.resizeLineNumber).not.toHaveBeenCalled()
  })
})
