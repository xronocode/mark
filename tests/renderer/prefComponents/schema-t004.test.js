/**
 * Schema + search-index tests for C-38 T-004.
 *
 * Covers: the 14 IA §4.1 dropped keys are absent from schema.json, the
 * 4 default drifts are reconciled with the store, mathEnabled /
 * frontmatterProperties / previewModeOnFinderOpen joined the index, and
 * the schema-based search routes every visible row to its new tab —
 * including "math" landing on the Markdown tab.
 */

import schema from '@/_shims/preferences/schema.json'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
// The store imports services/notification → util/index.js, which reads the
// window shim at import time (installed only in the global beforeEach).
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import { getTranslatedSearchContent } from '@/prefComponents/sideBar/config'
import { usePreferencesStore } from '@/store/preferences'

const DROPPED_KEYS = [
  'startUpAction', 'restoreLayoutState', 'defaultDirectoryToOpen',
  'openFilesInNewWindow', 'openFolderInNewWindow', 'fileSortBy',
  'lastOpenedFolder', 'treePathExcludePatterns', 'autoGuessEncoding',
  'autoNormalizeLineEndings', 'trimTrailingNewline', 'preferHeadingStyle',
  'autoSnapWindowWidth', 'watcherUsePolling'
]

const CATEGORY_BY_TAB = {
  general: ['autoSave', 'autoSaveDelay', 'previewModeOnFinderOpen', 'language', 'defaultEncoding', 'endOfLine'],
  appearance: ['titleBarStyle', 'hideScrollbar', 'wordWrapInToc', 'statusBarVisibility', 'editorFontFamily', 'fontSize', 'lineHeight', 'editorLineWidth', 'theme', 'followSystemTheme', 'lightModeTheme', 'darkModeTheme'],
  editor: ['autoPairBracket', 'autoPairQuote', 'autoPairMarkdownSyntax', 'autoCheck', 'hideQuickInsertHint', 'hideLinkPopup', 'textDirection', 'tabSize', 'spellcheckerEnabled', 'spellcheckerNoUnderline', 'spellcheckerLanguage', 'codeFontFamily', 'codeFontSize', 'codeBlockLineNumbers', 'wrapCodeBlocks', 'trimUnnecessaryCodeBlockEmptyLines'],
  markdown: ['preferLooseListItem', 'bulletListMarker', 'orderListDelimiter', 'listIndentation', 'footnote', 'mathEnabled', 'superSubScript', 'frontmatterType', 'frontmatterProperties', 'isHtmlEnabled', 'isGitlabCompatibilityEnabled', 'sequenceTheme'],
  advanced: ['imageInsertAction', 'imagePreferRelativeDirectory', 'imageRelativeDirectoryName', 'customCss']
}

describe('schema.json — C-38 T-004 hygiene', () => {
  it('drops the 14 dead keys (IA §4.1)', () => {
    for (const key of DROPPED_KEYS) {
      expect(schema, key).not.toHaveProperty(key)
    }
  })

  it('adds mathEnabled, frontmatterProperties and previewModeOnFinderOpen with descriptions', () => {
    for (const key of ['mathEnabled', 'frontmatterProperties', 'previewModeOnFinderOpen']) {
      expect(schema).toHaveProperty(key)
      expect(schema[key].description.length).toBeGreaterThan(5)
    }
  })

  it('reconciles the 4 schema↔store default drifts (IA §5 bug 4)', async () => {
    setupTestPinia()
    const store = usePreferencesStore()
    for (const key of ['imageInsertAction', 'imagePreferRelativeDirectory', 'footnote']) {
      expect(schema[key].default).toBe(store.$state[key])
    }
  })

  it('fixes the stale codeFontSize range description', () => {
    expect(schema.codeFontSize.description).toContain('12 ~ 28')
    expect(schema.codeFontSize.description).not.toContain('12 ~ 18')
  })

  it('keeps customCss searchable (was --internal in the old Theme page)', () => {
    expect(schema.customCss.description).not.toContain('--internal')
  })

  it('adds statusBarVisibility as a searchable Appearance row (C-40 T-004)', () => {
    expect(schema.statusBarVisibility.description).not.toContain('--internal')
    expect(schema.statusBarVisibility.type).toBe('boolean')
  })

  it('uses only the 5 tab categories for visible rows', () => {
    const allowed = ['General', 'Appearance', 'Editor', 'Markdown', 'Advanced']
    for (const [key, entry] of Object.entries(schema)) {
      if (String(entry.description).endsWith('--internal')) continue
      const category = entry.description.split('--')[0]
      expect(allowed, `${key} has category ${category}`).toContain(category)
    }
  })
})

describe('settings search routes every visible row to its new tab', () => {
  beforeEach(() => setupTestPinia())

  // t is mocked to key-passthrough; getTranslatedSearchContent reads the
  // REAL schema.json (not the mocked one other test files install).
  const content = getTranslatedSearchContent()

  it('finds mathEnabled and lands on the Markdown tab', () => {
    const math = content.find((c) => c.key === 'mathEnabled')
    expect(math).toBeDefined()
    expect(math.routeCategory).toBe('markdown')
  })

  it('finds frontmatterProperties on the Markdown tab', () => {
    const row = content.find((c) => c.key === 'frontmatterProperties')
    expect(row).toBeDefined()
    expect(row.routeCategory).toBe('markdown')
  })

  it('routes every visible row of every tab home', () => {
    for (const [tab, keys] of Object.entries(CATEGORY_BY_TAB)) {
      for (const key of keys) {
        const row = content.find((c) => c.key === key)
        expect(row, `${key} missing from the search index`).toBeDefined()
        expect(row.routeCategory, `${key} routed to ${row.routeCategory}`).toBe(tab)
      }
    }
  })

  it('dropped keys are unfindable', () => {
    for (const key of DROPPED_KEYS) {
      expect(content.find((c) => c.key === key)).toBeUndefined()
    }
  })

  it('internal keys stay out of the index', () => {
    for (const key of ['zoom', 'baseFontSize', 'codeBlockLineNumbersMigrated', 'sideBarVisibility', 'searchExclusions']) {
      expect(content.find((c) => c.key === key)).toBeUndefined()
    }
  })
})

describe('schema.json — C-66 update-check keys', () => {
  it('autoCheckUpdates is a searchable General row matching the store default', async () => {
    setupTestPinia()
    const store = usePreferencesStore()
    expect(schema.autoCheckUpdates.type).toBe('boolean')
    expect(schema.autoCheckUpdates.default).toBe(true)
    expect(store.$state.autoCheckUpdates).toBe(true)
    expect(schema.autoCheckUpdates.description).not.toContain('--internal')
    const row = getTranslatedSearchContent().find((c) => c.key === 'autoCheckUpdates')
    expect(row).toBeDefined()
    expect(row.routeCategory).toBe('general')
  })

  it('the state keys lastUpdateCheckAt / skippedUpdateVersion stay internal', () => {
    expect(schema.lastUpdateCheckAt.description.endsWith('--internal')).toBe(true)
    expect(schema.skippedUpdateVersion.description.endsWith('--internal')).toBe(true)
    const content = getTranslatedSearchContent()
    expect(content.find((c) => c.key === 'lastUpdateCheckAt')).toBeUndefined()
    expect(content.find((c) => c.key === 'skippedUpdateVersion')).toBeUndefined()
  })
})
