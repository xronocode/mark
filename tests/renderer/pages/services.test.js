/**
 * Tests for src/renderer/src/prefComponents/image/components/uploader/services.js
 */

vi.mock('@/i18n', () => ({
  // services.js uses t() via a relative import '../../../../i18n'
  t: (key) => key
}))

// The module uses a deep relative import; we need to mock the same alias path
vi.mock('../../../../src/renderer/src/i18n', () => ({
  t: (key) => key
}))

import getServices, { isValidService } from '@/prefComponents/image/components/uploader/services'

describe('uploader/services.js', () => {
  describe('getServices', () => {
    it('returns an object with known service keys', () => {
      const services = getServices()
      expect(services).toHaveProperty('none')
      expect(services).toHaveProperty('picgo')
      expect(services).toHaveProperty('github')
      expect(services).toHaveProperty('cliScript')
    })

    it('each service has name, isGdprCompliant, privacyUrl, tosUrl, agreedToLegalNotices', () => {
      const services = getServices()
      for (const [, service] of Object.entries(services)) {
        expect(service).toHaveProperty('name')
        expect(typeof service.isGdprCompliant).toBe('boolean')
        expect(service).toHaveProperty('privacyUrl')
        expect(service).toHaveProperty('tosUrl')
        expect(service).toHaveProperty('agreedToLegalNotices')
      }
    })

    it('none service always has agreedToLegalNotices true', () => {
      const services = getServices()
      expect(services.none.agreedToLegalNotices).toBe(true)
    })

    it('github service has privacy and TOS URLs', () => {
      const services = getServices()
      expect(services.github.privacyUrl).toBeTruthy()
      expect(services.github.tosUrl).toBeTruthy()
    })
  })

  describe('isValidService', () => {
    it('returns false for "none"', () => {
      expect(isValidService('none')).toBe(false)
    })

    it('returns true for "picgo"', () => {
      expect(isValidService('picgo')).toBe(true)
    })

    it('returns true for "github"', () => {
      expect(isValidService('github')).toBe(true)
    })

    it('returns true for "cliScript"', () => {
      expect(isValidService('cliScript')).toBe(true)
    })

    it('returns false for unknown service', () => {
      expect(isValidService('unknown')).toBe(false)
    })
  })
})
