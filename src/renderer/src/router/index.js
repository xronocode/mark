import App from '@/pages/app'
import Preference from '@/pages/preference'
import GeneralTab from '@/prefComponents/tabs/general'
import AppearanceTab from '@/prefComponents/tabs/appearance'
import EditorTab from '@/prefComponents/tabs/editor'
import MarkdownTab from '@/prefComponents/tabs/markdown'
import AdvancedTab from '@/prefComponents/tabs/advanced'
import { readLastTab, tabPath, LEGACY_ROUTE_REDIRECTS } from '@/prefComponents/tabsBar/config'

// FILE: src/renderer/src/router/index.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Renderer hash-router — editor window routes to the app, settings window routes to the C-38 5-tab preference shell with every legacy deep link redirected to its new tab.
//   SCOPE: Route table only (no guards); redirect resolution for the settings root and the 6 retired section paths.
//   DEPENDS: pages, prefComponents/tabs/*, prefComponents/tabsBar/config (readLastTab/tabPath/LEGACY_ROUTE_REDIRECTS).
//   LINKS: .grace/changes/active/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - routes(type): createRouter input for the window type — the 5 Settings tab routes, the remembered-tab redirect on '' and the LEGACY_ROUTE_REDIRECTS (legacy 'settings/spelling' lands on the Editor tab).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-003 — 5-tab Settings shell routes (general/appearance/editor/markdown/advanced); /preference root opens the remembered tab; spelling→editor, theme→appearance, image/keybindings/extensions→advanced, language→general redirects keep old links working.
//   - (v1.x: 9-route left-rail table — retired.)
// END_CHANGE_SUMMARY

// START_BLOCK_PARSE_SETTINGS_PAGE
// The settings window boots at '/'; 'settings/spelling' is the legacy
// v1 deep link for the spelling panel, which the Editor tab now owns.
const parseSettingsPage = (type) => {
  let pageUrl = '/preference'
  if (/\/spelling$/.test(type)) {
    pageUrl += '/editor'
  }
  return pageUrl
}
// END_BLOCK_PARSE_SETTINGS_PAGE

// START_BLOCK_PREFERENCE_CHILDREN
// Five tab routes (named after the tab id so tabsBar can track the
// active tab from route.name). The '' redirect opens the remembered
// tab (readLastTab guards storage failures and unknown ids). The six
// retired section paths redirect to the tab that now owns their
// content, so old deep links, menu dispatches and the settings search
// keep landing somewhere correct.
const preferenceChildren = [
  {
    path: '',
    redirect: () => tabPath(readLastTab())
  },
  {
    path: 'general',
    component: GeneralTab,
    name: 'general'
  },
  {
    path: 'appearance',
    component: AppearanceTab,
    name: 'appearance'
  },
  {
    path: 'editor',
    component: EditorTab,
    name: 'editor'
  },
  {
    path: 'markdown',
    component: MarkdownTab,
    name: 'markdown'
  },
  {
    path: 'advanced',
    component: AdvancedTab,
    name: 'advanced'
  },
  ...Object.entries(LEGACY_ROUTE_REDIRECTS).map(([path, redirect]) => ({
    path,
    redirect
  }))
]
// END_BLOCK_PREFERENCE_CHILDREN

const routes = (type) => [
  {
    path: '/',
    redirect: type === 'editor' ? '/editor' : parseSettingsPage(type)
  },
  {
    path: '/editor',
    component: App
  },
  {
    path: '/preference',
    component: Preference,
    children: preferenceChildren
  }
]

export default routes
