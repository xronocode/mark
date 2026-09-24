// FILE: tests/renderer/commands/heading-search.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-19 HeadingSearchCommand (fuzzy filtering, level indent labels, slug jump, empty TOC).
//   SCOPE: Direct command-object tests with a stubbed rootState and mocked bus/i18n.
//   DEPENDS: @/commands/headingSearch, Vitest.
//   LINKS: .grace/changes/active/C-19; .grace/verification/runtime.xml V-M-011 scenario-31.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   headings - Shared listToc fixture (document-order headings).
//   rootState - Minimal { editor: { listToc } } stub.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-19: search filters/indents listToc, empty query lists all, subsequence matching, executeSubcommand emits scroll-to-header, empty TOC returns [].
// END_CHANGE_SUMMARY

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('../../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/i18n', () => ({
  t: (k) => k,
  i18n: { global: { t: (k) => k } }
}))
vi.mock('@/commands/descriptions', () => ({
  default: (id) => `desc:${id}`
}))
vi.mock('@/util', () => ({
  delay: () => Promise.resolve()
}))

import bus from '@/bus'
import HeadingSearchCommand from '@/commands/headingSearch'

const headings = [
  { slug: 'ag-1', content: 'Strategy Overview', lvl: 1 },
  { slug: 'ag-2', content: 'Market Analysis', lvl: 2 },
  { slug: 'ag-3', content: 'Risks', lvl: 3 },
  { slug: 'ag-4', content: 'Financial Plan', lvl: 2 }
]
const rootState = { editor: { listToc: headings } }

describe('HeadingSearchCommand — C-19', () => {
  beforeEach(() => {
    bus.emit.mockClear()
  })

  it('lists every heading (indented by level) with an empty query', async () => {
    const cmd = new HeadingSearchCommand(rootState)
    const result = await cmd.search('')
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ id: 'ag-1', description: 'Strategy Overview', title: 'Strategy Overview' })
    expect(result[1].description).toBe('  Market Analysis')
    expect(result[2].description).toBe('    Risks')
  })

  it('fuzzy-filters as a case-insensitive subsequence', async () => {
    const cmd = new HeadingSearchCommand(rootState)
    expect(await cmd.search('mkt')).toHaveLength(1) // Market Analysis
    expect((await cmd.search('plan'))[0].id).toBe('ag-4') // Financial Plan
    expect((await cmd.search('STRAT'))[0].id).toBe('ag-1') // case-insensitive
    expect(await cmd.search('zzz')).toEqual([])
  })

  it('executeSubcommand emits scroll-to-header with the slug', async () => {
    const cmd = new HeadingSearchCommand(rootState)
    await cmd.executeSubcommand('ag-3')
    expect(bus.emit).toHaveBeenCalledWith('scroll-to-header', 'ag-3')
  })

  it('run populates subcommands; execute opens the palette after a tick', async () => {
    const cmd = new HeadingSearchCommand(rootState)
    await cmd.run()
    expect(cmd.subcommands).toHaveLength(4)
    expect(bus.emit).not.toHaveBeenCalled()
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('returns [] for documents without headings', async () => {
    const cmd = new HeadingSearchCommand({ editor: { listToc: [] } })
    expect(await cmd.search('')).toEqual([])
  })

  it('is safe when listToc is missing', async () => {
    const cmd = new HeadingSearchCommand({ editor: {} })
    expect(await cmd.search('x')).toEqual([])
  })
})
