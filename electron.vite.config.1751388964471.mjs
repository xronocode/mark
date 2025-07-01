// electron.vite.config.mjs
import path, { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import renderer from "vite-plugin-electron-renderer";
import svgLoader from "vite-svg-loader";
import postcssPresetEnv from "postcss-preset-env";
var __electron_vite_injected_dirname = "C:\\Users\\kaixi\\Documents\\marktext";
var electron_vite_config_default = defineConfig({
  main: {
    define: {
      __static: JSON.stringify(
        path.join(__electron_vite_injected_dirname, "static").replace(/\\/g, "\\\\")
        // escape backslashes on Windows
      )
    },
    // --> Bundled as CommonJS
    // externalizeDepsPlugin() basically externises all the dependencies from being bundled during build - treating them as runtime dependencies
    // electron-vite still builds the main and preload processes into commonJS
    // hence, we need to "exclude" externalising ESonly modules so that they can be converted to commonJS and can be require()
    plugins: [
      externalizeDepsPlugin({
        exclude: ["electron-store"]
      })
    ],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        common: resolve(__electron_vite_injected_dirname, "src/common"),
        muya: resolve(__electron_vite_injected_dirname, "src/muya"),
        main_renderer: resolve(__electron_vite_injected_dirname, "src/main")
      },
      extensions: [".mjs", ".js", ".json"]
    }
  },
  preload: {
    // --> Bundled as CommonJS
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        common: resolve(__electron_vite_injected_dirname, "src/common"),
        muya: resolve(__electron_vite_injected_dirname, "src/muya"),
        main_renderer: resolve(__electron_vite_injected_dirname, "src/main")
      },
      extensions: [".mjs", ".js", ".json"]
    }
  },
  renderer: {
    // --> Bundled as ES Modules
    assetsInclude: ["**/*.md"],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        common: resolve(__electron_vite_injected_dirname, "src/common"),
        muya: resolve(__electron_vite_injected_dirname, "src/muya"),
        main_renderer: resolve(__electron_vite_injected_dirname, "src/main")
      },
      extensions: [".mjs", ".js", ".json", ".vue"]
    },
    plugins: [
      vue(),
      svgLoader(),
      renderer({
        nodeIntegration: true
      })
    ],
    css: {
      postcss: {
        plugins: [
          postcssPresetEnv({
            stage: 0,
            features: { "nesting-rules": true }
          })
        ]
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
