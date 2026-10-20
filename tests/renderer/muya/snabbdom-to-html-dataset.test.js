// FILE: tests/renderer/muya/snabbdom-to-html-dataset.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that muya's toHTML (the partialRender serializer) writes camelCase dataset keys as hyphenated data-* attributes, so a block re-rendered through partialRender keeps dataset.tableToolbarAction / blockToolbarAction / calloutKey etc.
//   SCOPE: src/muya/lib/parser/render/snabbdom.js toHTML + datasetAttributeName.
//   DEPENDS: Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-65 (table toolbar toggle after a partial render, 2026-10-19).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   roundTrip - serializes a vnode with toHTML and parses it back into a DOM element.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 new — fails with the stock snabbdom-to-html dataset module (data-tableToolbarAction reads back as dataset.tabletoolbaraction).
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { h, toHTML, datasetAttributeName } from 'muya/lib/parser/render/snabbdom'

const roundTrip = (vnode) => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = toHTML(vnode)
  return wrapper.firstElementChild
}

describe('toHTML dataset serialization', () => {
  it('hyphenates camelCase keys so the DOM dataset reads them back', () => {
    const el = roundTrip(h('button.x', { dataset: { tableToolbarAction: 'toggleFullWidth', calloutKey: 'k1' } }, 'go'))
    expect(el.getAttribute('data-table-toolbar-action')).toBe('toggleFullWidth')
    expect(el.dataset.tableToolbarAction).toBe('toggleFullWidth')
    expect(el.dataset.calloutKey).toBe('k1')
  })

  it('escapes values and keeps lowercase keys and other attributes', () => {
    const el = roundTrip(h('span', { attrs: { title: 't' }, dataset: { role: 'a"b<c' } }))
    expect(el.dataset.role).toBe('a"b<c')
    expect(el.getAttribute('title')).toBe('t')
  })

  it('datasetAttributeName mirrors the DOM name conversion', () => {
    expect(datasetAttributeName('blockToolbarAction')).toBe('data-block-toolbar-action')
    expect(datasetAttributeName('role')).toBe('data-role')
  })
})
