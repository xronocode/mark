// FILE: tests/renderer/util/agent-prompt-rich.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-009 rich-Markdown agent prompt: every locale's guide.agentPrompt.mac/.generic keep every syntax token verbatim through the real vue-i18n pipeline, and every locale's Guide ships the «What Mark renders» showcase with a live example of each feature family.
//   SCOPE: getAgentPrompt over the app i18n instance loaded with each static/locales/*.json table (mac + generic); static/guide/*.md showcase inventory; loadGuideMarkdown interpolation of the new prompt.
//   DEPENDS: src/renderer/src/i18n (app instance incl. the custom messageCompiler), src/renderer/src/util/agentPrompt.js, src/renderer/src/util/guideDoc.js, static/locales/*.json, static/guide/*.md.
//   LINKS: tests/renderer/util/agentPrompt.test.js (OS routing); tests/renderer/util/guideDoc.test.js (bundling); tests/e2e/rich-markdown-coverage.spec.ts (rendering honesty guard).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EXPECTED - the ten UI languages.
//   TABLES - the raw static/locales/*.json translation tables (not the .min.json bundle, so the pin holds before the min files regenerate).
//   MERMAID_TYPES - the 22 mermaid diagram keywords the prompt names.
//   TOKENS - every syntax token that must survive every translation and the i18n message compiler verbatim.
//   SHOWCASE_MARKERS - the showcase features every Guide document must carry.
//   GUIDES - raw static/guide/*.md sources via import.meta.glob (?raw).
//   renderPrompt - installs one locale into the app i18n instance, renders getAgentPrompt, restores 'en'.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-51 T-009: prompt gained the full rich-Markdown feature list (22 mermaid types, vega-lite/flowchart/sequence, callout tags + aliases, task lists, math, footnotes, front matter, emoji); this pin keeps translations honest and the i18n pipeline transparent for the tokens.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import { i18n, t } from '@/i18n'
import { getAgentPrompt } from '@/util/agentPrompt'
import { loadGuideMarkdown, PROMPT_PLACEHOLDER } from '@/util/guideDoc'

import de from '../../../static/locales/de.json'
import en from '../../../static/locales/en.json'
import es from '../../../static/locales/es.json'
import fr from '../../../static/locales/fr.json'
import ja from '../../../static/locales/ja.json'
import ko from '../../../static/locales/ko.json'
import pt from '../../../static/locales/pt.json'
import ru from '../../../static/locales/ru.json'
import zhCN from '../../../static/locales/zh-CN.json'
import zhTW from '../../../static/locales/zh-TW.json'

const TABLES = { de, en, es, fr, ja, ko, pt, ru, 'zh-CN': zhCN, 'zh-TW': zhTW }
const EXPECTED = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']

const MERMAID_TYPES = [
  'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'erDiagram',
  'gantt', 'timeline', 'gitGraph', 'mindmap', 'journey', 'quadrantChart', 'pie',
  'xychart-beta', 'sankey-beta', 'block-beta', 'packet-beta', 'kanban',
  'architecture-beta', 'radar-beta', 'treemap-beta', 'requirementDiagram', 'C4Context'
]

const TOKENS = [
  '```mermaid',
  ...MERMAID_TYPES,
  '```vega-lite',
  '```flowchart',
  '```sequence',
  '> [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]',
  'info, todo, success, question, failure, danger, bug, example, quote, abstract',
  '- [ ]',
  '- [x]',
  '$…$',
  '$$…$$',
  '[^1]',
  ':shortcodes:',
  'open -a Mark <file>.md'
]

const SHOWCASE_MARKERS = [
  '````text',
  '```mermaid\nflowchart LR',
  'sequenceDiagram',
  'pie title',
  'gantt',
  'mindmap',
  '```vega-lite',
  '```flowchart',
  '```sequence',
  '> [!NOTE] ',
  '> [!TIP]-',
  '- [x]',
  '- [ ]',
  '$$',
  '[^1]:',
  ':tada:',
  ':---',
  ':----:',
  '----:'
]

const GUIDES = import.meta.glob('../../../static/guide/*.md', {
  query: '?raw',
  import: 'default'
})

// Install one locale's table into the APP i18n instance and render the
// prompt through it — the same custom messageCompiler, modifiers and
// pluralRules the editor runs with. The locale is restored afterwards.
const renderPrompt = (locale, platform) => {
  i18n.global.setLocaleMessage(locale, TABLES[locale])
  i18n.global.locale.value = locale
  try {
    return getAgentPrompt(t, platform)
  } finally {
    i18n.global.locale.value = 'en'
  }
}

describe('util/agentPrompt — rich Markdown prompt tokens (C-51 T-009)', () => {
  it('names exactly the 22 mermaid types the renderer ships', () => {
    expect(MERMAID_TYPES).toHaveLength(22)
    const enMac = renderPrompt('en', 'darwin')
    for (const type of MERMAID_TYPES) {
      expect(enMac, `mermaid type ${type}`).toContain(type)
    }
  })

  for (const locale of EXPECTED) {
    it(`${locale}: mac prompt keeps every syntax token through the i18n pipeline`, () => {
      const prompt = renderPrompt(locale, 'darwin')
      expect(prompt.split('\n').length, `${locale} prompt must stay multi-line`).toBeGreaterThan(10)
      for (const token of TOKENS) {
        expect(prompt, `${locale} mac prompt lost ${token}`).toContain(token)
      }
    })

    it(`${locale}: generic prompt keeps the tokens and drops the open command`, () => {
      const prompt = renderPrompt(locale, 'win32')
      expect(prompt).not.toContain('open -a Mark')
      for (const token of TOKENS.filter((token) => token !== 'open -a Mark <file>.md')) {
        expect(prompt, `${locale} generic prompt lost ${token}`).toContain(token)
      }
    })
  }
})

describe('static/guide — «What Mark renders» showcase (C-51 T-009)', () => {
  for (const locale of EXPECTED) {
    it(`${locale}: bundles every showcase feature family`, async () => {
      const load = GUIDES[`../../../static/guide/${locale}.md`]
      expect(load, `${locale} guide must be bundled`).toBeTruthy()
      // CRLF-normalised: the Windows CI checkout has \r\n line endings.
      const raw = String(await load()).replace(/\r\n/g, '\n')
      for (const marker of SHOWCASE_MARKERS) {
        expect(raw, `${locale} guide missing ${marker}`).toContain(marker)
      }
    })
  }

  it('interpolates the new multi-line mac prompt inside the 4-backtick fence', async () => {
    const md = String(await loadGuideMarkdown('en', 'darwin')).replace(/\r\n/g, '\n')
    expect(md).not.toContain(PROMPT_PLACEHOLDER)
    expect(md).toContain('````text\nWhen you produce a plan')
    expect(md).toContain('open -a Mark <file>.md')
    expect(md).toContain('```mermaid fences;')
    expect(md).toContain('the user\'s edits are your next instruction.\n````')
  })

  it('interpolates the generic prompt without the open command on Windows', async () => {
    const md = String(await loadGuideMarkdown('en', 'win32')).replace(/\r\n/g, '\n')
    expect(md).not.toContain(PROMPT_PLACEHOLDER)
    expect(md).not.toContain('open -a Mark')
    expect(md).toContain('open it for the user in Mark')
  })
})
