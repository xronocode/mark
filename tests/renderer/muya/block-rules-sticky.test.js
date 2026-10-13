// FILE: tests/renderer/muya/block-rules-sticky.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-30 sticky conversion of ^-anchored block rules: which rules convert, that exec/test/replace always attempt index 0 only, and that g/m/unanchored/non-RegExp rules are left alone.
//   SCOPE: toStickyAnchored helper and the converted normal/gfm/pedantic grammars exported by blockRules.js.
//   DEPENDS: src/muya/lib/parser/marked/blockRules.js, Vitest.
//   LINKS: .grace/changes/active/C-30; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 — pins START_BLOCK_STICKY_ANCHORED_RULES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GRAMMARS - the three exported grammars under test.
//   HOT_RULES - the five rules that dominated WebKit open time (nptable, table, list, hr, blockquote).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-30: conversion, lastIndex-reset, replace-path and leave-alone cases.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { block, normal, gfm, pedantic, toStickyAnchored } from 'muya/lib/parser/marked/blockRules'

const GRAMMARS = { normal, gfm, pedantic }
const HOT_RULES = ['nptable', 'table', 'list', 'hr', 'blockquote']

describe('toStickyAnchored', () => {
  it('converts a ^-anchored rule to sticky and keeps source and other flags', () => {
    const rule = toStickyAnchored(/^ {0,3}((?:- *){3,})(?:\n+|$)/i)
    expect(rule.sticky).toBe(true)
    expect(rule.ignoreCase).toBe(true)
    expect(rule.source).toBe(String.raw`^ {0,3}((?:- *){3,})(?:\n+|$)`)
  })

  it('resets lastIndex so consecutive execs on different strings both match at 0', () => {
    const rule = toStickyAnchored(/^---\n/)
    expect(rule.exec('---\nrest')[0]).toBe('---\n')
    expect(rule.lastIndex).toBe(4)
    expect(rule.exec('---\nother')[0]).toBe('---\n')
    expect(rule.exec('x---\n')).toBeNull()
  })

  it('test() and String.prototype.replace go through the resetting exec', () => {
    const rule = toStickyAnchored(/^\[([ xX])\] +/)
    rule.lastIndex = 99
    expect(rule.test('[x] done')).toBe(true)
    rule.lastIndex = 99
    expect('[ ] todo'.replace(rule, '')).toBe('todo')
    expect('text [x] later'.replace(rule, '')).toBe('text [x] later')
  })

  it('leaves unanchored, global, multiline, already-sticky and non-RegExp rules untouched', () => {
    const unanchored = /a^b/
    const global = /^x/g
    const multiline = /^x/m
    const sticky = /^x/y
    const fn = () => null
    expect(toStickyAnchored(unanchored)).toBe(unanchored)
    expect(toStickyAnchored(global)).toBe(global)
    expect(toStickyAnchored(multiline)).toBe(multiline)
    expect(toStickyAnchored(sticky)).toBe(sticky)
    expect(toStickyAnchored(fn)).toBe(fn)
    expect(toStickyAnchored('^string')).toBe('^string')
  })
})

describe('converted grammars', () => {
  for (const [name, grammar] of Object.entries(GRAMMARS)) {
    it(`${name}: every ^-anchored, non-g/m RegExp rule is sticky`, () => {
      for (const [key, rule] of Object.entries(grammar)) {
        if (!(rule instanceof RegExp)) continue
        const anchored = rule.source.startsWith('^') && !rule.global && !rule.multiline
        if (anchored) expect(rule.sticky, `${name}.${key}`).toBe(true)
      }
    })
  }

  it('the five hot rules are converted wherever they are RegExps', () => {
    for (const [name, grammar] of Object.entries(GRAMMARS)) {
      for (const key of HOT_RULES) {
        if (grammar[key] instanceof RegExp) expect(grammar[key].sticky, `${name}.${key}`).toBe(true)
      }
    }
    expect(gfm.table.sticky).toBe(true)
    expect(gfm.nptable.sticky).toBe(true)
  })

  it('keeps the gm `item` rule and the shared base table unconverted', () => {
    expect(normal.item.global).toBe(true)
    expect(normal.item.multiline).toBe(true)
    expect(normal.item.sticky).toBe(false)
    expect(block.hr.sticky).toBe(false)
  })
})
