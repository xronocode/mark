// FILE: tests/renderer/util/doc-stats.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the shared C-40 document-statistics helpers — line counting, reading minutes, selection counts, and the per-OS status-bar visibility default.
//   SCOPE: Pure-function tests over util/docStats.js plus the lazy window.electron platform resolution.
//   DEPENDS: Vitest, util/docStats.js (real muya/lib/utils wordCount), tests/renderer/setup.ts window shims.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-55; .grace/changes/archive/C-40 T-002/T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   setPlatform - override the window.electron.process.platform shim per case.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-004 initial pins: line
//   counting (popover-identical), reading minutes (words/230 ceil min 1),
//   selection word/character counts via the muya tokenizer, per-OS
//   status-bar default (darwin off, win32/linux/unreadable on).
// END_CHANGE_SUMMARY

import {
  countDocumentLines,
  countSelectionStats,
  readingMinutes,
  defaultStatusBarVisibility,
  READING_WORDS_PER_MINUTE
} from '@/util/docStats'

const setPlatform = (platform) => {
  window.electron.process.platform = platform
}

describe('util/docStats (C-40 T-004)', () => {
  describe('countDocumentLines', () => {
    it('splits on newlines like the T-002 popover did', () => {
      expect(countDocumentLines('a\nb\nc')).toBe(3)
      expect(countDocumentLines('# Title\n\nparagraph')).toBe(3)
      // A trailing newline is its own (empty) line — unchanged semantics.
      expect(countDocumentLines('a\n')).toBe(2)
    })

    it('returns 0 for empty or absent markdown', () => {
      expect(countDocumentLines('')).toBe(0)
      expect(countDocumentLines(undefined)).toBe(0)
      expect(countDocumentLines(null)).toBe(0)
    })
  })

  describe('readingMinutes', () => {
    it('is words/230 rounded up with a floor of one minute', () => {
      expect(READING_WORDS_PER_MINUTE).toBe(230)
      expect(readingMinutes(0)).toBe(1)
      expect(readingMinutes(1)).toBe(1)
      expect(readingMinutes(230)).toBe(1)
      expect(readingMinutes(231)).toBe(2)
      expect(readingMinutes(460)).toBe(2)
      expect(readingMinutes(461)).toBe(3)
    })

    it('treats non-numeric input as zero words', () => {
      expect(readingMinutes(NaN)).toBe(1)
      expect(readingMinutes(undefined)).toBe(1)
      expect(readingMinutes(-5)).toBe(1)
    })
  })

  describe('countSelectionStats', () => {
    it('counts words and characters through the muya tokenizer', () => {
      const stats = countSelectionStats('one two three words')
      expect(stats.word).toBe(4)
      // character = sum of token lengths (spaces excluded), muya semantics
      expect(stats.character).toBe(16)
    })

    it('returns zeros for empty or non-string selections', () => {
      expect(countSelectionStats('')).toEqual({ word: 0, character: 0 })
      expect(countSelectionStats(null)).toEqual({ word: 0, character: 0 })
      expect(countSelectionStats(undefined)).toEqual({ word: 0, character: 0 })
    })
  })

  describe('defaultStatusBarVisibility (per-OS default)', () => {
    it('is off on macOS', () => {
      setPlatform('darwin')
      expect(defaultStatusBarVisibility()).toBe(false)
    })

    it('is on on Windows and Linux', () => {
      setPlatform('win32')
      expect(defaultStatusBarVisibility()).toBe(true)
      setPlatform('linux')
      expect(defaultStatusBarVisibility()).toBe(true)
    })

    it('falls back to visible when the platform shim is absent', () => {
      const electron = window.electron
      delete window.electron
      expect(defaultStatusBarVisibility()).toBe(true)
      window.electron = electron

      window.electron.process.platform = ''
      expect(defaultStatusBarVisibility()).toBe(true)
      setPlatform('darwin') // restore for later tests
    })
  })
})
