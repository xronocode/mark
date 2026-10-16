// FILE: tests/e2e/fixtures/tauri-csp.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Serve the e2e preview under the packaged app's real Content-Security-Policy (read from src-tauri/tauri.conf.json) and record CSP violations, so specs catch renderers that only work without CSP.
//   SCOPE: TAURI_CSP, applyTauriCsp, readCspViolations.
//   DEPENDS: src-tauri/tauri.conf.json (app.security.csp).
//   LINKS: C-51 T-008 (live smoke found vega-lite broken under the Tauri CSP); tests/e2e/rich-markdown-coverage.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CONF - path to src-tauri/tauri.conf.json.
//   TAURI_CSP - the CSP string the packaged app ships.
//   applyTauriCsp - route every HTML response through with that CSP header + install a violation recorder.
//   readCspViolations - the violations recorded in the page so far.
// END_MODULE_MAP

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const CONF = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src-tauri/tauri.conf.json')

export const TAURI_CSP: string = JSON.parse(readFileSync(CONF, 'utf8')).app.security.csp

export async function applyTauriCsp (page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as any).__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as any).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  await page.route('**/*', async (route) => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    if ((headers['content-type'] || '').includes('text/html')) {
      headers['content-security-policy'] = TAURI_CSP
    }
    await route.fulfill({ response, headers })
  })
}

export async function readCspViolations (page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__cspViolations || [])
}
