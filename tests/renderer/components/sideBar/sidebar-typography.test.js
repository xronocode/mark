// FILE: tests/renderer/components/sideBar/sidebar-typography.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-013 typography pins — no leading file-type icon on any sidebar file row (tree, Recent, Pinned, Opened files), folder rows and the root folder switcher semibold (600), every file row explicitly regular weight (the current file marked by the highlight/accent colour, never bold), names on the shared --sideBarRowInset text grid.
//   SCOPE: source-level pins over the five sidebar SFCs (jsdom does not apply SFC styles, so weights are pinned on the source like toc.test.js pins retirement) plus full mounts asserting the icon absence in the rendered DOM; the filled pin descriptor is pinned in chrome-icons.test.js and the computed weights in tests/e2e/sidebar-tree-redesign.spec.ts.
//   DEPENDS: node fs/path, Vitest, @vue/test-utils, tests/renderer/pinia, vue-i18n.
//   LINKS: .grace/changes/active/C-51 T-013; .grace/verification/runtime.xml V-M-011 scenario-63.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root for the source pins.
//   readSource - reads a renderer source file from the repo root.
//   BOLD_WEIGHT - matches any font-weight a file row must not carry (500+ / bold).
//   FILE_ROW_SOURCES - the three file-row SFCs (tree, Recent/Pinned, Opened files).
//   FILE_SECTIONS - fileSections.vue source (Recent/Pinned styles).
//   TREE - tree.vue source (Opened files + root switcher).
//   TREE_FILE - treeFile.vue source.
//   TREE_FOLDER - treeFolder.vue source.
//   TREE_OPENED_TAB - treeOpenedTab.vue source.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-51 T-013: initial tests.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('../../contextMenu/sideBar', () => ({
  showContextMenu: vi.fn()
}))

const ROOT = resolve(__dirname, '..', '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf8')

// Any weight a file row must never carry (folders/switcher use 600).
const BOLD_WEIGHT = /font-weight:\s*(?:[5-9]\d{2}|[1-9]\d{3,}|bold|bolder)/

const TREE_FILE = 'src/renderer/src/components/sideBar/treeFile.vue'
const FILE_SECTIONS = 'src/renderer/src/components/sideBar/fileSections.vue'
const TREE_OPENED_TAB = 'src/renderer/src/components/sideBar/treeOpenedTab.vue'
const TREE_FOLDER = 'src/renderer/src/components/sideBar/treeFolder.vue'
const TREE = 'src/renderer/src/components/sideBar/tree.vue'
const FILE_ROW_SOURCES = [TREE_FILE, FILE_SECTIONS, TREE_OPENED_TAB]

describe('sidebar typography (C-51 T-013) — no file icons', () => {
  it('tree, Recent/Pinned and Opened-files rows render no file-type icon', () => {
    for (const f of FILE_ROW_SOURCES) {
      expect(readSource(f), `${f}: template must not render <file-icon>`).not.toContain('<file-icon')
    }
  })

  it('the icon component is no longer wired into the file-row components', () => {
    for (const f of [TREE_FILE, FILE_SECTIONS]) {
      expect(readSource(f), `${f}: must not import icon.vue`).not.toContain("from './icon.vue'")
    }
  })
})

describe('sidebar typography (C-51 T-013) — one row weight', () => {
  it('no file row carries a bold weight in any section (the current file included)', () => {
    for (const f of FILE_ROW_SOURCES) {
      expect(BOLD_WEIGHT.test(readSource(f)), `${f}: file rows must stay regular`).toBe(false)
    }
  })

  it('every file-row component pins the shared regular weight explicitly', () => {
    for (const f of FILE_ROW_SOURCES) {
      expect(readSource(f), `${f}: font-weight: 400 expected`).toMatch(/font-weight:\s*400/)
    }
  })

  it('folder rows are semibold', () => {
    expect(readSource(TREE_FOLDER)).toMatch(/font-weight:\s*600/)
  })

  it('the root folder switcher name is semibold and tree.vue owns no other weight rule', () => {
    const src = readSource(TREE)
    expect(src).toMatch(/\.title\.folder-switcher\s*>\s*span\s*\{[^}]*font-weight:\s*600/)
    // the dead .bold rule (nothing ever applied it) is gone
    expect(src).not.toMatch(/\.bold\s*\{/)
  })

  it('folders keep their folder glyph and disclosure chevron', () => {
    const src = readSource(TREE_FOLDER)
    expect(src).toContain("isCollapsed ? 'folder' : 'folder-open'")
    expect(src).toContain('name="chevron-right"')
  })
})

describe('sidebar typography (C-51 T-013) — shared text grid', () => {
  it('file-row names start at --sideBarRowInset + the folder glyph slot (aligned with folder names)', () => {
    for (const f of FILE_ROW_SOURCES) {
      expect(readSource(f), `${f}: shared text-grid padding expected`).toContain(
        'calc(var(--sideBarRowInset, 12px) + 20px)'
      )
    }
    expect(readSource(TREE_FOLDER)).toMatch(/padding-left:\s*var\(--sideBarRowInset, 12px\)/)
  })
})

describe('sidebar typography (C-51 T-013) — rendered rows', () => {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/tmp/test.md',
      filename: 'test.md'
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  it('a tree file row renders the name first — no icon element before it, not even a svg', async () => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    const wrapper = mount(TreeFile, {
      props: {
        file: {
          id: 'file-1',
          name: 'readme.md',
          pathname: '/tmp/readme.md',
          isMarkdown: true
        },
        depth: 0
      },
      global: { plugins: [pinia, i18n] }
    })
    // the component's root element is the row itself
    const row = wrapper.element
    expect(row.classList.contains('side-bar-file')).toBe(true)
    expect(wrapper.find('.file-icon').exists()).toBe(false)
    // unpinned row: no svg at all (the only svg a file row may carry is
    // the trailing pin mark)
    expect(row.querySelector('svg')).toBeNull()
    const first = row.firstElementChild
    expect(first.tagName).toBe('SPAN')
    expect(first.textContent).toBe('readme.md')
  })

  it('the current file row keeps its highlight classes but no bold class', async () => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    const wrapper = mount(TreeFile, {
      props: {
        file: {
          id: 'file-1',
          name: 'test.md',
          pathname: '/tmp/test.md',
          isMarkdown: true
        },
        depth: 0
      },
      global: { plugins: [pinia, i18n] }
    })
    const row = wrapper.element
    expect(row.classList.contains('current')).toBe(true)
    for (const cls of Array.from(row.classList)) {
      expect(cls).not.toMatch(/bold|semibold|medium/i)
    }
  })
})
