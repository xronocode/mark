// FILE: src/renderer/src/util/guideDoc.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Load the localized Mark Guide markdown (C-40 G-3) from the bundled static/guide/*.md files and resolve section anchors.
//   SCOPE: import.meta.glob lazy chunks (one per locale, ?raw) so the documents ship inside the renderer bundle in dev and in every Tauri build; prompt interpolation via agentPrompt.js; guide-section heading-text extraction for scroll deep links; unknown locales fall back to en.
//   DEPENDS: static/guide/*.md (build-time glob), ./agentPrompt.js, ../i18n t.
//   LINKS: src/renderer/src/store/editor.js OPEN_GUIDE_TAB / LISTEN_FOR_OPEN_GUIDE; src/renderer/src/i18n/localeLoader.js (same bundling pattern).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GUIDE_LOCALES - locale codes with a bundled guide document.
//   GUIDE_SECTION_CONNECT_AGENT - section key for the "Connect your agent" heading (deep-link target).
//   PROMPT_PLACEHOLDER - token replaced by the localized agent prompt inside the guide markdown.
//   loadGuideMarkdown - locale code → guide markdown with the agent prompt interpolated (en fallback).
//   getGuideSectionHeadingText - heading text of a guide section key (used to find its muya TOC anchor).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - initial module (C-40 2.3.1 G-3). Mirrors localeLoader's
//   import.meta.glob bundling (fetch would 404 in Tauri builds); the agent prompt
//   lives in ONE module (agentPrompt.js) and is interpolated into the fenced
//   block so every locale ships the same OS-correct prompt. Section deep links
//   resolve through the heading TEXT (listToc match) because WYSIWYG headings
//   carry id=muya-block-key, not the github slug.
// END_CHANGE_SUMMARY

import { getAgentPrompt } from './agentPrompt'
import { t } from '../i18n'

// Same relative layout as localeLoader: src/renderer/src/util → repo root.
const DOCS = import.meta.glob('../../../../static/guide/*.md', {
  query: '?raw',
  import: 'default'
})

const codeOf = (path) => path.split('/').pop().replace('.md', '')

export const GUIDE_LOCALES = Object.keys(DOCS).map(codeOf).sort()

export const GUIDE_SECTION_CONNECT_AGENT = 'connect-agent'

export const PROMPT_PLACEHOLDER = '@@AGENT_PROMPT@@'

// START_CONTRACT: loadGuideMarkdown
//   PURPOSE: Resolve one locale's guide markdown with the OS-correct agent prompt interpolated.
//   INPUTS: { locale: string - e.g. 'ru', 'zh-CN'; platform: string - optional platform override forwarded to getAgentPrompt }
//   OUTPUTS: { Promise<string> - the guide markdown; the en document when the locale is not bundled or fails to load }
//   SIDE_EFFECTS: console.warn on a missing or broken guide locale
//   LINKS: editor.js LISTEN_FOR_OPEN_GUIDE
// END_CONTRACT: loadGuideMarkdown
export async function loadGuideMarkdown(locale, platform) {
  const prompt = getAgentPrompt(t, platform)
  const interpolate = (raw) =>
    typeof raw === 'string' ? raw.split(PROMPT_PLACEHOLDER).join(prompt) : raw

  const load = DOCS[`../../../../static/guide/${locale}.md`]
  if (load) {
    // START_BLOCK_GUIDE_LOAD_FAILED
    try {
      const raw = await load()
      if (typeof raw === 'string') return interpolate(raw)
      console.warn(`[guide][loadGuideMarkdown][BLOCK_GUIDE_LOAD_FAILED] ${locale}: not a string`)
    } catch (e) {
      console.warn(`[guide][loadGuideMarkdown][BLOCK_GUIDE_LOAD_FAILED] ${locale}:`, e)
    }
    // END_BLOCK_GUIDE_LOAD_FAILED
  } else {
    // START_BLOCK_GUIDE_LOCALE_MISSING
    console.warn(`[guide][loadGuideMarkdown][BLOCK_GUIDE_LOCALE_MISSING] no bundled guide ${locale}`)
    // END_BLOCK_GUIDE_LOCALE_MISSING
  }

  if (locale !== 'en') {
    const fallback = DOCS[`../../../../static/guide/en.md`]
    if (fallback) {
      const raw = await fallback()
      return interpolate(raw)
    }
  }
  return interpolate('')
}

// START_CONTRACT: getGuideSectionHeadingText
//   PURPOSE: Extract the heading text a guide section key points at.
//   INPUTS: { markdown: string - guide markdown (prompt may or may not be interpolated); section: string - section key (GUIDE_SECTION_CONNECT_AGENT) }
//   OUTPUTS: { string - the heading text ('' when the section or its heading is not found) }
//   SIDE_EFFECTS: none
//   LINKS: editor.js OPEN_GUIDE_TAB (matches the heading against listToc to
//          resolve the muya block key that scroll-to-header expects — WYSIWYG
//          headings carry id=block-key, not the github slug)
// END_CONTRACT: getGuideSectionHeadingText
export function getGuideSectionHeadingText(markdown, section) {
  if (typeof markdown !== 'string' || !markdown) return ''
  // START_BLOCK_FIND_SECTION_HEADING
  // Guide-format contract: the "Connect your agent" section is the FIRST
  // `## ` heading of the document, in every locale.
  if (section === GUIDE_SECTION_CONNECT_AGENT) {
    for (const line of markdown.split('\n')) {
      const m = line.match(/^##\s+(.+?)\s*$/)
      if (m) {
        return m[1]
      }
    }
  }
  // END_BLOCK_FIND_SECTION_HEADING
  return ''
}
