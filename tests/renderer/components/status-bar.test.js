// FILE: tests/renderer/components/status-bar.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-40 T-004 status bar — canvas layout slot, whole-document counts, selection-aware replacement counts, document type, and the statusBarVisibility preference gate.
//   SCOPE: Vue/jsdom component tests with stubbed i18n (EN plural forms), real Pinia stores, and a stubbed document.getSelection.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, editorWithTabs/statusBar.vue.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-55; .grace/changes/archive/C-40 T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   host - the .editor-with-tabs element StatusBar mounts into (selection scoping).
//   i18n - stub vue-i18n instance carrying the statusBar.* keys (EN one/other plurals).
//   mountBar - mount StatusBar attached to a .editor-with-tabs host (selection scoping).
//   setCurrentDoc - seed the editor store's currentFile (markdown + wordCount).
//   stubSelection - replace document.getSelection with a fake anchored inside/outside the host.
//   StatusBar - the component under test (loaded per test).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-004 initial pins: preference
//   gate (hidden by the macOS default, shown when enabled), document
//   counts + reading time + document type, EN plural forms, selection
//   counts replacing document counts (inside/outside/collapsed
//   selections, tab-switch clearing).
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

// Mock the modules that read window.* at import time (setup.ts installs
// the globals only in its global beforeEach).
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      statusBar: {
        title: 'Document statistics',
        documentType: 'Markdown',
        readingTime: '{count} min read',
        lines: { one: '{count} line', other: '{count} lines' },
        words: { one: '{count} word', other: '{count} words' },
        characters: { one: '{count} character', other: '{count} characters' },
        selectedWords: { one: '{count} word selected', other: '{count} words selected' },
        selectedCharacters: { one: '{count} character selected', other: '{count} characters selected' }
      }
    }
  }
})

let StatusBar = null
let host = null

const setCurrentDoc = (editorStore, { markdown, wordCount }) => {
  editorStore.currentFile = {
    id: 'tab-1',
    filename: 'notes.md',
    pathname: '/tmp/notes.md',
    markdown,
    wordCount,
    isSaved: true,
    history: { stack: [], index: -1 },
    cursor: null,
    searchMatches: { index: -1, matches: [], value: '' },
    notifications: []
  }
  editorStore.tabs = [editorStore.currentFile]
}

const mountBar = async () => {
  const wrapper = mount(StatusBar, {
    attachTo: host,
    global: { plugins: [i18n] }
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

const stubSelection = (text, anchorNode, { collapsed = false } = {}) => {
  vi.spyOn(document, 'getSelection').mockReturnValue({
    rangeCount: 1,
    isCollapsed: collapsed,
    anchorNode,
    toString: () => text
  })
}

describe('statusBar (C-40 T-004)', () => {
  let editorStore
  let preferencesStore

  beforeEach(async () => {
    setupTestPinia()
    const editorMod = await import('@/store/editor')
    editorStore = editorMod.useEditorStore()
    const prefMod = await import('@/store/preferences')
    preferencesStore = prefMod.usePreferencesStore()

    StatusBar = (await import('@/components/editorWithTabs/statusBar.vue')).default

    host = document.createElement('div')
    host.className = 'editor-with-tabs'
    document.body.appendChild(host)
  })

  afterEach(() => {
    document.getSelection?.mockRestore?.()
    if (host && host.parentNode) host.parentNode.removeChild(host)
    host = null
  })

  const countsText = (wrapper) =>
    wrapper.findAll('.status-bar-count').map((n) => n.text())

  it('renders the canvas strip: counts left, document type right', async () => {
    preferencesStore.statusBarVisibility = true
    setCurrentDoc(editorStore, {
      // 21 lines, 58 words, 312 characters — the canvas example
      markdown: Array.from({ length: 21 }, (_, i) => `line ${i + 1}`).join('\n'),
      wordCount: { word: 58, character: 312, paragraph: 5, all: 400 }
    })
    const wrapper = await mountBar()

    expect(wrapper.find('.status-bar').attributes('aria-label')).toBe('Document statistics')
    expect(countsText(wrapper)).toEqual([
      '21 lines', '58 words', '312 characters', '1 min read'
    ])
    expect(wrapper.find('.status-bar-type').text()).toBe('Markdown')
  })

  it('is hidden while the statusBarVisibility preference is off (macOS default)', async () => {
    // setup.ts installs window.electron.process.platform = 'darwin', so a
    // fresh store starts with the status bar off.
    expect(preferencesStore.statusBarVisibility).toBe(false)
    setCurrentDoc(editorStore, { markdown: 'a\nb', wordCount: { word: 2, character: 2 } })
    const wrapper = await mountBar()
    expect(wrapper.find('.status-bar').isVisible()).toBe(false)

    // Flipping the preference (View › Status Bar / Settings) shows it.
    preferencesStore.statusBarVisibility = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.status-bar').isVisible()).toBe(true)
  })

  it('uses EN plural forms for singular counts', async () => {
    preferencesStore.statusBarVisibility = true
    setCurrentDoc(editorStore, {
      markdown: 'a',
      wordCount: { word: 1, character: 1, paragraph: 1, all: 1 }
    })
    const wrapper = await mountBar()
    expect(countsText(wrapper)).toEqual([
      '1 line', '1 word', '1 character', '1 min read'
    ])
  })

  it('reading time is words/230 rounded up, minimum 1 (shared docStats)', async () => {
    preferencesStore.statusBarVisibility = true
    setCurrentDoc(editorStore, {
      markdown: 'x',
      wordCount: { word: 231, character: 231, paragraph: 1, all: 231 }
    })
    const wrapper = await mountBar()
    expect(countsText(wrapper)[3]).toBe('2 min read')
  })

  describe('selection-aware counts', () => {
    it('replaces the document counts while text is selected in the editor area', async () => {
      preferencesStore.statusBarVisibility = true
      setCurrentDoc(editorStore, {
        markdown: 'alpha beta gamma delta',
        wordCount: { word: 4, character: 22, paragraph: 1, all: 22 }
      })
      const wrapper = await mountBar()

      const anchor = document.createElement('p')
      host.appendChild(anchor)
      stubSelection('beta gamma', anchor)
      document.dispatchEvent(new Event('selectionchange'))
      await wrapper.vm.$nextTick()

      expect(countsText(wrapper)).toEqual([
        '2 words selected', '9 characters selected'
      ])
      // The document-type chip stays on the right in both modes.
      expect(wrapper.find('.status-bar-type').text()).toBe('Markdown')
    })

    it('ignores collapsed selections and selections outside the editor area', async () => {
      preferencesStore.statusBarVisibility = true
      setCurrentDoc(editorStore, {
        markdown: 'alpha beta',
        wordCount: { word: 2, character: 10, paragraph: 1, all: 10 }
      })
      const wrapper = await mountBar()

      const inside = document.createElement('p')
      host.appendChild(inside)

      // Collapsed caret inside the editor → document counts.
      stubSelection('', inside, { collapsed: true })
      document.dispatchEvent(new Event('selectionchange'))
      await wrapper.vm.$nextTick()
      expect(countsText(wrapper)).toEqual([
        '1 line', '2 words', '10 characters', '1 min read'
      ])

      // Selection anchored outside .editor-with-tabs (e.g. a dialog).
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      stubSelection('some selected text', outside)
      document.dispatchEvent(new Event('selectionchange'))
      await wrapper.vm.$nextTick()
      expect(countsText(wrapper)).toEqual([
        '1 line', '2 words', '10 characters', '1 min read'
      ])
      outside.parentNode.removeChild(outside)
    })

    it('clears a stale selection when the active tab changes', async () => {
      preferencesStore.statusBarVisibility = true
      setCurrentDoc(editorStore, {
        markdown: 'alpha beta gamma',
        wordCount: { word: 3, character: 16, paragraph: 1, all: 16 }
      })
      const wrapper = await mountBar()

      const anchor = document.createElement('p')
      host.appendChild(anchor)
      stubSelection('beta gamma', anchor)
      document.dispatchEvent(new Event('selectionchange'))
      await wrapper.vm.$nextTick()
      expect(countsText(wrapper)[0]).toBe('2 words selected')

      editorStore.currentFile = {
        ...editorStore.currentFile,
        id: 'tab-2',
        markdown: 'other doc',
        wordCount: { word: 2, character: 9, paragraph: 1, all: 9 }
      }
      await wrapper.vm.$nextTick()
      expect(countsText(wrapper)).toEqual([
        '1 line', '2 words', '9 characters', '1 min read'
      ])
    })
  })
})
