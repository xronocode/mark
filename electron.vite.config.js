import { resolve, dirname } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import renderer from 'vite-plugin-electron-renderer'
import svgLoader from 'vite-svg-loader'
import postcssPresetEnv from 'postcss-preset-env'
import packageJson from './package.json' with { type: 'json' }
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  main: {
    // --> Bundled as CommonJS
    // externalizeDepsPlugin() basically externises all the dependencies from being bundled during build - treating them as runtime dependencies
    // electron-vite still builds the main and preload processes into commonJS
    // hence, we need to "exclude" (in order to NOT externalise) ESonly modules so that they can be converted to commonJS and can be required() afterwards correctly
    build: {
      externalizeDeps: {
        exclude: ['electron-store']
      }
    },
    define: {
      MARKTEXT_VERSION: JSON.stringify(packageJson.version),
      MARKTEXT_VERSION_STRING: JSON.stringify(`v${packageJson.version}`)
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        muya: resolve(__dirname, 'src/muya'),
        main_renderer: resolve(__dirname, 'src/main')
      },
      extensions: ['.mjs', '.js', '.json']
    }
  },
  preload: {
    // --> Bundled as CommonJS
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        muya: resolve(__dirname, 'src/muya'),
        main_renderer: resolve(__dirname, 'src/main')
      },
      extensions: ['.mjs', '.js', '.json']
    }
  },
  renderer: {
    // --> Bundled as ES Modules
    assetsInclude: ['**/*.md'],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        muya: resolve(__dirname, 'src/muya'),
        main_renderer: resolve(__dirname, 'src/main')
      },
      extensions: ['.mjs', '.js', '.json', '.vue']
    },
    plugins: [
      vue(),
      svgLoader(),
      renderer({
        nodeIntegration: true
      })
    ],
    build: {
      // Raise warning ceiling slightly — we still want to know about
      // anything new that crosses ~1MB, but don't drown the build log
      // in warnings about diagrams (mermaid sub-renderers, etc) we know
      // about and can't reasonably split further.
      chunkSizeWarningLimit: 1024,
      rollupOptions: {
        output: {
          // Manual chunks split heavyweight third-party code out of the
          // main entry bundle. Pre-fix the `index` chunk was 7.27 MB and
          // included Vue + Pinia + Element Plus + CodeMirror + KaTeX +
          // Turndown + Prism + every muya dependency in one blob, which
          // tripled cold-start parse time and made HMR sluggish.
          //
          // Splits below match real lazy-load opportunities and let the
          // browser cache vendor bundles across releases. Mermaid is
          // already auto-split by its own dynamic imports — left alone.
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined

            // Vue ecosystem — small, almost always needed at boot.
            if (/[\\/]node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/.test(id)) {
              return 'vendor-vue'
            }
            // Element Plus is ~600KB; loaded eagerly but stable across releases.
            if (/[\\/]node_modules[\\/](element-plus|@element-plus)[\\/]/.test(id)) {
              return 'vendor-element-plus'
            }
            // CodeMirror — large, only needed when entering source-code mode.
            if (/[\\/]node_modules[\\/]codemirror[\\/]/.test(id)) {
              return 'vendor-codemirror'
            }
            // KaTeX — only when document has math blocks.
            if (/[\\/]node_modules[\\/]katex[\\/]/.test(id)) {
              return 'vendor-katex'
            }
            // Prism (syntax highlight bundle) — only on render.
            if (/[\\/]node_modules[\\/]prismjs[\\/]/.test(id)) {
              return 'vendor-prism'
            }
            // Markdown round-trip & sanitizer — used in editor + paste path.
            if (/[\\/]node_modules[\\/](turndown|marked|markdown-it|dompurify)[\\/]/.test(id)) {
              return 'vendor-markdown'
            }
            // Vega/D3 — only when document has Vega blocks.
            if (/[\\/]node_modules[\\/](vega|vega-lite|vega-embed|d3-[a-z-]+|d3)[\\/]/.test(id)) {
              return 'vendor-vega'
            }
            // Cytoscape — graph rendering for diagrams; called from Mermaid
            // path lazily; pin to its own chunk so it doesn't pull into vue.
            if (/[\\/]node_modules[\\/]cytoscape/.test(id)) {
              return 'vendor-cytoscape'
            }
            // Default: leave for the chunker to bin into the entry or
            // its dynamic-import callers.
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
  }
})
