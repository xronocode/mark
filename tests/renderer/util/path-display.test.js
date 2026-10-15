// FILE: tests/renderer/util/path-display.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the middle-ellipsis shortening of long folder paths used by the sidebar recent-folders list.
//   SCOPE: shortenMiddle, pathBasename, pathDirname in src/renderer/src/util/pathDisplay.js (POSIX and Windows separators).
//   DEPENDS: Vitest.
//   LINKS: src/renderer/src/components/sideBar/tree.vue; src/renderer/src/components/recent/index.vue (C-46).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LONG_HOME_PATH - a home-relative project path longer than the sidebar can show.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-46 review: Windows paths (C:\Users\x\doc.md) — basename/dirname on both separators; shortenMiddle keeps the backslash separator.
//   v1.0.0 - 2026-10-15: recent folders ran past the sidebar edge; short paths stay as-is, long ones keep the start and the last segments.
// END_CHANGE_SUMMARY

import { shortenMiddle, pathBasename, pathDirname } from '@/util/pathDisplay'

const LONG_HOME_PATH = '~/prj/clients/acme/very-long-project-name/docs/specs'

describe('shortenMiddle', () => {
  it('keeps short paths unchanged', () => {
    expect(shortenMiddle('~/prj/mark')).toBe('~/prj/mark')
    expect(shortenMiddle('')).toBe('')
  })

  it('keeps the first and the last two segments of a long home path', () => {
    expect(shortenMiddle(LONG_HOME_PATH)).toBe('~/…/docs/specs')
  })

  it('keeps the root segment of an absolute path', () => {
    expect(shortenMiddle('/Volumes/External/Archive/2026/October/notes/drafts', 30)).toBe('/Volumes/…/notes/drafts')
  })

  it('falls back to the last segment alone when two do not fit', () => {
    const out = shortenMiddle('~/a/b/c/an-extremely-long-folder-name-that-will-not-fit/another-long-one', 36)
    expect(out).toBe('~/…/another-long-one')
    expect(out.length).toBeLessThanOrEqual(36)
  })
})

describe('pathBasename / pathDirname', () => {
  it('split POSIX paths', () => {
    expect(pathBasename('/Users/x/doc.md')).toBe('doc.md')
    expect(pathDirname('/Users/x/doc.md')).toBe('/Users/x')
    expect(pathDirname('/doc.md')).toBe('/')
    expect(pathBasename('')).toBe('')
    expect(pathDirname('')).toBe('')
  })

  it('split Windows paths on backslashes and keep the drive root', () => {
    expect(pathBasename('C:\\Users\\x\\doc.md')).toBe('doc.md')
    expect(pathDirname('C:\\Users\\x\\doc.md')).toBe('C:\\Users\\x')
    expect(pathDirname('C:\\doc.md')).toBe('C:\\')
    expect(pathBasename('C:/Users/x/doc.md')).toBe('doc.md')
  })

  it('shortens a long Windows path with its own separator', () => {
    expect(shortenMiddle('C:\\Users\\x\\clients\\acme\\very-long-project-name\\docs', 36))
      .toBe('C:\\…\\very-long-project-name\\docs')
  })
})
