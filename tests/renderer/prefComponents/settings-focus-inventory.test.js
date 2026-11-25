// FILE: tests/renderer/prefComponents/settings-focus-inventory.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The Settings-window focus-canon inventory guard (C-EDITOR-A11Y-CSS R-1) — a source-walk over every prefComponents component source that pairs every `all: unset` interactive control with a `:focus-visible` rule in its own file (the global index.css `:focus { outline: none; }` kill leaves keyboard focus invisible otherwise).
//   SCOPE: Static source walk only — style-block rule extraction, the closed field-canon allowlist (text fields show focus through the :focus border-color canon, not an outline) and the offender equality; no DOM mount, no snapshot.
//   DEPENDS: node:fs / node:url over src/renderer/src/prefComponents sources.
//   LINKS: M-011; V-M-011; C-EDITOR-A11Y-CSS; index.css :focus kill (:230-232); C-SETTINGS-KEYBOARD-FOCUS canon outline.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   componentSources - every .vue file under prefComponents, recursively.
//   styleBlocks - the <style> block bodies of a source.
//   allUnsetRules - { file, selector } of every rule carrying all: unset.
//   FIELD_CANON_ALLOWLIST - the closed text-field exemption, each entry justified by the :focus rule its file really carries.
//   prefComponentsRoot - absolute root of the prefComponents source tree.
//   collapse - whitespace collapse for selector/body normalization.
//   sourceOf - file-to-source lookup backing the per-file rule pairing.
//   relative - prefComponents-root-relative display path of a source file.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-25 C-EDITOR-A11Y-CSS: new guard — red on the pre-change eight (all:unset without a same-file :focus-visible rule), green after the per-control canon outline lands beside each control's own chrome.
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const prefComponentsRoot = resolve(
  import.meta.dirname,
  '../../../src/renderer/src/prefComponents'
)

const componentSources = () => {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.vue')) found.push(path)
    }
  }
  walk(prefComponentsRoot)
  return found.sort()
}

const styleBlocks = (source) =>
  [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1])

const collapse = (text) => text.replace(/\s+/g, ' ').trim()

// One entry per rule whose declaration block carries `all: unset`;
// the selector keeps the owning class so the offender list names the
// control, not a line number.
const allUnsetRules = (file, source) => {
  const rules = []
  for (const block of styleBlocks(source)) {
    for (const rawRule of block.replace(/\/\*[\s\S]*?\*\//g, '').split('}')) {
      if (!rawRule.includes('{')) continue
      const [selector, declarations] = rawRule.split('{')
      if (!collapse(declarations).includes('all: unset')) continue
      rules.push({ file, selector: collapse(selector) })
    }
  }
  return rules
}

// START_BLOCK_FIELD_CANON_ALLOWLIST
// The text-field controls keep the field canon — a visible `:focus`
// border-color (or Element Plus is-focus shadow) change instead of a
// `:focus-visible` outline. The list is closed: a control fitting
// neither bucket (button-class without all:unset, field-class without
// its :focus rule) grows the pin by name, never a blanket exemption.
// Each anchor is asserted against the live source so the justification
// cannot rot silently.
const FIELD_CANON_ALLOWLIST = [
  {
    file: 'common/textBox/index.vue',
    anchor: '.pref-field:focus',
    justification: 'text fields keep the :focus border-color field canon'
  },
  {
    file: 'common/fontTextBox/index.vue',
    anchor: '.el-input__wrapper.is-focus',
    justification: 'the font autocomplete field shows focus through the Element Plus is-focus shadow'
  },
  {
    file: 'common/compound/index.vue',
    anchor: '<compound>',
    justification: 'group-card wrapper hosting the field inputs — no raw interactive element of its own'
  },
  {
    file: 'keybindings/index.vue',
    anchor: '.pref-keybindings-search:focus',
    justification: 'the sheet search field keeps the :focus border-color field canon'
  },
  {
    file: 'tabs/advanced/index.vue',
    anchor: '.pref-image-folder-field:focus',
    justification: 'the image-folder path field keeps the :focus border-color field canon'
  },
  {
    file: 'tabs/advanced/sheets/customCssSheet.vue',
    anchor: '.pref-custom-css:focus',
    justification: 'the CSS textarea keeps the :focus border-color field canon'
  },
  {
    file: 'tabsBar/searchPanel.vue',
    anchor: '.pref-search-input:focus',
    justification: 'the search-panel field keeps the :focus border-color field canon'
  }
]
// END_BLOCK_FIELD_CANON_ALLOWLIST

const sourceOf = new Map(
  componentSources().map((path) => [path, readFileSync(path, 'utf8')])
)

// Windows walks produce backslash separators while every allowlist
// entry and pin title is written posix-style — normalize at the seam.
const relative = (path) => path.slice(prefComponentsRoot.length + 1).split(sep).join('/')

describe('settings-focus-inventory (C-EDITOR-A11Y-CSS)', () => {
  test('flags every all:unset interactive control whose file has no :focus-visible rule', () => {
    const offenders = []
    for (const [path, source] of sourceOf) {
      const file = relative(path)
      const exemptSelectors = FIELD_CANON_ALLOWLIST
        .filter((entry) => entry.file === file)
        .map((entry) => entry.anchor)
      for (const rule of allUnsetRules(file, source)) {
        const allowlisted = exemptSelectors.some((anchor) => rule.selector.includes(anchor))
        if (!allowlisted && !source.includes(':focus-visible')) offenders.push(rule)
      }
    }
    // The canon (C-SETTINGS-KEYBOARD-FOCUS): outline 2px var(--prefAccent)
    // at 1px offset under :focus-visible, beside the control's own chrome.
    expect(offenders).toEqual([])
  })

  test('keeps the field-canon allowlist non-empty with its justification', () => {
    expect(FIELD_CANON_ALLOWLIST.length).toBeGreaterThan(0)
    for (const entry of FIELD_CANON_ALLOWLIST) {
      const source = [...sourceOf.entries()].find(([path]) => relative(path) === entry.file)?.[1]
      expect(source, `${entry.file} must exist`).toBeTruthy()
      expect(
        entry.justification,
        `${entry.file}: the exemption must name its field-canon justification`
      ).toMatch(/field canon|is-focus shadow|no raw interactive element/)
      if (entry.anchor.startsWith('<')) continue
      expect(
        collapse(source).includes(entry.anchor),
        `${entry.file}: the justified ${entry.anchor} rule must really be in the source`
      ).toBe(true)
    }
  })
})
