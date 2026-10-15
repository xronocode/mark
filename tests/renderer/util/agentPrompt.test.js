// FILE: tests/renderer/util/agentPrompt.test.js
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Pin the OS-variant selection of the universal "connect your agent" prompt (C-40 R-1a).
//   SCOPE: getAgentPrompt platform routing; mac command vs generic prose; default platform resolution.
//   DEPENDS: src/renderer/src/util/agentPrompt.js
//   LINKS: src/renderer/src/util/guideDoc.js (interpolation); tests/renderer/util/guideDoc.test.js
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE - fake translation table used by the injected t.
//   t - injected translate double reading TABLE (key passthrough).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.1 - 2026-10-15 C-46 review: MODULE_MAP lists the t double (grace lint); pins unchanged — already match getAgentPrompt(t, platform).
//   v1.0.0 - initial pins (C-40 2.3.1).
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import { getAgentPrompt } from '@/util/agentPrompt'

const TABLE = {
  'guide.agentPrompt.mac': 'MAC PROMPT open -a Mark <file>.md',
  'guide.agentPrompt.generic': 'GENERIC PROMPT open it for the user in Mark'
}

const t = (key) => TABLE[key] || key

describe('util/agentPrompt — getAgentPrompt', () => {
  it('macOS gets the open -a Mark command variant', () => {
    expect(getAgentPrompt(t, 'darwin')).toBe('MAC PROMPT open -a Mark <file>.md')
  })

  it('Windows and Linux get the generic prose variant (no Windows CLI exists)', () => {
    expect(getAgentPrompt(t, 'win32')).toBe('GENERIC PROMPT open it for the user in Mark')
    expect(getAgentPrompt(t, 'linux')).toBe('GENERIC PROMPT open it for the user in Mark')
  })

  it('falls back to the generic variant when the platform is unknown', () => {
    expect(getAgentPrompt(t, '')).toBe('GENERIC PROMPT open it for the user in Mark')
  })

  it('resolves the current platform from the window.electron shim when omitted', () => {
    // tests/renderer/setup.ts installs window.electron.process.platform = 'darwin'
    expect(getAgentPrompt(t)).toBe('MAC PROMPT open -a Mark <file>.md')
    const previous = window.electron.process.platform
    window.electron.process.platform = 'win32'
    try {
      expect(getAgentPrompt(t)).toBe('GENERIC PROMPT open it for the user in Mark')
    } finally {
      window.electron.process.platform = previous
    }
  })
})
