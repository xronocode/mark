/**
 * Tests for src/renderer/src/prefComponents/image/config.js
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

import { getImageActions } from '@/prefComponents/image/config'

describe('image/config.js', () => {
  describe('getImageActions', () => {
    it('returns folder and path options; upload is retired (2026-10-15)', () => {
      const actions = getImageActions()
      expect(actions).toHaveLength(2)
      expect(actions.map((a) => a.value)).toEqual(['folder', 'path'])
    })

    it('each entry has label and value', () => {
      const actions = getImageActions()
      actions.forEach((a) => {
        expect(a).toHaveProperty('label')
        expect(a).toHaveProperty('value')
        expect(typeof a.label).toBe('string')
      })
    })
  })
})
