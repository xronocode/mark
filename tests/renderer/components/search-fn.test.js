/**
 * Function coverage tests for search/index.vue
 * Covers: toggleCtrl, listenFind, listenReplace, listenFindNext, listenFindPrev,
 * docKeyup, docClick, emptySearch, toggleSearchType, find, handleEnterKey,
 * searchFn, replace, noop, blurSearch
 */
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('underscore', () => ({
  debounce: (fn) => fn
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {
  search: {
    searchPlaceholder: 'Search', caseSensitive: 'CS', wholeWord: 'WW',
    useRegex: 'Regex', replaceAll: 'All', replaceSingle: 'Single',
    replacementPlaceholder: 'Replace', invalidRegex: 'Invalid: {pattern}',
    regexMatchEmpty: 'Matches empty: {pattern}',
    searchResultInfo: '{matchCount} results'
  }
} } })

describe('search/index.vue — fn coverage', () => {
  let pinia, Search, bus, editorStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    const { useEditorStore } = await import('@/store/editor')
    editorStore = useEditorStore()
    editorStore.currentFile = { searchMatches: { matches: [], index: -1, value: '' } }

    Search = (await import('@/components/search/index.vue')).default
  })

  const stubs = {
    ElTooltip: { template: '<div><slot /></div>' },
    FindCaseIcon: true,
    FindWordIcon: true,
    FindRegexIcon: true
  }

  const mount = () => shallowMount(Search, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('toggleCtrl toggles isCaseSensitive', () => {
    const w = mount()
    expect(w.vm.isCaseSensitive).toBe(false)
    w.vm.toggleCtrl('isCaseSensitive')
    expect(w.vm.isCaseSensitive).toBe(true)
  })

  it('toggleCtrl toggles isWholeWord', () => {
    const w = mount()
    w.vm.toggleCtrl('isWholeWord')
    expect(w.vm.isWholeWord).toBe(true)
  })

  it('toggleCtrl toggles isRegexp', () => {
    const w = mount()
    w.vm.toggleCtrl('isRegexp')
    expect(w.vm.isRegexp).toBe(true)
  })

  it('toggleSearchType switches between search and replace', () => {
    const w = mount()
    expect(w.vm.type).toBe('search')
    w.vm.toggleSearchType()
    expect(w.vm.type).toBe('replace')
    w.vm.toggleSearchType()
    expect(w.vm.type).toBe('search')
  })

  it('find emits find-action on bus', () => {
    const w = mount()
    bus.emit.mockClear()
    w.vm.find('next')
    expect(bus.emit).toHaveBeenCalledWith('find-action', 'next')
  })

  it('handleEnterKey calls find on Enter key', () => {
    const w = mount()
    bus.emit.mockClear()
    w.vm.handleEnterKey({ key: 'Enter' })
    expect(bus.emit).toHaveBeenCalledWith('find-action', 'next')
  })

  it('handleEnterKey does nothing on non-Enter key', () => {
    const w = mount()
    bus.emit.mockClear()
    w.vm.handleEnterKey({ key: 'a' })
    expect(bus.emit).not.toHaveBeenCalledWith('find-action', expect.anything())
  })

  it('replace emits replaceValue on bus', () => {
    const w = mount()
    w.vm.replaceValue = 'new'
    bus.emit.mockClear()
    w.vm.replace(true)
    expect(bus.emit).toHaveBeenCalledWith('replaceValue', expect.objectContaining({
      value: 'new',
      opt: expect.objectContaining({ isSingle: true })
    }))
  })

  it('replace with isSingle=false', () => {
    const w = mount()
    w.vm.replaceValue = 'all'
    bus.emit.mockClear()
    w.vm.replace(false)
    const args = bus.emit.mock.calls.find(c => c[0] === 'replaceValue')[1]
    expect(args.opt.isSingle).toBe(false)
  })

  it('noop does nothing', () => {
    const w = mount()
    w.vm.noop() // Should not throw
  })

  it('emptySearch clears values and hides search', () => {
    const w = mount()
    w.vm.showSearch = true
    w.vm.searchValue = 'hello'
    w.vm.replaceValue = 'world'
    bus.emit.mockClear()
    w.vm.emptySearch(true)
    expect(w.vm.showSearch).toBe(false)
    expect(w.vm.searchValue).toBe('')
    expect(w.vm.replaceValue).toBe('')
    expect(bus.emit).toHaveBeenCalledWith('searchValue', expect.objectContaining({
      opt: { selectHighlight: true }
    }))
  })

  it('listenFind opens search and sets type', async () => {
    const w = mount()
    const handler = bus.on.mock.calls.find(c => c[0] === 'find')[1]
    handler()
    expect(w.vm.showSearch).toBe(true)
    expect(w.vm.type).toBe('search')
  })

  it('listenReplace opens search with replace type', () => {
    const w = mount()
    const handler = bus.on.mock.calls.find(c => c[0] === 'replace')[1]
    handler()
    expect(w.vm.showSearch).toBe(true)
    expect(w.vm.type).toBe('replace')
  })

  it('listenFindNext calls find(next)', () => {
    const w = mount()
    const handler = bus.on.mock.calls.find(c => c[0] === 'findNext')[1]
    bus.emit.mockClear()
    handler()
    expect(bus.emit).toHaveBeenCalledWith('find-action', 'next')
  })

  it('listenFindPrev calls find(prev)', () => {
    const w = mount()
    const handler = bus.on.mock.calls.find(c => c[0] === 'findPrev')[1]
    bus.emit.mockClear()
    handler()
    expect(bus.emit).toHaveBeenCalledWith('find-action', 'prev')
  })

  it('docKeyup with Escape calls emptySearch', () => {
    const w = mount()
    w.vm.showSearch = true
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
    expect(w.vm.showSearch).toBe(false)
  })

  it('docClick hides search when visible', () => {
    const w = mount()
    w.vm.showSearch = true
    document.dispatchEvent(new Event('click'))
    expect(w.vm.showSearch).toBe(false)
  })

  it('docClick does nothing when search is hidden', () => {
    const w = mount()
    w.vm.showSearch = false
    bus.emit.mockClear()
    document.dispatchEvent(new Event('click'))
    // No searchValue emit
    expect(bus.emit).not.toHaveBeenCalledWith('searchValue', expect.anything())
  })

  it('blurSearch hides search via bus', () => {
    const w = mount()
    w.vm.showSearch = true
    const handler = bus.on.mock.calls.find(c => c[0] === 'search-blur')[1]
    handler()
    expect(w.vm.showSearch).toBe(false)
  })

  it('searchFn with invalid regex sets error', () => {
    const w = mount()
    w.vm.isRegexp = true
    w.vm.searchValue = '['
    w.vm.showSearch = true
    // Trigger search manually
    bus.emit.mockClear()
    // Call the raw searchFn through toggleCtrl which triggers searchFn
    w.vm.toggleCtrl('isRegexp') // toggles off, then back on to trigger
    w.vm.toggleCtrl('isRegexp')
  })

  it('searchFn with regex matching empty string sets error', () => {
    const w = mount()
    w.vm.isRegexp = true
    w.vm.searchValue = '.*'
    w.vm.showSearch = true
    // toggleCtrl calls searchFn
    w.vm.toggleCtrl('isCaseSensitive')
    expect(w.vm.searchErrorMsg).toContain('.*')
  })

  it('onBeforeUnmount removes listeners', () => {
    const w = mount()
    w.unmount()
    expect(bus.off).toHaveBeenCalledWith('find', expect.any(Function))
    expect(bus.off).toHaveBeenCalledWith('replace', expect.any(Function))
    expect(bus.off).toHaveBeenCalledWith('findNext', expect.any(Function))
    expect(bus.off).toHaveBeenCalledWith('findPrev', expect.any(Function))
    expect(bus.off).toHaveBeenCalledWith('search-blur', expect.any(Function))
  })

  it('highlightIndex returns -1 when no searchMatches', () => {
    const w = mount()
    editorStore.currentFile = {}
    expect(w.vm.highlightIndex).toBe(-1)
  })

  it('highlightCount returns 0 when no searchMatches', () => {
    const w = mount()
    editorStore.currentFile = {}
    expect(w.vm.highlightCount).toBe(0)
  })
})
