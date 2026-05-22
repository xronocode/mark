/**
 * Tests for src/renderer/src/router/index.js
 *
 * Covers: routes function, parseSettingsPage logic
 */

// Mock all page/component imports
vi.mock('@/pages/app', () => ({ default: { name: 'App' } }))
vi.mock('@/pages/preference', () => ({ default: { name: 'Preference' } }))
vi.mock('@/prefComponents/general', () => ({ default: { name: 'General' } }))
vi.mock('@/prefComponents/editor', () => ({ default: { name: 'Editor' } }))
vi.mock('@/prefComponents/markdown', () => ({ default: { name: 'Markdown' } }))
vi.mock('@/prefComponents/spellchecker', () => ({ default: { name: 'SpellChecker' } }))
vi.mock('@/prefComponents/theme', () => ({ default: { name: 'Theme' } }))
vi.mock('@/prefComponents/image', () => ({ default: { name: 'Image' } }))
vi.mock('@/prefComponents/keybindings', () => ({ default: { name: 'Keybindings' } }))
vi.mock('@/prefComponents/language', () => ({ default: { name: 'Language' } }))

import routes from '@/router'

describe('router/index', () => {
  describe('routes function', () => {
    it('should return an array of route objects', () => {
      const result = routes('editor')
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should redirect to /editor for editor type', () => {
      const result = routes('editor')
      const rootRoute = result.find((r) => r.path === '/')
      expect(rootRoute.redirect).toBe('/editor')
    })

    it('should redirect to /preference for settings type', () => {
      const result = routes('settings')
      const rootRoute = result.find((r) => r.path === '/')
      expect(rootRoute.redirect).toBe('/preference')
    })

    it('should redirect to /preference/spelling for spelling type', () => {
      const result = routes('settings/spelling')
      const rootRoute = result.find((r) => r.path === '/')
      expect(rootRoute.redirect).toBe('/preference/spelling')
    })

    it('should have /editor route', () => {
      const result = routes('editor')
      const editorRoute = result.find((r) => r.path === '/editor')
      expect(editorRoute).toBeDefined()
      expect(editorRoute.component.name).toBe('App')
    })

    it('should have /preference route with children', () => {
      const result = routes('editor')
      const prefRoute = result.find((r) => r.path === '/preference')
      expect(prefRoute).toBeDefined()
      expect(prefRoute.component.name).toBe('Preference')
      expect(Array.isArray(prefRoute.children)).toBe(true)
    })

    it('should have all preference child routes', () => {
      const result = routes('editor')
      const prefRoute = result.find((r) => r.path === '/preference')
      const childNames = prefRoute.children
        .filter((c) => c.name)
        .map((c) => c.name)

      expect(childNames).toContain('general')
      expect(childNames).toContain('editor')
      expect(childNames).toContain('markdown')
      expect(childNames).toContain('spelling')
      expect(childNames).toContain('theme')
      expect(childNames).toContain('image')
      expect(childNames).toContain('keybindings')
      expect(childNames).toContain('language')
    })

    it('should have default preference child (empty path)', () => {
      const result = routes('editor')
      const prefRoute = result.find((r) => r.path === '/preference')
      const defaultChild = prefRoute.children.find((c) => c.path === '')
      expect(defaultChild).toBeDefined()
      expect(defaultChild.component.name).toBe('General')
    })

    it('general child should have correct component', () => {
      const result = routes('editor')
      const prefRoute = result.find((r) => r.path === '/preference')
      const general = prefRoute.children.find((c) => c.name === 'general')
      expect(general.path).toBe('general')
      expect(general.component.name).toBe('General')
    })

    it('editor child should have correct component', () => {
      const result = routes('editor')
      const prefRoute = result.find((r) => r.path === '/preference')
      const editor = prefRoute.children.find((c) => c.name === 'editor')
      expect(editor.path).toBe('editor')
      expect(editor.component.name).toBe('Editor')
    })

    it('theme child should have correct component', () => {
      const result = routes('editor')
      const prefRoute = result.find((r) => r.path === '/preference')
      const theme = prefRoute.children.find((c) => c.name === 'theme')
      expect(theme.path).toBe('theme')
      expect(theme.component.name).toBe('Theme')
    })
  })
})
