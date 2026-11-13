// FILE: tests/renderer/muya/mutation-empty-root.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Preserve Muya mutation crash detection without counting a large root's children for each insertion.
//   SCOPE: Actual observer callback, bulk insertion, empty/text-only roots, transient replacement, nested mutations, table removal and recovery during delivery.
//   DEPENDS: Muya entry class, DOM elements, Vitest and a controlled MutationObserver delivery boundary.
//   LINKS: M-012; V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   host - Owned observed container.
//   root - Owned editor root with the production identifier.
//   deliver - Actual callback captured at the observer delivery boundary.
//   observe - Observe registration spy.
//   dispatch - Existing crash-event sink.
//   warn - Existing warning sink.
//   childMutation - Build one child-list delivery record for a real DOM target.
// END_MODULE_MAP
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'

let host, root, deliver, observe, dispatch, warn
const childMutation = (target, removedNodes = []) => ({ type: 'childList', target, removedNodes })

beforeEach(() => {
  host = document.createElement('div')
  root = document.createElement('div')
  root.id = 'ag-editor-id'
  host.append(root)
  document.body.append(host)
  observe = vi.fn()
  dispatch = vi.fn()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('MutationObserver', class {
    constructor(callback) { deliver = callback }
    observe = observe
  })
  Muya.prototype.mutationObserver.call({ container: host, eventCenter: { dispatch } })
})

afterEach(() => {
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Muya mutation empty-root guard', () => {
  it('retains the observed container and subtree child-list boundary', () => {
    expect(observe).toHaveBeenCalledExactlyOnceWith(host, { childList: true, subtree: true })
  })

  it('handles a bulk insertion batch without requesting the total child count for every record', () => {
    root.append(...Array.from({ length: 256 }, () => document.createElement('p')))
    const nativeCount = Object.getOwnPropertyDescriptor(Element.prototype, 'childElementCount').get
    const countReads = vi.fn(function () { return nativeCount.call(this) })
    Object.defineProperty(root, 'childElementCount', { configurable: true, get: countReads })
    deliver(Array.from({ length: 256 }, () => childMutation(root)))
    expect(dispatch).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(countReads).not.toHaveBeenCalled()
  })

  it.each(['empty', 'text', 'comment'])('retains the crash event and warning for an element-empty %s root', kind => {
    if (kind === 'text') root.append(document.createTextNode('remaining text'))
    if (kind === 'comment') root.append(document.createComment('remaining comment'))
    deliver([childMutation(root)])
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('crashed')
    expect(warn).toHaveBeenCalledExactlyOnceWith('editor crashed, and can not be input any more.')
  })

  it('evaluates the final replacement DOM rather than treating a removal record as an empty root', () => {
    const previous = document.createElement('p')
    root.append(previous)
    previous.remove()
    root.append(document.createElement('p'))
    deliver([childMutation(root, [previous]), childMutation(root)])
    expect(dispatch).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('ignores empty nested nodes and non-child-list mutations', () => {
    const nested = document.createElement('div')
    root.append(nested)
    deliver([childMutation(nested), { type: 'characterData', target: document.createTextNode('text') }])
    expect(dispatch).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('preserves table-removal detection with unrelated removed text present', () => {
    root.append(document.createElement('p'))
    const table = document.createElement('table')
    table.className = 'ag-paragraph'
    deliver([childMutation(root, [document.createTextNode('removed text'), table])])
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('crashed')
    expect(warn).toHaveBeenCalledExactlyOnceWith('There was a problem with the table deletion.')
  })

  it('rechecks the live root after a crash handler restores an element during the same batch', () => {
    dispatch.mockImplementationOnce(() => root.append(document.createElement('p')))
    deliver([childMutation(root), childMutation(root)])
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('crashed')
    expect(warn).toHaveBeenCalledExactlyOnceWith('editor crashed, and can not be input any more.')
  })
})
