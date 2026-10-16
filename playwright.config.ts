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
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: ['**/fixtures/**', '**/perf/**'] },
    // C-39 T-002: table rendering/interaction specs also gate in WebKit —
    // the engine WKWebView ships (pointer capture, table-layout: fixed and
    // column measuring are engine-sensitive). Covers table-layout.spec.ts
    // (T-001) and table-column-resize.spec.ts (T-002).
    { name: 'webkit-tables', use: { browserName: 'webkit' }, testMatch: 'table-*.spec.ts' },
    // C-30: perf gates run in WebKit, the engine WKWebView ships; opt-in via `npm run test:e2e:perf`.
    { name: 'webkit-perf', use: { browserName: 'webkit' }, testMatch: 'perf/**/*.spec.ts' },
    // C-38 T-003: the Settings shell also gates in WebKit — WKWebView is
    // the engine the macOS build ships; scoped to the settings specs so
    // the rest of the chromium-only suite is unchanged.
    { name: 'webkit-settings', use: { browserName: 'webkit' }, testMatch: 'settings-shell.spec.ts' },
    // C-40 T-002: the trimmed title bar + document info popover also gate
    // in WebKit (same rationale as webkit-settings).
    { name: 'webkit-titlebar', use: { browserName: 'webkit' }, testMatch: 'titlebar-*.spec.ts' },
    // C-40 T-003: the outline rail also gates in WebKit (the absolutely
    // positioned rail + ResizeObserver geometry are engine-sensitive).
    { name: 'webkit-outline', use: { browserName: 'webkit' }, testMatch: 'outline-rail.spec.ts' },
    // C-40 T-004: status bar selection counts and the document lock
    // (contenteditable + DOM selection) also gate in WebKit.
    { name: 'webkit-statusbar', use: { browserName: 'webkit' }, testMatch: /(status-bar|lock-document)\.spec\.ts/ },
    // C-40 T-005: native View-menu checkmark re-sync also gates in WebKit
    // (WKWebView is the engine the macOS build ships, where the native
    // menu lives).
    { name: 'webkit-menu-checks', use: { browserName: 'webkit' }, testMatch: 'view-menu-checks.spec.ts' },
    // C-38 T-006: the native chrome pass (system font stack, AccentColor /
    // color-mix resolution, drawn icon set) also gates in WebKit — the
    // engine the macOS build ships, where AccentColor + color-mix
    // serialization differs from Chromium.
    { name: 'webkit-chrome', use: { browserName: 'webkit' }, testMatch: 'chrome-native-theme.spec.ts' },
    // C-38 T-007: the Windows Mica title-bar strip (computed transparency
    // under .mica-active vs today's opaque colours) also gates in WebKit.
    { name: 'webkit-mica', use: { browserName: 'webkit' }, testMatch: 'window-mica.spec.ts' },
    // C-51 T-003/T-004: the Mermaid theme matrix (22 diagram types × light
    // and dark, computed colour/font assertions, theme-switch re-render)
    // also gates in WebKit — the engine WKWebView ships and the one the
    // accepted lab renders were verified in.
    { name: 'webkit-mermaid-theme', use: { browserName: 'webkit' }, testMatch: 'mermaid-theme.spec.ts' },
    // C-51 T-001/T-002: the redesigned sidebar tree (Markdown-only filter,
    // guide lines, pill, folder switcher) + Recent/Pinned sections also
    // gate in WebKit — the engine the macOS build ships (HTML5 drag
    // reorder and CSS nesting are engine-sensitive).
    { name: 'webkit-tree', use: { browserName: 'webkit' }, testMatch: 'sidebar-tree-redesign.spec.ts' },
    // C-51 T-009: the rich-Markdown honesty guard (every feature the agent
    // prompt names, rendered) also gates in WebKit — the engine WKWebView
    // ships; scoped to the coverage spec so the rest of the suite is
    // unchanged.
    { name: 'webkit-rich', use: { browserName: 'webkit' }, testMatch: 'rich-markdown-coverage.spec.ts' },
    // C-51 T-005: the non-Mermaid content theming (Vega-Lite config,
    // flowchart.js and js-sequence colours, KaTeX text colour, theme-switch
    // re-render) also gates in WebKit — the engine WKWebView ships.
    { name: 'webkit-content-theme', use: { browserName: 'webkit' }, testMatch: 'content-theme.spec.ts' },
    // C-51 T-006: the always-visible expand button + the block viewer also
    // gate in WebKit — the engine WKWebView ships (contenteditable focus
    // and the reserved-strip absolute positioning are engine-sensitive).
    { name: 'webkit-block-viewer', use: { browserName: 'webkit' }, testMatch: 'block-viewer.spec.ts' }
  ]
})
