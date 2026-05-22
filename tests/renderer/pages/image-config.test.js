/**
 * Tests for src/renderer/src/prefComponents/image/config.js
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

import { getImageActions } from '@/prefComponents/image/config'

describe('image/config.js', () => {
  describe('getImageActions', () => {
    it('returns upload, folder, and path options', () => {
      const actions = getImageActions()
      expect(actions).toHaveLength(3)
      expect(actions.map((a) => a.value)).toEqual(['upload', 'folder', 'path'])
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
