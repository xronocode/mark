import { resolve, dirname } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import postcssPresetEnv from 'postcss-preset-env'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Variant-(a) port from mark-electron@v1.2.3 electron.vite.config.js
// renderer block. Tauri 2 conventions: dev server on :1420, strict port,
// build output to src/renderer/dist (matches frontendDist in tauri.conf.json).
//
// Differences vs Electron config:
// - root pinned to src/renderer (where index.html lives)
// - vite-plugin-electron-renderer dropped (was already removed in v1.2.1)
// - process.platform / process.env.NODE_ENV define kept: third-party libs
//   (@hfelix/electron-localshortcut utils.js dead-code, etc.) still
//   reference them at module-load time. Build-time substitution avoids
//   needing a runtime process global in WKWebView.
// - manualChunks copied verbatim — same vendor split that v1.2.x used.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'src/renderer/public'),
  assetsInclude: ['**/*.md'],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      common: resolve(__dirname, 'src/common'),
      muya: resolve(__dirname, 'src/muya'),
      // main_renderer alias preserved as historical no-op — original
      // pointed at src/main, which Tauri does not have. Kept so any
      // residual import that escapes the M-013 IPC bridge fails loud
      // at build time rather than silently picking up stale paths.
      main_renderer: resolve(__dirname, 'src/_main_renderer_REMOVED_use_ipc'),
      // Browser polyfills for Node-builtin imports surviving in vendored
      // libs (muya/lib/utils path, sequence-diagram-snap fs/path stubs).
      path: 'path-browserify',
      fs: resolve(__dirname, 'src/renderer/src/util/fs-shim.js')
    },
    extensions: ['.mjs', '.js', '.json', '.vue']
  },
  define: {
    'process.platform': JSON.stringify(process.platform),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  },
  plugins: [
    vue(),
    svgLoader()
  ],
  server: {
    port: 1420,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'src/renderer/dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      // Multi-entry: main app + perf harness. Both entries live under
      // src/renderer (the configured Vite root). vite build emits
      // src/renderer/dist/{index.html, bench/index.html}; Tauri's
      // frontendDist points at src/renderer/dist so both ship in the
      // bundle.
      input: {
        // Phase-B1 step-2.5b: main entry temporarily disabled. The v1.2.3
        // renderer transitively imports several modules removed in the
        // Tauri port (electron-log, @hfelix/electron-localshortcut,
        // src/main/preferences/schema.json). M-013b in Phase-B2 will
        // emulate or re-shim these; until then, attempting to bundle
        // main fails. Bench is independent and builds clean.
        // main: resolve(__dirname, 'src/renderer/index.html'),
        bench: resolve(__dirname, 'src/renderer/bench/index.html')
      },
      // Temporarily external during Phase-B1: the main entry transitively
      // imports electron-log/renderer + similar Electron-bridge modules
      // that are removed in the Tauri port and will be re-shimmed by
      // M-013b in Phase-B2. The bench entry does NOT touch them, so
      // externalizing avoids blocking step-2.5b on a dependency that
      // belongs to a later phase. Will be removed once M-013b ships.
      external: [
        /^electron-log(\/.*)?$/,
        /^electron-store(\/.*)?$/,
        /^electron-updater(\/.*)?$/,
        /^@electron\/.*$/,
        /^@hfelix\/electron-localshortcut(\/.*)?$/,
        /^electron$/
      ],
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/.test(id)) {
            return 'vendor-vue'
          }
          if (/[\\/]node_modules[\\/](element-plus|@element-plus)[\\/]/.test(id)) {
            return 'vendor-element-plus'
          }
          if (/[\\/]node_modules[\\/]codemirror[\\/]/.test(id)) {
            return 'vendor-codemirror'
          }
          if (/[\\/]node_modules[\\/]katex[\\/]/.test(id)) {
            return 'vendor-katex'
          }
          // prismjs: kept in entry bundle — language plugins side-effect
          // onto Prism core at module top-level, splitting breaks load order.
          if (/[\\/]node_modules[\\/](turndown|marked|markdown-it|dompurify)[\\/]/.test(id)) {
            return 'vendor-markdown'
          }
          if (/[\\/]node_modules[\\/](vega|vega-lite|vega-embed|d3-[a-z-]+|d3)[\\/]/.test(id)) {
            return 'vendor-vega'
          }
          if (/[\\/]node_modules[\\/]cytoscape/.test(id)) {
            return 'vendor-cytoscape'
          }
          return undefined
        }
      }
    }
  },
  css: {
    postcss: {
      plugins: [
        postcssPresetEnv({
          stage: 0,
          features: { 'nesting-rules': true }
        })
      ]
    }
  }
})
