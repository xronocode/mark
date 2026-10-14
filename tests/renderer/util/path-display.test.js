// FILE: tests/renderer/util/path-display.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the middle-ellipsis shortening of long folder paths used by the sidebar recent-folders list.
//   SCOPE: shortenMiddle in src/renderer/src/util/pathDisplay.js.
//   DEPENDS: Vitest.
//   LINKS: src/renderer/src/components/sideBar/tree.vue.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15: recent folders ran past the sidebar edge; short paths stay as-is, long ones keep the start and the last segments.
// END_CHANGE_SUMMARY

import { shortenMiddle } from '@/util/pathDisplay'

describe('shortenMiddle', () => {
  it('keeps short paths unchanged', () => {
    expect(shortenMiddle('~/prj/mark')).toBe('~/prj/mark')
    expect(shortenMiddle('')).toBe('')
  })

  it('keeps the first and the last two segments of a long home path', () => {
    expect(shortenMiddle('~/prj/clients/acme/very-long-project-name/docs/specs')).toBe('~/…/docs/specs')
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
