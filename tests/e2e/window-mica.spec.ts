/**
 * window-mica.spec.ts — C-38 T-007 N4 e (Windows 11 Mica behind the
 * custom title bar).
 *
 * Boots the real renderer with the tauri shim and drives the
 * mt_window_effects_state / mt_window_set_mica_theme answers:
 *
 *   - effect reported ACTIVE: the document root gains mica-active, the
 *     title-bar strip (.title-bar-editor-bg) computes a fully
 *     transparent background so the material shows, the root/body go
 *     transparent, and a theme flip re-tints through
 *     mt_window_set_mica_theme with the app-theme darkness;
 *   - effect reported INACTIVE (shim default { mica: false }) and the
 *     command THROWING: no root class, and the title bar / editor area
 *     compute exactly today's opaque colours;
 *   - the editor area stays opaque in every case (the below-strip paint
 *     keeps the editor background colour, now via the bottom-anchored
 *     gradient).
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

// Computed colours serialize as rgb()/rgba() in both engines; the
// alpha is the fourth component when present (missing ⇒ 1).
function alphaOf(color: string): number {
  const m = color.match(/rgba?\(([^)]+)\)/i)
  if (!m) return 1
  const parts = m[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 4) return 1
  return Number.parseFloat(parts[3])
}

async function computedStyleOf(page: Page, selector: string, prop: 'backgroundColor' | 'backgroundImage'): Promise<string> {
  return page.evaluate(({ sel, property }) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el)[property] : '<missing>'
  }, { sel: selector, property: prop })
}

// Resolve a CSS custom property through a throwaway probe element so
// expectations go through the identical cascade/serialization per engine.
async function resolvedBackgroundVar(page: Page, value: string): Promise<string> {
  return page.evaluate((val) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = val
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).backgroundColor
    probe.remove()
    return computed
  }, value)
}

async function rootHasMica(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('mica-active'))
}

test.describe('window mica title bar (C-38 T-007)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('effect active: root class, transparent title strip, opaque editor paint, theme re-tint', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__mockInvoke.mt_window_effects_state = () => ({ mica: true })
      w.__micaRetints = []
      w.__mockInvoke.mt_window_set_mica_theme = (args: any) => {
        w.__micaRetints.push(args)
        return { mica: true }
      }
    })

    await bootEditor(page)
    await page.waitForFunction(() => document.documentElement.classList.contains('mica-active'))
    expect(await rootHasMica(page)).toBe(true)

    // The title-bar strip opens for the material: fully transparent.
    const stripBg = await computedStyleOf(page, '.title-bar-editor-bg', 'backgroundColor')
    expect(alphaOf(stripBg)).toBe(0)
    const barBg = await computedStyleOf(page, '.title-bar', 'backgroundColor')
    expect(alphaOf(barBg)).toBe(0)

    // Root/body transparent; the container keeps painting the editor
    // colour from below the title bar down (the gradient), so the
    // editor area stays exactly today's opaque colour.
    const bodyBg = await computedStyleOf(page, 'body', 'backgroundColor')
    expect(alphaOf(bodyBg)).toBe(0)
    const editorBg = await resolvedBackgroundVar(page, 'var(--editorBgColor, #ffffff)')
    expect(alphaOf(editorBg)).toBe(1)
    const containerPaint = await computedStyleOf(page, '.editor-container', 'backgroundColor')
    expect(alphaOf(containerPaint)).toBe(0)
    const containerImage = await computedStyleOf(page, '.editor-container', 'backgroundImage')
    expect(containerImage).toContain('linear-gradient')
    expect(containerImage).toContain(editorBg)

    // Boot re-tinted to the hydrated app theme (paper ⇒ light)…
    await page.waitForFunction(() => (window as any).__micaRetints.length >= 1)
    // …and a theme flip to a dark member re-tints with dark:true.
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      if (pinia) pinia.state.value.preferences.theme = 'ink'
    })
    await page.waitForFunction(
      () => (window as any).__micaRetints.some((r: any) => r?.dark === true),
      undefined,
      { timeout: 5_000 }
    )
    const retints = await page.evaluate(() => (window as any).__micaRetints)
    expect(retints[0]).toEqual({ dark: false })
    expect(retints.at(-1)).toEqual({ dark: true })
  })

  test('effect inactive (shim default): no class, today’s opaque title bar and editor area', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__micaStateQueries = 0
      w.__mockInvoke.mt_window_effects_state = () => {
        ;(window as any).__micaStateQueries++
        return { mica: false }
      }
    })

    await bootEditor(page)
    // Wait for the boot state query so the absence of the class is
    // deterministic, not a race with the async install.
    await page.waitForFunction(() => (window as any).__micaStateQueries >= 1)
    expect(await rootHasMica(page)).toBe(false)

    const editorBg = await resolvedBackgroundVar(page, 'var(--editorBgColor, #ffffff)')
    expect(alphaOf(editorBg)).toBe(1)

    const stripBg = await computedStyleOf(page, '.title-bar-editor-bg', 'backgroundColor')
    expect(alphaOf(stripBg)).toBe(1)
    expect(stripBg).toBe(editorBg)

    const containerPaint = await computedStyleOf(page, '.editor-container', 'backgroundColor')
    expect(alphaOf(containerPaint)).toBe(1)
    expect(await computedStyleOf(page, '.editor-container', 'backgroundImage')).toBe('none')

    const bodyBg = await computedStyleOf(page, 'body', 'backgroundColor')
    expect(alphaOf(bodyBg)).toBe(1)
  })

  test('state command throwing: no class, opaque chrome like today', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__micaStateQueries = 0
      w.__mockInvoke.mt_window_effects_state = () => {
        ;(window as any).__micaStateQueries++
        throw new Error('window effects unavailable')
      }
    })

    await bootEditor(page)
    await page.waitForFunction(() => (window as any).__micaStateQueries >= 1)
    expect(await rootHasMica(page)).toBe(false)

    const stripBg = await computedStyleOf(page, '.title-bar-editor-bg', 'backgroundColor')
    expect(alphaOf(stripBg)).toBe(1)
    const containerPaint = await computedStyleOf(page, '.editor-container', 'backgroundColor')
    expect(alphaOf(containerPaint)).toBe(1)
    expect(await computedStyleOf(page, '.editor-container', 'backgroundImage')).toBe('none')
  })
})
