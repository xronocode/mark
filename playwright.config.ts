import { defineConfig } from '@playwright/test'

/**
 * Playwright config for renderer-only E2E (Phase 6, Plan C).
 *
 * `tauri-driver` is unsupported on macOS in Tauri 2 (no WebDriver
 * bridge for WKWebView). Until F-E2E-LINUX-CI lands a Linux runner
 * that drives `tauri dev` via tauri-driver, we exercise the built
 * renderer against `vite preview` with `window.__TAURI_INTERNALS__`
 * faked client-side via `tests/e2e/fixtures/tauri-shim.ts`.
 *
 * Catches:    Vue mount, Pinia store wiring, click handlers, theme
 *             application, hash-router transitions, muya markdown
 *             rendering.
 * Does NOT:   Real Tauri IPC, cross-window broadcast, native menus,
 *             OS dialogs, save/close prompts on quit.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/fixtures/**'],
  timeout: 30_000,
  fullyParallel: false, // single-window assumption
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Renderer is heavy — give the page some breathing room.
    actionTimeout: 10_000,
    navigationTimeout: 20_000
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
})
