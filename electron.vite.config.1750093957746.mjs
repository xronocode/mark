// electron.vite.config.mjs
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import renderer from "vite-plugin-electron-renderer";
var __electron_vite_injected_dirname = "C:\\Users\\kaixi\\Documents\\marktextv2";
var electron_vite_config_default = defineConfig({
  main: {
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
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
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
      renderer({
        nodeIntegration: true
      })
    ],
    optimizeDeps: {
      include: ["prismjs/components/*.js"]
    }
  }
});
export {
  electron_vite_config_default as default
};
