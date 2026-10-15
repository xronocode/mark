/**
 * symbolIcon sprite — retirement guard (C-38 T-006 N4 d).
 *
 * The iconfont sprite used to be imported by main.js and injected a
 * hidden <svg><symbol> sheet into the document. Since C-38 T-006 every
 * chrome icon renders from the drawn chromeIcons set, so the sprite
 * import is gone and the sprite file itself is listed for deletion.
 * These tests pin that the renderer entry never re-imports it (the
 * broader no-old-icons scan lives in tests/renderer/chrome/
 * chrome-icons-static.test.js).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readMainJs = () =>
  readFileSync(resolve(__dirname, '../../../src/renderer/src/main.js'), 'utf8')

describe('symbolIcon sprite retirement (C-38 T-006)', () => {
  it('main.js does not import the iconfont sprite', () => {
    expect(readMainJs()).not.toMatch(/symbolIcon/)
  })

  it('main.js installs the chrome platform class for the accent fallbacks', () => {
    const source = readMainJs()
    expect(source).toMatch(/installChromePlatformClass/)
  })
})
