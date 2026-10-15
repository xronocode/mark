// FILE: src/renderer/src/util/agentPrompt.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The ONE universal agent prompt (C-40 R-1a) reused by the
//            C-46 welcome screen "Connect your agent" row and later by
//            the C-40 Guide — localized via i18n, with the open command
//            chosen per platform.
//   SCOPE:   pure helpers; no DOM, no IPC.
//   DEPENDS: util/index (isOsx/isWindows), i18n.
//   LINKS: src/renderer/src/components/recent/index.vue (Copy prompt);
//          .grace/changes/active/C-40 R-1a (Guide reuse).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   openCommandForPlatform - the "open the file in Mark" shell command for the current OS.
//   getAgentPrompt - the full localized prompt text (i18n key agentPrompt.prompt).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-46: prompt defined once here so the
//     welcome screen and the C-40 Guide cannot drift apart.
// END_CHANGE_SUMMARY

import { isOsx, isWindows } from './index'
import { t } from '../i18n'

// START_CONTRACT: openCommandForPlatform
//   PURPOSE: Pick the "open a .md file in Mark" command for the running OS.
//   INPUTS: { platform?: string - override for tests; defaults to the detected platform }
//   OUTPUTS: { string - shell command with a <file>.md placeholder }
//   SIDE_EFFECTS: none
//   LINKS: C-40 R-1a (Windows handler to be verified before shipping 2.3.1)
// END_CONTRACT: openCommandForPlatform
export const openCommandForPlatform = (platform) => {
  const p = platform || (isOsx ? 'darwin' : isWindows ? 'win32' : 'linux')
  if (p === 'darwin') return 'open -a Mark <file>.md'
  if (p === 'win32') return 'start mark <file>.md'
  return 'mark <file>.md'
}

// START_CONTRACT: getAgentPrompt
//   PURPOSE: Compose the universal agent prompt in the current UI language.
//   INPUTS: { tFn?: (key: string, params?: object) => string - i18n override for tests }
//   OUTPUTS: { string - the full prompt text ready to copy }
//   SIDE_EFFECTS: none
// END_CONTRACT: getAgentPrompt
export const getAgentPrompt = (tFn) => {
  const translate = tFn || t
  return translate('agentPrompt.prompt', { openCommand: openCommandForPlatform() })
}
