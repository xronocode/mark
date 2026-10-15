// FILE: tests/renderer/util/guideDoc.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the bundled-guide loader (C-40 G-3): every UI language ships a guide, the agent prompt is interpolated, unknown locales fall back to en, and the connect-agent section heading text is resolvable in every locale.
//   SCOPE: loadGuideMarkdown over static/guide/*.md, PROMPT_PLACEHOLDER interpolation, getGuideSectionHeadingText for every shipped locale.
//   DEPENDS: src/renderer/src/util/guideDoc.js, src/renderer/src/i18n (en table).
//   LINKS: src/renderer/src/store/editor.js OPEN_GUIDE_TAB; tests/renderer/i18n/locale-loader.test.js (same bundling pattern).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EXPECTED - the ten UI languages that must bundle a guide document.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - initial pins (C-40 2.3.1).
// END_CHANGE_SUMMARY

import { describe, it, expect, vi } from 'vitest'
import {
  GUIDE_LOCALES,
  GUIDE_SECTION_CONNECT_AGENT,
  PROMPT_PLACEHOLDER,
  loadGuideMarkdown,
  getGuideSectionHeadingText
} from '@/util/guideDoc'

const EXPECTED = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']

describe('util/guideDoc', () => {
  it('bundles all ten UI languages', () => {
    expect(GUIDE_LOCALES).toEqual(EXPECTED)
  })

  it('loads the English guide with the macOS prompt interpolated', async () => {
    const md = await loadGuideMarkdown('en', 'darwin')
    expect(md).toContain('# Mark Guide')
    expect(md).toContain('## Connect your agent')
    // The placeholder is gone and the OS-correct open command is in the fenced block.
    expect(md).not.toContain(PROMPT_PLACEHOLDER)
    expect(md).toContain('open -a Mark <file>.md')
    // Try-it sections required by the spec.
    expect(md).toContain('```mermaid')
    expect(md).toContain('$$')
    // No placeholder copy ships (C-40 review): the advanced-setup line waits for C-47.
    expect(md).not.toContain('coming soon')
  })

  it('interpolates the generic prose prompt on Windows', async () => {
    const md = await loadGuideMarkdown('en', 'win32')
    expect(md).not.toContain(PROMPT_PLACEHOLDER)
    expect(md).not.toContain('open -a Mark <file>.md')
    expect(md).toContain('open it for the user in Mark')
  })

  it('loads the localized document for every shipped language', async () => {
    const headings = {
      de: '# Mark-Handbuch',
      en: '# Mark Guide',
      es: '# Guía de Mark',
      fr: '# Guide Mark',
      ja: '# Markガイド',
      ko: '# Mark 가이드',
      pt: '# Guia do Mark',
      ru: '# Гид по Mark',
      'zh-CN': '# Mark 指南',
      'zh-TW': '# Mark 指南'
    }
    for (const locale of EXPECTED) {
      const md = await loadGuideMarkdown(locale)
      expect(md, locale).toContain(headings[locale])
      // Every translation must keep the prompt placeholder resolved.
      expect(md, locale).not.toContain(PROMPT_PLACEHOLDER)
      // Every translation keeps the fenced prompt block with a copy button.
      expect(md, locale).toContain('```text')
    }
  })

  it('falls back to the English guide with an anchored warning for an unknown locale', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const md = await loadGuideMarkdown('xx')
      expect(md).toContain('# Mark Guide')
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[guide][loadGuideMarkdown][BLOCK_GUIDE_LOCALE_MISSING]')
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('resolves the connect-agent section heading text for every locale', async () => {
    const headings = {
      de: 'Verbinde deinen Agenten',
      en: 'Connect your agent',
      es: 'Conecta tu agente',
      fr: 'Connectez votre agent',
      ja: 'エージェントを接続',
      ko: '에이전트 연결',
      pt: 'Conecte seu agente',
      ru: 'Подключите агента',
      'zh-CN': '连接你的智能体',
      'zh-TW': '連接你的 AI 代理'
    }
    for (const locale of EXPECTED) {
      const md = await loadGuideMarkdown(locale)
      expect(getGuideSectionHeadingText(md, GUIDE_SECTION_CONNECT_AGENT), locale).toBe(
        headings[locale]
      )
    }
  })

  it('returns an empty heading for missing sections or unparsable documents', () => {
    expect(getGuideSectionHeadingText('', GUIDE_SECTION_CONNECT_AGENT)).toBe('')
    expect(getGuideSectionHeadingText('# No h2 here\n\nJust text', GUIDE_SECTION_CONNECT_AGENT)).toBe('')
    expect(getGuideSectionHeadingText('## Heading\n', 'unknown-section')).toBe('')
  })
})
