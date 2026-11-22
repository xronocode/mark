// FILE: tests/renderer/muya/image-selector-path-hints.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the image path-hint race guard — handleKeyUp captures a
//            sequence number around the imagePathAutoComplete await and a
//            late answer to older input dispatches nothing on
//            muya-image-picker, mirroring the linkPathPicker precedent.
//   SCOPE: muya/ui/imageSelector handleKeyUp identity only; BaseFloat
//            positioning is a test double (the link-hover suite pattern).
//   DEPENDS: Vitest, jsdom, muya/ui/imageSelector, muya EventCenter.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml
//          V-M-012; C-SEARCH-LIFECYCLE-DISCARD T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   fixture - fake muya with a real EventCenter, controlled
//             (imagePathAutoComplete) promises and a dispatch spy.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-23 C-SEARCH-LIFECYCLE-DISCARD T-004:
//     first version — stale hint list dropped, payload and cb wiring
//     unchanged.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventCenter from 'muya/lib/eventHandler/event'
import ImageSelector from 'muya/lib/ui/imageSelector'

vi.mock('muya/lib/ui/baseFloat', () => ({
  default: class {
    constructor(muya) {
      this.muya = muya
      this.container = document.createElement('div')
      this.floatBox = this.container
      document.body.appendChild(this.container)
      this.status = false
    }
    listen() {}
    show() { this.status = true }
    hide() { this.status = false }
    destroy() { this.container.remove(); this.status = false }
  }
}))

const fixture = () => {
  const autoComplete = vi.fn()
  const eventCenter = new EventCenter()
  const muya = {
    eventCenter,
    contentState: {},
    options: { imagePathAutoComplete: autoComplete }
  }
  const selector = new ImageSelector(muya, {})
  const input = document.createElement('input')
  input.className = 'src'
  selector.imageSelectorContainer.appendChild(input)
  selector.state.src = '/docs/'
  const dispatchSpy = vi.spyOn(eventCenter, 'dispatch')
  return { selector, autoComplete, dispatchSpy, input }
}

beforeEach(() => {})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('imageSelector path hint race (C-SEARCH-LIFECYCLE-DISCARD)', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('a late answer to older input dispatches nothing; only the newest answer dispatches', async () => {
    const { selector, autoComplete, dispatchSpy, input } = fixture()
    let resolveStale
    let resolveNewest
    autoComplete
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNewest = resolve }))

    // Two keystrokes race: the first (stale) answer is still pending
    // when the second goes out.
    selector.handleKeyUp({ key: 'n' })
    selector.handleKeyUp({ key: 'e' })
    expect(autoComplete).toHaveBeenCalledTimes(2)

    const staleList = [{ text: 'old.md' }]
    const newestList = [{ text: 'new.md' }]

    // The STALE resolution lands first — it must dispatch nothing.
    resolveStale(staleList)
    await settle()
    expect(dispatchSpy).not.toHaveBeenCalled()

    // Only the newest answer owns the hint list.
    resolveNewest(newestList)
    await settle()
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const [channel, payload] = dispatchSpy.mock.calls[0]
    expect(channel).toBe('muya-image-picker')
    expect(payload.list).toEqual(newestList)
    expect(payload.reference).toBe(input)
    expect(typeof payload.cb).toBe('function')

    // The cb wiring is unchanged (the chosen entry splices into the input).
    payload.cb({ text: 'new.md' })
    expect(input.value).toBe('/docs/new.md')
  })

  it('an empty value still dispatches the empty list synchronously', async () => {
    const { selector, autoComplete, dispatchSpy } = fixture()
    selector.state.src = ''
    await selector.handleKeyUp({ key: 'Backspace' })
    expect(autoComplete).not.toHaveBeenCalled()
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const [channel, payload] = dispatchSpy.mock.calls[0]
    expect(channel).toBe('muya-image-picker')
    expect(payload.list).toEqual([])
  })
})
