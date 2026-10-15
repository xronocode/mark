/**
 * Tests for src/renderer/src/router/index.js
 *
 * Covers: routes function, parseSettingsPage logic, the C-38 T-003 five
 * tab routes, the remembered-tab '' redirect and every legacy-route
 * redirect.
 */

// Mock all page/component imports
vi.mock('@/pages/app', () => ({ default: { name: 'App' } }))
vi.mock('@/pages/preference', () => ({ default: { name: 'Preference' } }))
vi.mock('@/prefComponents/tabs/general', () => ({ default: { name: 'GeneralTab' } }))
vi.mock('@/prefComponents/tabs/appearance', () => ({ default: { name: 'AppearanceTab' } }))
vi.mock('@/prefComponents/tabs/editor', () => ({ default: { name: 'EditorTab' } }))
vi.mock('@/prefComponents/tabs/markdown', () => ({ default: { name: 'MarkdownTab' } }))
vi.mock('@/prefComponents/tabs/advanced', () => ({ default: { name: 'AdvancedTab' } }))

import routes from '@/router'

const preferenceRoute = (type = 'editor') =>
  routes(type).find((r) => r.path === '/preference')

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

    it('should redirect legacy settings/spelling deep link to the editor tab', () => {
      const result = routes('settings/spelling')
      const rootRoute = result.find((r) => r.path === '/')
      expect(rootRoute.redirect).toBe('/preference/editor')
    })

    it('should have /editor route', () => {
      const result = routes('editor')
      const editorRoute = result.find((r) => r.path === '/editor')
      expect(editorRoute).toBeDefined()
      expect(editorRoute.component.name).toBe('App')
    })

    it('should have /preference route with children', () => {
      const prefRoute = preferenceRoute()
      expect(prefRoute).toBeDefined()
      expect(prefRoute.component.name).toBe('Preference')
      expect(Array.isArray(prefRoute.children)).toBe(true)
    })
  })

  describe('five tab routes', () => {
    it('has exactly the 5 tab children with tab components', () => {
      const children = preferenceRoute().children.filter((c) => c.name)
      expect(children.map((c) => c.name)).toEqual([
        'general',
        'appearance',
        'editor',
        'markdown',
        'advanced'
      ])
      expect(children.map((c) => c.path)).toEqual([
        'general',
        'appearance',
        'editor',
        'markdown',
        'advanced'
      ])
      expect(children.map((c) => c.component.name)).toEqual([
        'GeneralTab',
        'AppearanceTab',
        'EditorTab',
        'MarkdownTab',
        'AdvancedTab'
      ])
    })

    it("the '' child redirects to the remembered tab (general by default)", () => {
      window.localStorage.removeItem('settings.lastTab')
      const emptyChild = preferenceRoute().children.find((c) => c.path === '')
      expect(typeof emptyChild.redirect).toBe('function')
      expect(emptyChild.redirect()).toBe('/preference/general')
    })

    it("the '' child redirects to the persisted tab when one exists", () => {
      window.localStorage.setItem('settings.lastTab', 'appearance')
      const emptyChild = preferenceRoute().children.find((c) => c.path === '')
      expect(emptyChild.redirect()).toBe('/preference/appearance')
      window.localStorage.removeItem('settings.lastTab')
    })
  })

  describe('legacy route redirects (old 9-route deep links)', () => {
    const redirectChildren = () =>
      preferenceRoute().children.filter((c) => c.redirect !== undefined && c.path !== '')

    it('redirects every retired section to the tab that owns it', () => {
      const map = Object.fromEntries(redirectChildren().map((c) => [c.path, c.redirect]))
      expect(map).toEqual({
        spelling: '/preference/editor',
        theme: '/preference/appearance',
        image: '/preference/advanced',
        keybindings: '/preference/advanced',
        language: '/preference/general',
        extensions: '/preference/advanced'
      })
    })

    it('has no other legacy routes left (general/editor/markdown are tabs now)', () => {
      const named = preferenceRoute().children.filter((c) => c.name).map((c) => c.name)
      expect(named).not.toContain('spelling')
      expect(named).not.toContain('theme')
      expect(named).not.toContain('image')
      expect(named).not.toContain('keybindings')
      expect(named).not.toContain('language')
      expect(named).not.toContain('extensions')
    })
  })
})
