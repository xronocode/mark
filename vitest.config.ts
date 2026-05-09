/**
 * Vitest configuration for reborn-mark renderer tests.
 *
 * Strategy:
 *   - Inherit Vite's resolve aliases so test imports resolve identically
 *     to dev/build (no parallel alias map to drift). We achieve this by
 *     re-declaring the alias map (the same one in vite.config.js) instead
 *     of mergeConfig — vite.config.js has Tauri/server-port specifics we
 *     don't want in the test runner, and importing the config function
 *     would pull those in.
 *   - jsdom environment for DOM access (Vue + Pinia + Element Plus all
 *     touch document at module load time).
 *   - Globals enabled so test files can use describe/it/expect/vi without
 *     imports — keeps the Phase-4 boilerplate minimal.
 *   - setupFiles installs Tauri API mocks + window.* shim globals before
 *     each test file loads.
 */

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [vue(), svgLoader()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      common: resolve(__dirname, 'src/common'),
      muya: resolve(__dirname, 'src/muya'),
      main_renderer: resolve(__dirname, 'src/_main_renderer_REMOVED_use_ipc'),
      path: 'path-browserify',
      fs: resolve(__dirname, 'src/renderer/src/util/fs-shim.js'),
      'electron-log/renderer': resolve(__dirname, 'src/renderer/src/_shims/electron-log.js'),
      'electron-log': resolve(__dirname, 'src/renderer/src/_shims/electron-log.js'),
      '@hfelix/electron-localshortcut/src/atom-keymap': resolve(
        __dirname,
        'src/renderer/src/_shims/hfelix-localshortcut.js'
      ),
      '@hfelix/electron-localshortcut': resolve(
        __dirname,
        'src/renderer/src/_shims/hfelix-localshortcut.js'
      )
    },
    extensions: ['.mjs', '.js', '.ts', '.json', '.vue']
  },
  define: {
    'process.platform': JSON.stringify(process.platform),
    'process.env.NODE_ENV': JSON.stringify('test')
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/renderer/setup.ts'],
    include: [
      'src/renderer/**/*.{test,spec}.{js,ts}',
      'tests/renderer/**/*.{test,spec}.{js,ts}'
    ],
    // Existing M-013a contract stubs in src/renderer/src/ipc/**/*.test.ts
    // are TYPE-ONLY assertions (no describe/it blocks) consumed by
    // `npm run typecheck:ipc`, not by vitest. Exclude them here so vitest
    // doesn't fail on "No test suite found". Phase-4 may relocate them
    // but Phase-3 must not modify production code.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/renderer/src/ipc/contract/contract.test.ts',
      'src/renderer/src/ipc/runtime/runtime.test.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/renderer/src/**/*.{js,ts,vue}'],
      exclude: [
        'src/renderer/src/_shims/**',
        'src/renderer/dist/**',
        'tests/**',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}'
      ]
    }
  }
})
