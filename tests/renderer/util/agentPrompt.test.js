// FILE: tests/renderer/util/agentPrompt.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 R-1a universal agent prompt module — one definition shared by the C-46 welcome screen and the future Guide.
//   SCOPE: openCommandForPlatform platform table + getAgentPrompt i18n composition.
//   DEPENDS: vitest, util/agentPrompt (i18n + util stubbed).
//   LINKS: .grace/changes/active/C-40 R-1a; .grace/verification/runtime.xml V-M-011 scenario-45.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   tStub - i18n double that surfaces the openCommand interpolation.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-46: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/i18n', () => ({
  t: vi.fn((key, params) =>
    key === 'agentPrompt.prompt' ? `prompt<${params?.openCommand}>` : key
  )
}))
vi.mock('@/util', () => ({ isOsx: false, isWindows: false, isLinux: true }))

import { openCommandForPlatform, getAgentPrompt } from '@/util/agentPrompt'

const tStub = (key, params) => (key === 'agentPrompt.prompt' ? `prompt<${params?.openCommand}>` : key)

describe('util/agentPrompt', () => {
  it('picks the open-in-Mark command per platform', () => {
    expect(openCommandForPlatform('darwin')).toBe('open -a Mark <file>.md')
    expect(openCommandForPlatform('win32')).toBe('start mark <file>.md')
    expect(openCommandForPlatform('linux')).toBe('mark <file>.md')
  })

  it('falls back to the detected platform when none is passed', () => {
    // The test mocks util as Linux.
    expect(openCommandForPlatform()).toBe('mark <file>.md')
  })

  it('composes the localized prompt with the platform open command', () => {
    expect(getAgentPrompt(tStub)).toBe('prompt<mark <file>.md>>')
  })
})
