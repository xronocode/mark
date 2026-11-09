import { defineConfig } from '@playwright/test'
import baseline from './playwright.config'

// Owned stabilization preview: never attach to another worktree's server.
export default defineConfig({
  ...baseline,
  workers: 2,
  use: { ...baseline.use, baseURL: 'http://127.0.0.1:4197' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4197 --strictPort',
    url: 'http://127.0.0.1:4197',
    timeout: 120_000,
    reuseExistingServer: false
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit-split', use: { browserName: 'webkit' }, testMatch: /split-.*\.spec\.ts/ }
  ]
})
