// FILE: tests/renderer/muya/emoji-timestamps.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Keep clock times literal without breaking supported emoji shortcodes.
//   SCOPE: Inline tokenizer, Markdown round-trip and marked HTML emoji dispatch.
//   DEPENDS: muya/lib/parser, muya/lib/parser/marked, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   TIMES - clock and duration text that must never become emoji tokens.
// END_MODULE_MAP

import { describe, expect, it, vi } from 'vitest'
import { tokenizer, generator } from 'muya/lib/parser'
import marked from 'muya/lib/parser/marked'

const TIMES = ['19:55:01', '00:00:00', '23:59:59', '9:5:1', '125:45:09', '19:55:01.706–19:55:01.709 +05']

describe('emoji recognition around timestamps', () => {
  it.each(TIMES)('keeps %s literal in the editor and HTML export', text => {
    const tokens = tokenizer(text)
    expect(tokens.filter(token => token.type === 'emoji')).toHaveLength(0)
    expect(generator(tokens)).toBe(text)
    const emojiRenderer = vi.fn(alias => `[emoji:${alias}]`)
    expect(marked(text, { emojiRenderer }).trim()).toBe(`<p>${text}</p>`)
    expect(emojiRenderer).not.toHaveBeenCalled()
  })

  it('preserves real numeric, signed and alphanumeric emoji beside a timestamp', () => {
    const text = '19:55:01 :100: :1234: :+1: :-1: :8ball: :tada:'
    const tokens = tokenizer(text)
    expect(tokens.filter(token => token.type === 'emoji').map(token => token.content))
      .toEqual(['100', '1234', '+1', '-1', '8ball', 'tada'])
    expect(generator(tokens)).toBe(text)
    const emojiRenderer = vi.fn(alias => `[emoji:${alias}]`)
    expect(marked(text, { emojiRenderer }).trim()).toBe(
      '<p>19:55:01 [emoji:100] [emoji:1234] [emoji:+1] [emoji:-1] [emoji:8ball] [emoji:tada]</p>'
    )
  })

  it('retains unknown alphabetic shortcodes for the existing editing warning', () => {
    expect(tokenizer(':not_a_real_emoji:').filter(token => token.type === 'emoji'))
      .toMatchObject([{ content: 'not_a_real_emoji' }])
  })
})
