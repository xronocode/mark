// FILE: tests/renderer/muya/image-drop.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin insertImageFromPath (C-24 R-4), the shared local-image insert used by Finder-path paste and the Tauri file drop.
//   SCOPE: ContentState.prototype.insertImageFromPath and its use by pasteImage, on a prototype-level stub.
//   DEPENDS: src/muya/lib/contentState (prototype methods), Vitest, jsdom.
//   LINKS: .grace/changes/archive/C-24; .grace/verification/runtime.xml V-M-012; START_BLOCK_INSERT_IMAGE_FROM_PATH in src/muya/lib/contentState/pasteCtrl.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createStub - ContentState-shaped stub recording insertImage/replaceImage and serving a fake image wrapper.
//   mounted - teardown registry of the real jsdom Muya instances (failure pins).
//   mountMuya - real jsdom Muya instance registered for afterEach teardown (failure pins).
//   settle - yields macrotask turns so the jsdom FileReader continuation has run.
//   treeHasText - walks the block tree matching a regex against every block text.
//   failureSignals - filters a dispatch spy for muya-image-action-failed events.
//   expectEngineCleanSignal - asserts one muya-image-action-failed dispatch with a parameters-only { id, error } payload.
// END_MODULE_MAP

import { afterEach, describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'
import ContentState from 'muya/lib/contentState'

// The DOM lookup of the placeholder is not under test; return a token-shaped info.
vi.mock('muya/lib/utils/getImageInfo', async (orig) => ({
  ...(await orig()),
  getImageInfo: (el) => ({ key: 'b1', token: { type: 'image' }, imageId: el.getAttribute('data-id') })
}))

void Muya // registers the ContentState prototype modifiers

function createStub ({ imageAction = vi.fn(async () => 'assets/shot.png'), clipboardFilePath = () => '' } = {}) {
  const calls = { insertImage: [], replaceImage: [] }
  const wrapper = document.createElement('span')
  return {
    calls,
    selectedImage: null,
    stateRender: { urlMap: new Map() },
    insertImage (info) {
      calls.insertImage.push(info)
      wrapper.setAttribute('data-id', info.alt)
    },
    replaceImage (info, attrs) { calls.replaceImage.push(attrs) },
    muya: {
      options: { imageAction, clipboardFilePath },
      // The muya-image-action-failed failure signal (C-MUYA-MODEL-SURGERY).
      eventCenter: { dispatch: vi.fn() },
      container: { querySelector: (sel) => (sel.includes(wrapper.getAttribute('data-id')) ? wrapper : null) }
    },
    cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 0 } },
    getBlock: () => ({ type: 'span', functionType: 'paragraphContent' }),
    insertImageFromPath: ContentState.prototype.insertImageFromPath
  }
}

describe('insertImageFromPath', () => {
  it('returns null and inserts nothing for a non-image or empty path', async () => {
    const stub = createStub()
    expect(await ContentState.prototype.insertImageFromPath.call(stub, '/a/notes.txt')).toBeNull()
    expect(await ContentState.prototype.insertImageFromPath.call(stub, '')).toBeNull()
    expect(stub.calls.insertImage).toHaveLength(0)
  })

  it('inserts a placeholder, runs imageAction and rewrites src (and alt when given)', async () => {
    const imageAction = vi.fn(async () => 'assets/shot.png')
    const stub = createStub({ imageAction })
    const out = await ContentState.prototype.insertImageFromPath.call(stub, '/Users/me/Desktop/shot.png', 'shot')
    expect(out).toBe('/Users/me/Desktop/shot.png')
    expect(stub.calls.insertImage[0].src).toBe('/Users/me/Desktop/shot.png')
    expect(imageAction).toHaveBeenCalledWith('/Users/me/Desktop/shot.png', stub.calls.insertImage[0].alt)
    expect(stub.calls.replaceImage.at(-1)).toEqual({ alt: 'shot', src: 'assets/shot.png' })
  })

  it("returns '' when imageAction fails, and pasteImage stops there", async () => {
    const imageAction = vi.fn(async () => { throw new Error('disk full') })
    const stub = createStub({ imageAction, clipboardFilePath: () => '/x/shot.png' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await ContentState.prototype.insertImageFromPath.call(stub, '/x/shot.png')).toBe('')
    const items = [{ type: 'image/png', getAsFile: vi.fn() }]
    const res = await ContentState.prototype.pasteImage.call(stub, { clipboardData: { items } })
    expect(res).toBeNull()
    expect(items[0].getAsFile).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it("returns '' without copying anything when the cursor is in a code block (review-2)", async () => {
    const imageAction = vi.fn(async () => 'assets/shot.png')
    const stub = createStub({ imageAction })
    stub.getBlock = () => ({ type: 'span', functionType: 'codeContent' })
    expect(await ContentState.prototype.insertImageFromPath.call(stub, '/x/shot.png')).toBe('')
    expect(imageAction).not.toHaveBeenCalled()
    expect(stub.calls.insertImage).toHaveLength(0)
  })
})

// C-MUYA-MODEL-SURGERY failing-first pins: after a rejected imageAction the
// document must be byte-identical on all three insertion branches (path,
// bitmap, drop) and exactly one muya-image-action-failed signal must fire.
const mounted = []
function mountMuya (markdown, options = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const muya = new Muya(container, { markdown, ...options })
  mounted.push(muya)
  return muya
}

async function settle () {
  // Yield macrotask turns so the jsdom FileReader continuation has had its
  // turn before the residue assertions (deterministic on both fix sides).
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function treeHasText (blocks, reg) {
  return blocks.some((b) => reg.test(b.text || '') || treeHasText(b.children, reg))
}

function failureSignals (dispatchSpy) {
  return dispatchSpy.mock.calls.filter(([type]) => type === 'muya-image-action-failed')
}

function expectEngineCleanSignal (signals) {
  expect(signals).toHaveLength(1)
  expect(Object.keys(signals[0][1]).sort()).toEqual(['error', 'id'])
  expect(signals[0][1].id).toMatch(/^loading-/)
  expect(signals[0][1].error).toBeInstanceOf(Error)
}

afterEach(() => {
  for (const muya of mounted.splice(0)) {
    clearTimeout(muya.contentState.historyTimer)
    muya.contentState.clear()
    muya.eventCenter.detachAllDomEvents()
    muya.container.remove()
  }
  vi.restoreAllMocks()
})

describe('confirmed-or-rolled-back image insertion (C-MUYA-MODEL-SURGERY)', () => {
  it('rolls the document back to a byte-identical state when imageAction fails', async () => {
    const muya = mountMuya('hello world')
    const state = muya.contentState
    const span = state.blocks[0].children[0]
    state.cursor = { start: { key: span.key, offset: 5 }, end: { key: span.key, offset: 5 }, isEdit: true }
    const before = muya.getMarkdown()
    expect(before).toBe('hello world\n')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatch = vi.spyOn(muya.eventCenter, 'dispatch')
    muya.options.imageAction = async () => { throw new Error('disk full') }

    const out = await state.insertImageFromPath('/tmp/shot.png')

    err.mockRestore()
    expect(out).toBe('')
    expect(muya.getMarkdown()).toBe(before)
    expect(treeHasText(state.blocks, /loading-/)).toBe(false)
    expectEngineCleanSignal(failureSignals(dispatch))
  })

  it('leaves no empty-src token or preview residue when imageAction fails', async () => {
    const muya = mountMuya('hello world', { clipboardFilePath: () => '' })
    const state = muya.contentState
    const before = muya.getMarkdown()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatch = vi.spyOn(muya.eventCenter, 'dispatch')
    muya.options.imageAction = async () => { throw new Error('disk full') }
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', { type: 'image/png' })

    const out = await state.pasteImage({ clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] } })
    await settle()
    err.mockRestore()

    expect(out).toBeNull()
    expect(muya.getMarkdown()).toBe(before)
    expect(treeHasText(state.blocks, /loading-/)).toBe(false)
    expect(treeHasText(state.blocks, /!\[[^\]]*\]\(\s*\)/)).toBe(false)
    expect(state.stateRender.urlMap.size).toBe(0)
    expect(muya.container.querySelector('.ag-empty-image, .ag-image-success')).toBeNull()
    expectEngineCleanSignal(failureSignals(dispatch))
  })

  it('removes the dropped block and restores the anchor when imageAction fails', async () => {
    const muya = mountMuya('hello world')
    const state = muya.contentState
    const before = muya.getMarkdown()
    const cursorBefore = { start: { ...state.cursor.start }, end: { ...state.cursor.end } }
    const capturedAnchor = { position: 'up', anchor: state.blocks[0] }
    state.dropAnchor = capturedAnchor
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatch = vi.spyOn(muya.eventCenter, 'dispatch')
    muya.options.imageAction = async () => { throw new Error('disk full') }
    const webUtils = window.electron.webUtils
    window.electron.webUtils = { getPathForFile: () => '/tmp/drop.png' }
    const file = new File([new Uint8Array([0x89])], 'drop.png', { type: 'image/png' })

    await state.dropHandler({ preventDefault: () => {}, dataTransfer: { items: [], files: [file] } })

    err.mockRestore()
    window.electron.webUtils = webUtils
    expect(muya.getMarkdown()).toBe(before)
    expect(treeHasText(state.blocks, /loading-/)).toBe(false)
    expect(state.dropAnchor).toBe(capturedAnchor)
    expect(state.cursor.start).toEqual(cursorBefore.start)
    expect(state.cursor.end).toEqual(cursorBefore.end)
    expectEngineCleanSignal(failureSignals(dispatch))
  })
})
