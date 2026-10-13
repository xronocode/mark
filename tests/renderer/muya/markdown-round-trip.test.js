// FILE: tests/renderer/muya/markdown-round-trip.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that opening and saving an agent-style markdown file without edits leaves its bytes unchanged (C-24 round-trip constraint).
//   SCOPE: Muya setMarkdown -> getMarkdown in jsdom over the C-24 corpus fixtures, with footnotes on and off.
//   DEPENDS: src/muya/lib (Muya), Vitest jsdom, node:fs.
//   LINKS: .grace/changes/archive/C-24; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CORPUS - fixtures/lexer-corpus directory shared with the lexer parity test.
//   ROUND_TRIP_FIXTURES - the C-24 fixtures that must survive open/save byte for byte.
//   VARIANTS - Muya option sets the fixtures are checked under.
//   roundTrip - mounts a Muya instance on a fresh container and returns getMarkdown().
//   expectedFor - picks the exact expected output for a fixture and variant (input, or its pinned normalization).
//   KNOWN_NORMALIZATIONS - pre-existing, meaning-preserving rewrites muya applies on save, pinned exactly so any new drift fails.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-24 T-001/T-002: baseline captured before any callout / front matter / image change. It exposed adjacent footnote definitions losing the second `[^id]:` marker with footnotes on (fixed in the lexer); three meaning-preserving normalizations are pinned in KNOWN_NORMALIZATIONS.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Muya from 'muya/lib'

const CORPUS = resolve(__dirname, 'fixtures/lexer-corpus')
const ROUND_TRIP_FIXTURES = ['footnotes.md', 'front-matter.md', 'task-lists.md', 'github-alerts.md', 'obsidian-callouts.md', 'image-links.md']
const VARIANTS = { footnoteOn: { footnote: true }, footnoteOff: { footnote: false } }

// Muya always writes one blank line between blocks and lower-cases task markers.
// These rewrites predate C-24 and keep the meaning; each entry maps the input to
// the exact expected output so anything beyond them still fails.
const KNOWN_NORMALIZATIONS = {
  'footnotes.md/footnoteOn': (md) => md.replace('emphasis*.\n[^2]:', 'emphasis*.\n\n[^2]:'),
  'task-lists.md': (md) => md.replace('[X] nested done upper\n\n1.', '[x] nested done upper\n1.'),
  'obsidian-callouts.md': (md) => md.replace('> [!quote]\n> > Nested', '> [!quote]\n> \n> > Nested')
}

function expectedFor (file, variant, markdown) {
  const normalize = KNOWN_NORMALIZATIONS[`${file}/${variant}`] || KNOWN_NORMALIZATIONS[file]
  return normalize ? normalize(markdown) : markdown
}

function roundTrip (markdown, opts) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  try {
    return new Muya(container, { ...opts, markdown }).getMarkdown()
  } finally {
    container.remove()
  }
}

describe('markdown open/save round-trip (C-24)', () => {
  for (const file of ROUND_TRIP_FIXTURES) {
    for (const [name, opts] of Object.entries(VARIANTS)) {
      it(`${file} / ${name} survives open and save`, () => {
        const markdown = readFileSync(join(CORPUS, file), 'utf8')
        const normalize = KNOWN_NORMALIZATIONS[`${file}/${name}`] || KNOWN_NORMALIZATIONS[file]
        if (normalize) expect(normalize(markdown), 'normalization must match the fixture').not.toBe(markdown)
        expect(roundTrip(markdown, opts)).toBe(expectedFor(file, name, markdown))
      })
    }
  }
})
