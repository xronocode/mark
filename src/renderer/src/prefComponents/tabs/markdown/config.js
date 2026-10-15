// FILE: src/renderer/src/prefComponents/tabs/markdown/config.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Option builders for the Markdown tab (C-38 T-004) — lists/bullet/ordered-format/indentation, front matter format and sequence-diagram pop-ups in IA §3.4 wording.
//   SCOPE: Pure i18n-backed option lists; no store or window access.
//   DEPENDS: i18n (t).
//   LINKS: .grace/changes/active/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.4; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   bulletListMarkerOptions - `-` `*` `+`.
//   getOrderListDelimiterOptions - "1. item" / "1) item".
//   getListIndentationOptions - "Align with text" (dfm), "Use a tab", 1–4 spaces.
//   getFrontmatterTypeOptions - YAML / TOML / JSON (;) / JSON ({}).
//   getSequenceThemeOptions - Hand-drawn / Simple.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: replaces prefComponents/markdown/config.js — plain-language labels replace "DFM Style" jargon (IA §1 problem 5); the dead preferHeadingStyle builder is gone with its row.]
// END_CHANGE_SUMMARY

import { t } from '@/i18n'

export const bulletListMarkerOptions = [{
  label: '-',
  value: '-'
}, {
  label: '*',
  value: '*'
}, {
  label: '+',
  value: '+'
}]

export const getOrderListDelimiterOptions = () => [{
  label: t('preferences.markdown.lists.orderedListDot'),
  value: '.'
}, {
  label: t('preferences.markdown.lists.orderedListParen'),
  value: ')'
}]

export const getListIndentationOptions = () => [{
  label: t('preferences.markdown.lists.indentAlignWithText'),
  value: 'dfm'
}, {
  label: t('preferences.markdown.lists.indentTab'),
  value: 'tab'
}, {
  label: t('preferences.markdown.lists.indentOneSpace'),
  value: 1
}, {
  label: t('preferences.markdown.lists.indentTwoSpaces'),
  value: 2
}, {
  label: t('preferences.markdown.lists.indentThreeSpaces'),
  value: 3
}, {
  label: t('preferences.markdown.lists.indentFourSpaces'),
  value: 4
}]

export const getFrontmatterTypeOptions = () => [{
  label: 'YAML',
  value: '-'
}, {
  label: 'TOML',
  value: '+'
}, {
  label: t('preferences.markdown.extensions.frontmatterJsonSemicolon'),
  value: ';'
}, {
  label: t('preferences.markdown.extensions.frontmatterJsonBrace'),
  value: '{'
}]

export const getSequenceThemeOptions = () => [{
  label: t('preferences.markdown.compatibility.sequenceHandDrawn'),
  value: 'hand'
}, {
  label: t('preferences.markdown.compatibility.sequenceSimple'),
  value: 'simple'
}]
