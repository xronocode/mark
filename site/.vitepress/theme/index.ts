// FILE: site/.vitepress/theme/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The Mark docs theme — the VitePress default theme wearing the
//            site's paper/ink/marker brand (C-64 R-10): imports the shared
//            brand tokens plus the VitePress variable mapping, and mirrors
//            the appearance toggle onto data-theme so brand.css follows it.
//   SCOPE: extend DefaultTheme (Layout, enhanceApp), the isDark ->
//          data-theme watcher, CSS imports. No visual overrides here —
//            those live in custom.css on VitePress's own hooks.
//   DEPENDS: vitepress (DefaultTheme, useData), vue (h, watchEffect),
//            ../../shared/brand.css, ./custom.css
//   LINKS: .grace/changes/active/C-64 R-2/R-10; site/shared/brand.css;
//          site/shared/theme-init.js (the first-paint script this keeps in
//          sync after toggles); .grace/graph/features.xml M-053
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - the theme object VitePress loads ({ extends, Layout })
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-001: first version — replaces
//                 the bare default theme; brand tokens + marker accents.]
// END_CHANGE_SUMMARY

import { defineComponent, h, watchEffect } from 'vue'
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import '../../shared/brand.css'
import './custom.css'

// The no-flash script (inlined in the docs head from theme-init.js) sets
// BOTH html.dark and data-theme before first paint; VitePress's appearance
// toggle only flips the class, so this watcher keeps data-theme in step
// for every later toggle. Guarded for the SSR build pass.
const MarkThemeLayout = defineComponent({
  name: 'MarkThemeLayout',
  setup () {
    const { isDark } = useData()
    watchEffect(() => {
      if (typeof document === 'undefined') return
      document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
    })
    return () => h(DefaultTheme.Layout)
  }
})

export default {
  extends: DefaultTheme,
  Layout: MarkThemeLayout,
  enhanceApp (/* { app, router, siteData } */) {
    // Nothing yet — appearance mirroring lives in MarkThemeLayout.
  }
}
