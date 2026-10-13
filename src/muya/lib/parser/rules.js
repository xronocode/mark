// FILE: src/muya/lib/parser/rules.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Inline and begin-of-line grammar for muya's inline tokenizer.
//   SCOPE: beginRules, inlineRules, inlineExtensionRules; post-build sticky conversion of ^-anchored rules (same as C-30 did for block rules).
//   DEPENDS: ./escapeCharacter, ./marked/blockRules (toStickyAnchored).
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011; .grace/changes/active/C-24; .grace/changes/archive/C-30.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   beginRules - rules tried only at offset 0 of a block's text (hr, fence, header, reference definition, math).
//   inlineRules - inline GFM/CommonMark rules tried at each position.
//   inlineExtensionRules - superscript, subscript, footnote identifier.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - (v1.0.0 implied: upstream muya, previously ungoverned.)
//   - 2026-10-13 v1.1.0: C-24 — ^-anchored rules become sticky with a lastIndex-resetting exec. JavaScriptCore did not fail fast at ^ for rules with a lookbehind: footnote_identifier cost 688 ms on a 565 KB document once footnotes became the default (x2 main-thread busy in the WebKit gate). Match set unchanged.
// END_CHANGE_SUMMARY

import { escapeCharacters } from './escapeCharacter'
import { toStickyAnchored } from './marked/blockRules'

/* eslint-disable no-useless-escape */
export const beginRules = {
  hr: /^(\*{3,}$|^\-{3,}$|^\_{3,}$)/,
  code_fense: /^(`{3,})([^`]*)$/,
  header: /(^ {0,3}#{1,6}(\s{1,}|$))/,
  reference_definition: /^( {0,3}\[)([^\]]+?)(\\*)(\]: *)(<?)([^\s>]+)(>?)(?:( +)(["'(]?)([^\n"'\(\)]+)\9)?( *)$/,

  // extra syntax (not belogs to GFM)
  multiple_math: /^(\$\$)$/
}

export const inlineRules = {
  strong: /^(\*\*|__)(?=\S)([\s\S]*?[^\s\\])(\\*)\1(?!(\*|_))/, // can nest
  em: /^(\*|_)(?=\S)([\s\S]*?[^\s\*\\])(\\*)\1(?!\1)/, // can nest
  inline_code: /^(`{1,3})([^`]+?|.{2,})\1/,
  image: /^(\!\[)(.*?)(\\*)\]\((.*)(\\*)\)/,
  link: /^(\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*?)(\\*)\]\((.*)(\\*)\)/, // can nest
  emoji: /^(:)([a-z_\d+-]+?)\1/,
  del: /^(~{2})(?=\S)([\s\S]*?\S)(\\*)\1/, // can nest
  auto_link: /^<(?:([a-zA-Z]{1}[a-zA-Z\d\+\.\-]{1,31}:[^ <>]*)|([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*))>/,
  // (extended www autolink|extended url autolink|extended email autolink) the email regexp is the same as auto_link.
  auto_link_extension: /^(?:(www\.[a-z_-]+\.[a-z]{2,}(?::[0-9]{1,5})?(?:\/[\S]*)?)|(http(?:s)?:\/\/(?:[a-z0-9\-._~]+\.[a-z]{2,}|[0-9.]+|localhost|\[[a-f0-9.:]+\])(?::[0-9]{1,5})?(?:\/[\S]*)?)|([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*))(?=\s|$)/,
  reference_link: /^\[([^\]]+?)(\\*)\](?:\[([^\]]*?)(\\*)\])?/,
  reference_image: /^\!\[([^\]]+?)(\\*)\](?:\[([^\]]*?)(\\*)\])?/,
  tail_header: /^(\s{1,}#{1,})(\s*)$/,
  html_tag: /^(<!--[\s\S]*?-->|(<([a-zA-Z]{1}[a-zA-Z\d-]*) *[^\n<>]* *(?:\/)?>)(?:([\s\S]*?)(<\/\3 *>))?)/, // raw html
  html_escape: new RegExp(`^(${escapeCharacters.join('|')})`, 'i'),
  soft_line_break: /^(\n)(?!\n)/,
  hard_line_break: /^( {2,})(\n)(?!\n)/,

  // patched math marker `$`
  backlash: /^(\\)([\\`*{}\[\]()#+\-.!_>~:\|\<\>$]{1})/,

  // Markdown extensions (not belongs to GFM and Commonmark)
  inline_math: /^(\$)(?!\s)([^\$]*?[^\$\s\\])(\\*)\1(?![\$\d])/
}

// Markdown extensions (not belongs to GFM and Commonmark)
export const inlineExtensionRules = {
  // This is not the best regexp, because it not support `2^2\\^`.
  superscript: /^(\^)((?:[^\^\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  subscript: /^(~)((?:[^~\s]|(?<=\\)\1|(?<=\\) )+?)(?<!\\)\1(?!\1)/,
  footnote_identifier: /^(\[\^)([^\^\[\]\s]+?)(?<!\\)\]/
}
/* eslint-enable no-useless-escape */

// START_BLOCK_STICKY_INLINE_RULES
// C-24: the inline tokenizer calls rule.exec(src) at every position; a
// ^-anchored, non-g/m rule can only match at index 0, which is the only index
// a sticky rule (lastIndex reset to 0 by toStickyAnchored) attempts.
for (const table of [beginRules, inlineRules, inlineExtensionRules]) {
  for (const key of Object.keys(table)) {
    table[key] = toStickyAnchored(table[key])
  }
}
// END_BLOCK_STICKY_INLINE_RULES
