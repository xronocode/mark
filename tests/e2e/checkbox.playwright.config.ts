// FILE: tests/e2e/checkbox.playwright.config.ts
// START_MODULE_CONTRACT
//   PURPOSE: Serve the exact checkbox safety candidate on isolated port 4187 in Chromium and WebKit.
//   SCOPE: Checkbox, document-lock and unsaved-close renderer regression suites only; no foreign preview reuse.
//   DEPENDS: Base Playwright config and existing installed browser/dependency versions.
//   LINKS: M-012
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import base from '../../playwright.config'

export default defineConfig({
  ...base,
  testDir: import.meta.dirname,
  testMatch: ['checkbox-dirty.spec.ts', 'lock-document.spec.ts', 'unsaved-close-actions.spec.ts'],
  workers: 2,
  use: { ...base.use, baseURL: 'http://localhost:4187' },
  webServer: {
    command: 'npx --no-install vite preview --port 4187 --strictPort',
    cwd: resolve(import.meta.dirname, '../..'),
    port: 4187, timeout: 120_000, reuseExistingServer: false
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit-checkbox', use: { browserName: 'webkit' } }
  ]
})
