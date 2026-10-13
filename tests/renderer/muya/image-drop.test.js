// FILE: tests/renderer/muya/image-drop.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin insertImageFromPath (C-24 R-4), the shared local-image insert used by Finder-path paste and the Tauri file drop.
//   SCOPE: ContentState.prototype.insertImageFromPath and its use by pasteImage, on a prototype-level stub.
//   DEPENDS: src/muya/lib/contentState (prototype methods), Vitest, jsdom.
//   LINKS: .grace/changes/active/C-24; .grace/verification/runtime.xml V-M-012; START_BLOCK_INSERT_IMAGE_FROM_PATH in src/muya/lib/contentState/pasteCtrl.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createStub - ContentState-shaped stub recording insertImage/replaceImage and serving a fake image wrapper.
// END_MODULE_MAP

import { describe, expect, it, vi } from 'vitest'
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
