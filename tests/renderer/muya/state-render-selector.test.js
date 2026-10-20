// FILE: tests/renderer/muya/state-render-selector.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin StateRender selector activity when transient editor state has no cursor start (FIX-012).
//   SCOPE: Null/missing cursor endpoints, valid cursor activity, active-block activity, and token-conflict fallback.
//   DEPENDS: src/muya/lib/parser/render/index.js, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; .grace/changes/archive/C-FIX-012-RENDER-CURSOR-GUARD; .grace/changes/archive/C-FIX-012-RENDER-CONFLICT-GUARD.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   selectorFor - Calls the real StateRender#getSelector method with a minimal content-state fixture.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-20 FIX-012 review: pin the token-conflict guard and preserve complete-cursor overlap behavior.
//   PREV: v1.0.0 - 2026-10-20 FIX-012: selector activity tolerates a null or start-less cursor while preserving valid active classes.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import StateRender from 'muya/lib/parser/render'

const selectorFor = ({ cursor, activeBlocks = [], blockKey = 'block' }) =>
  StateRender.prototype.getSelector.call({
    muya: { contentState: { cursor, selectedBlock: null } }
  }, {
    key: blockKey,
    type: 'p',
    parent: null
  }, activeBlocks)

describe('StateRender#getSelector cursor guard (FIX-012)', () => {
  it('treats a token as unconflicted when cursor endpoints are absent', () => {
    const block = { key: 'block' }
    const token = { range: { start: 0, end: 3 } }

    expect(StateRender.prototype.checkConflicted.call({}, block, token, {})).toBe(false)
    expect(StateRender.prototype.checkConflicted.call({}, block, token, null)).toBe(false)
  })

  it('preserves token overlap checks for complete cursor endpoints', () => {
    const block = { key: 'block' }
    const token = { range: { start: 0, end: 3 } }

    expect(StateRender.prototype.checkConflicted.call({}, block, token, {
      start: { key: 'block', offset: 1 },
      end: { key: 'block', offset: 1 }
    })).toBe(true)
    expect(StateRender.prototype.checkConflicted.call({}, block, token, {
      start: { key: 'block', offset: 8 },
      end: { key: 'block', offset: 8 }
    })).toBe(false)
  })

  it('renders a block when the cursor has no start point', () => {
    expect(selectorFor({ cursor: {} })).toContain('p#block')
  })

  it('renders a block when cursor state is temporarily null', () => {
    expect(selectorFor({ cursor: null })).toContain('p#block')
  })

  it('keeps the active class for a matching cursor start', () => {
    expect(selectorFor({ cursor: { start: { key: 'block' } } })).toContain('.ag-active')
  })

  it('keeps the active class for a matching active block without a cursor start', () => {
    expect(selectorFor({ cursor: {}, activeBlocks: [{ key: 'block' }] })).toContain('.ag-active')
  })
})
