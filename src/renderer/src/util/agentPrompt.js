// FILE: src/renderer/src/util/agentPrompt.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Single source of the universal "connect your agent" prompt (C-40 R-1a), localized and OS-aware.
//   SCOPE: Resolve which prompt variant the current OS needs and return its localized text via the i18n t() passed in.
//   DEPENDS: guide.agentPrompt.* keys in static/locales/*.json (via the injected t).
//   LINKS: src/renderer/src/util/guideDoc.js (interpolates the prompt into the guide document);
//          C-46 welcome screen reuses this module for its "Connect your agent" block.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getAgentPrompt - localized universal agent prompt for the given (or current) platform.
//   default - getAgentPrompt
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-16 C-51 T-009: the prompt now lists every
//   rich-Markdown feature Mark renders (user-approved EN text): 22 mermaid
//   types, vega-lite/flowchart/sequence, the 5 GitHub callout tags + 10
//   further tags, task lists, inline/block math, fenced code, footnotes,
//   front matter, emoji shortcodes, links/images — a multi-line message in
//   every locale with every syntax token kept verbatim (pinned by
//   tests/renderer/util/agent-prompt-rich.test.js through the real i18n
//   instance; the texts contain no {}/@/| so the vue-i18n compiler passes
//   them through unchanged).
//   v1.0.0 - initial module (C-40 2.3.1 G-3/R-1a). macOS ships the
//   `open -a Mark <file>.md` command; Windows has no PATH/CLI launcher (NSIS
//   registers file associations only — tauri.windows.conf.json has no
//   addPath/hook), so Windows and other platforms get the prose variant
//   "open it for the user in Mark".
// END_CHANGE_SUMMARY

// START_BLOCK_CURRENT_PLATFORM
// The window.electron shim (install-window-globals.js) installs
// process.platform before any renderer module loads; the empty-string
// fallback keeps the module importable in bare test contexts, where the
// prose variant is the safe default.
const currentPlatform = () => {
  if (typeof window === 'undefined') return ''
  return window.electron?.process?.platform || ''
}
// END_BLOCK_CURRENT_PLATFORM

// START_CONTRACT: getAgentPrompt
//   PURPOSE: Return the localized universal agent prompt for a platform.
//   INPUTS: { t: Function - i18n translate function; platform: string - optional platform override ('darwin' | 'win32' | anything else), defaults to window.electron.process.platform }
//   OUTPUTS: { string - the localized prompt text (EN table when the locale lacks the key) }
//   SIDE_EFFECTS: none
//   LINKS: guideDoc.js loadGuideMarkdown; C-46 welcome screen copy block
// END_CONTRACT: getAgentPrompt
export const getAgentPrompt = (t, platform = currentPlatform()) => {
  // START_BLOCK_SELECT_PROMPT_VARIANT
  const key = platform === 'darwin' ? 'guide.agentPrompt.mac' : 'guide.agentPrompt.generic'
  return t(key)
  // END_BLOCK_SELECT_PROMPT_VARIANT
}

export default getAgentPrompt
