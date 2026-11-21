import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import bus from '@/bus'

// C-SEARCH-ERROR-VISIBILITY: the searcher is mocked per-test so real
// store flows (error, cancel, partial, generations) can be driven and
// the overlay's honest states asserted end-to-end.
const searchSpy = vi.fn()
vi.mock('@/node/ripgrepSearcher', () => ({
  default: class FakeRipgrepDirectorySearcher {
    search (...args) { return searchSpy(...args) }
  }
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      search: { caseSensitiveTip: 'Match case', wholeWordTip: 'Whole word', useRegexTip: 'Use regex' },
      sideBar: {
        search: {
          searchInFolder: 'Search in folder...',
          searching: 'Searching…',
          noResultsFound: 'No results found.',
          searchFailed: 'Search failed. Results may be missing.',
          resultsPartial: 'Partial results — the search stopped early.',
          cancel: 'Cancel',
          noFolderOpen: 'No folder open'
        }
      }
    }
  }
})

const mountComponent = async (pinia) => {
  const ProjectSearch = (await import('@/components/projectSearch/index.vue')).default
  return shallowMount(ProjectSearch, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        SearchResultItem: true,
        ElButton: true
      }
    }
  })
}

describe('projectSearch/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
    searchSpy.mockReset()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    bus.all.clear()
    vi.restoreAllMocks()
  })

  it('mounts hidden by default', async () => {
    const wrapper = await mountComponent(pinia)
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('opens when bus emits projectSearch', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-search-overlay').exists()).toBe(true)
    expect(wrapper.find('.search-input').exists()).toBe(true)
  })

  it('closes when bus emits projectSearch again (toggle)', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-search-overlay').exists()).toBe(true)

    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('closes when close button clicked', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    await wrapper.find('.panel-close').trigger('click')
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('closes on overlay click', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    await wrapper.find('.project-search-overlay').trigger('click')
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('shows search options (Aa, \\b, .*)', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    const opts = wrapper.findAll('.opt')
    expect(opts.length).toBe(3)
  })

  it('toggles case sensitivity option', async () => {
    const { useSearchStore } = await import('@/store/search')
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    const initial = searchStore.isCaseSensitive
    await wrapper.findAll('.opt')[0].trigger('click')
    expect(searchStore.isCaseSensitive).toBe(!initial)
  })

  it('shows no-folder message when no project is open', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.result-info').exists()).toBe(true)
  })

  it('updates keyword via input model', async () => {
    const { useSearchStore } = await import('@/store/search')
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    await wrapper.find('.search-input').setValue('test query')
    expect(searchStore.keyword).toBe('test query')
  })

  it('cleans up bus listener on unmount', async () => {
    const wrapper = await mountComponent(pinia)
    wrapper.unmount()

    const handlerCount = bus.all.get('projectSearch')?.length ?? 0
    expect(handlerCount).toBe(0)
  })

  // ─── C-SEARCH-ERROR-VISIBILITY T-002: honest overlay states ─────────
  const tick = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  it('renders the localized failure line instead of the empty state when the store errors', async () => {
    const { useProjectStore } = await import('@/store/project')
    const { useSearchStore } = await import('@/store/search')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [{ pathname: '/proj' }]
    searchSpy.mockImplementation(() => {
      const p = Promise.reject(new Error('rg exited with code 2'))
      p.cancel = vi.fn()
      p.catch(() => {})
      return p
    })
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    await wrapper.find('.search-input').setValue('needle')
    await tick()
    await wrapper.vm.$nextTick()
    expect(searchStore.error).not.toBe('')
    const info = wrapper.find('.result-info')
    expect(info.exists()).toBe(true)
    // The failure line takes precedence — never renders as the plain
    // "No results found." empty state.
    expect(info.text()).toContain('Search failed. Results may be missing.')
    expect(info.text()).not.toContain('No results found.')
  })

  it('a cancelled search shows neither the failure line nor the partial notice', async () => {
    const { useProjectStore } = await import('@/store/project')
    const { useSearchStore } = await import('@/store/search')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [{ pathname: '/proj' }]
    let resolveOuter
    const promiseLike = new Promise((resolve) => { resolveOuter = resolve })
    promiseLike.cancel = vi.fn(() => { resolveOuter() })
    searchSpy.mockImplementation((_roots, _kw, opts) => {
      opts.didMatch({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
      return promiseLike
    })
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    await wrapper.find('.search-input').setValue('needle')
    expect(searchStore.running).toBe(true)
    searchStore.cancelRunning()
    await tick()
    await wrapper.vm.$nextTick()
    expect(searchStore.error).toBe('')
    expect(searchStore.partialResults).toBe(false)
    const info = wrapper.find('.result-info')
    expect(info.exists()).toBe(true)
    expect(info.text()).not.toContain('Search failed. Results may be missing.')
    expect(info.text()).not.toContain('Partial results — the search stopped early.')
  })

  it('a partial notice accompanies a marked result set', async () => {
    const { useProjectStore } = await import('@/store/project')
    const { useSearchStore } = await import('@/store/search')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [{ pathname: '/proj' }]
    searchSpy.mockImplementation((_roots, _kw, opts) => {
      opts.didMatch({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
      opts.didComplete({ partial: true })
      const p = Promise.resolve()
      p.cancel = vi.fn()
      return p
    })
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    await wrapper.find('.search-input').setValue('needle')
    await tick()
    await wrapper.vm.$nextTick()
    expect(searchStore.partialResults).toBe(true)
    expect(searchStore.results).toHaveLength(1)
    const info = wrapper.find('.result-info')
    expect(info.exists()).toBe(true)
    expect(wrapper.find('.result-partial').exists()).toBe(true)
    expect(info.text()).toContain('Partial results — the search stopped early.')
  })

  it('a stale generation completing after the newest cannot overwrite the visible results', async () => {
    const { useProjectStore } = await import('@/store/project')
    const { useSearchStore } = await import('@/store/search')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [{ pathname: '/proj' }]
    let resolveGen1
    let resolveGen2
    const p1 = new Promise((resolve) => { resolveGen1 = resolve })
    const p2 = new Promise((resolve) => { resolveGen2 = resolve })
    searchSpy
      .mockImplementationOnce((_roots, _kw, opts) => {
        opts.didMatch({ filePath: '/proj/stale.md', matches: [{ line: 1 }] })
        return p1
      })
      .mockImplementationOnce((_roots, _kw, opts) => {
        opts.didMatch({ filePath: '/proj/new.md', matches: [{ line: 1 }] })
        return p2
      })
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    await wrapper.find('.search-input').setValue('quarterl')
    await wrapper.find('.search-input').setValue('quarterly')
    resolveGen2()
    await tick()
    await wrapper.vm.$nextTick()
    expect(searchStore.results).toHaveLength(1)
    expect(searchStore.results[0].filePath).toBe('/proj/new.md')
    // The stale generation lands LAST — it must not overwrite the newest
    // generation's visible result set.
    resolveGen1()
    await tick()
    await wrapper.vm.$nextTick()
    expect(searchStore.results).toHaveLength(1)
    expect(searchStore.results[0].filePath).toBe('/proj/new.md')
  })
})

// ─── C-SEARCH-ERROR-VISIBILITY: all-ten locale presence pin ──────────
// The scoped renderer-suite pin for the two new keys (and the retired
// dead-panel keys); tests/renderer/i18n/locale-keys.test.js remains a
// gate for its own namespaces and stays untouched.
describe('sideBar.search failure/partial locale keys (C-SEARCH-ERROR-VISIBILITY)', () => {
  const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
  const readTable = (locale) =>
    JSON.parse(readFileSync(resolve(process.cwd(), 'static/locales', `${locale}.json`), 'utf8'))

  it('carries searchFailed and resultsPartial in all ten locales', () => {
    for (const locale of LOCALES) {
      const search = readTable(locale).sideBar.search
      expect(typeof search.searchFailed, `${locale}.sideBar.search.searchFailed`).toBe('string')
      expect(typeof search.resultsPartial, `${locale}.sideBar.search.resultsPartial`).toBe('string')
    }
  })

  it('writes non-empty copy everywhere', () => {
    for (const locale of LOCALES) {
      const search = readTable(locale).sideBar.search
      expect(search.searchFailed.trim().length, `${locale}.searchFailed`).toBeGreaterThan(0)
      expect(search.resultsPartial.trim().length, `${locale}.resultsPartial`).toBeGreaterThan(0)
    }
  })

  it('retired the dead-panel keys startTyping/openFolder from the search namespace', () => {
    for (const locale of LOCALES) {
      const search = readTable(locale).sideBar.search
      expect(search.startTyping, `${locale}.startTyping removed`).toBeUndefined()
      expect(search.openFolder, `${locale}.search.openFolder removed`).toBeUndefined()
    }
  })
})
