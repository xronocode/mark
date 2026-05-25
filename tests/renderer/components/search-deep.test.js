import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/assets/icons/searchIcons/iconCase.svg', () => ({ default: { template: '<svg/>' } }))
vi.mock('@/assets/icons/searchIcons/iconWord.svg', () => ({ default: { template: '<svg/>' } }))
vi.mock('@/assets/icons/searchIcons/iconRegex.svg', () => ({ default: { template: '<svg/>' } }))

vi.mock('underscore', () => ({
  debounce: (fn) => fn
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      search: {
        searchPlaceholder: 'Search...',
        replacementPlaceholder: 'Replace...',
        caseSensitive: 'Case Sensitive',
        wholeWord: 'Whole Word',
        useRegex: 'Use Regex',
        replaceAll: 'Replace All',
        replaceSingle: 'Replace',
        invalidRegex: 'Invalid regex: {pattern}',
        regexMatchEmpty: 'Regex matches empty: {pattern}'
      }
    }
  }
})

const makeStubs = () => ({
  ElTooltip: true,
  FindCaseIcon: true,
  FindWordIcon: true,
  FindRegexIcon: true
})

describe('search/index.vue — deep coverage', () => {
  let pinia, bus, Search

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      searchMatches: null
    }

    Search = (await import('@/components/search/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(Search, {
      global: {
        plugins: [pinia, i18n],
        stubs: makeStubs()
      }
    })

  // --- bus listener registration ---
  describe('bus listener registration', () => {
    it('registers all listeners on mount', () => {
      mountComponent()
      expect(bus.on).toHaveBeenCalledWith('find', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('replace', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('findNext', expect.any(Function))
      expect(bus.on).toHaveBeenCalledWith('findPrev', expect.any(Function))
    })

    it('unregisters all listeners on unmount', () => {
      const wrapper = mountComponent()
      wrapper.unmount()
      expect(bus.off).toHaveBeenCalledWith('find', expect.any(Function))
      expect(bus.off).toHaveBeenCalledWith('replace', expect.any(Function))
      expect(bus.off).toHaveBeenCalledWith('findNext', expect.any(Function))
      expect(bus.off).toHaveBeenCalledWith('findPrev', expect.any(Function))
    })
  })

  // --- listenFind / listenReplace ---
  describe('listenFind', () => {
    it('opens search bar and sets type to search', () => {
      const wrapper = mountComponent()
      const findHandler = bus.on.mock.calls.find((c) => c[0] === 'find')[1]

      findHandler()

      expect(wrapper.vm.showSearch).toBe(true)
      expect(wrapper.vm.type).toBe('search')
    })
  })

  describe('listenReplace', () => {
    it('opens search bar and sets type to replace', () => {
      const wrapper = mountComponent()
      const replaceHandler = bus.on.mock.calls.find((c) => c[0] === 'replace')[1]

      replaceHandler()

      expect(wrapper.vm.showSearch).toBe(true)
      expect(wrapper.vm.type).toBe('replace')
    })
  })

  // --- listenFindNext / listenFindPrev ---
  describe('listenFindNext', () => {
    it('emits find-action next', () => {
      mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'findNext')[1]

      handler()

      expect(bus.emit).toHaveBeenCalledWith('find-action', 'next')
    })
  })

  describe('listenFindPrev', () => {
    it('emits find-action prev', () => {
      mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'findPrev')[1]

      handler()

      expect(bus.emit).toHaveBeenCalledWith('find-action', 'prev')
    })
  })

  // --- toggleCtrl ---
  describe('toggleCtrl', () => {
    it('toggles isCaseSensitive and triggers search', () => {
      const wrapper = mountComponent()

      expect(wrapper.vm.isCaseSensitive).toBe(false)
      wrapper.vm.toggleCtrl('isCaseSensitive')
      expect(wrapper.vm.isCaseSensitive).toBe(true)

      // Should emit searchValue
      expect(bus.emit).toHaveBeenCalledWith('searchValue', expect.objectContaining({
        opt: expect.objectContaining({ isCaseSensitive: true })
      }))
    })

    it('toggles isWholeWord', () => {
      const wrapper = mountComponent()

      expect(wrapper.vm.isWholeWord).toBe(false)
      wrapper.vm.toggleCtrl('isWholeWord')
      expect(wrapper.vm.isWholeWord).toBe(true)
    })

    it('toggles isRegexp', () => {
      const wrapper = mountComponent()

      expect(wrapper.vm.isRegexp).toBe(false)
      wrapper.vm.toggleCtrl('isRegexp')
      expect(wrapper.vm.isRegexp).toBe(true)
    })
  })

  // --- toggleSearchType ---
  describe('toggleSearchType', () => {
    it('switches from search to replace', () => {
      const wrapper = mountComponent()

      expect(wrapper.vm.type).toBe('search')
      wrapper.vm.toggleSearchType()
      expect(wrapper.vm.type).toBe('replace')
    })

    it('switches from replace back to search', () => {
      const wrapper = mountComponent()

      wrapper.vm.type = 'replace'
      wrapper.vm.toggleSearchType()
      expect(wrapper.vm.type).toBe('search')
    })
  })

  // --- emptySearch / docKeyup ---
  describe('emptySearch / docKeyup', () => {
    it('hides search, clears values, emits searchValue', () => {
      const wrapper = mountComponent()

      wrapper.vm.showSearch = true
      wrapper.vm.searchValue = 'test'
      wrapper.vm.replaceValue = 'replacement'

      wrapper.vm.emptySearch(true)

      expect(wrapper.vm.showSearch).toBe(false)
      expect(wrapper.vm.searchValue).toBe('')
      expect(wrapper.vm.replaceValue).toBe('')
      expect(bus.emit).toHaveBeenCalledWith('searchValue', {
        value: '',
        opt: { selectHighlight: true }
      })
    })

    it('Escape key triggers emptySearch via docKeyup', () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true

      wrapper.vm.docKeyup({ key: 'Escape' })

      expect(wrapper.vm.showSearch).toBe(false)
    })

    it('non-Escape key does nothing in docKeyup', () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true

      wrapper.vm.docKeyup({ key: 'a' })

      expect(wrapper.vm.showSearch).toBe(true)
    })

    it('close button triggers emptySearch', async () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true
      await nextTick()

      const closeBtn = wrapper.find('.search-close')
      await closeBtn.trigger('click')

      expect(wrapper.vm.showSearch).toBe(false)
    })
  })

  // --- handleEnterKey ---
  describe('handleEnterKey', () => {
    it('emits find-action next on Enter', () => {
      const wrapper = mountComponent()
      wrapper.vm.handleEnterKey({ key: 'Enter', shiftKey: false })

      expect(bus.emit).toHaveBeenCalledWith('find-action', 'next')
    })

    it('emits find-action prev on Shift+Enter', () => {
      const wrapper = mountComponent()
      wrapper.vm.handleEnterKey({ key: 'Enter', shiftKey: true })

      expect(bus.emit).toHaveBeenCalledWith('find-action', 'prev')
    })

    it('does nothing on other keys', () => {
      bus.emit.mockClear()
      const wrapper = mountComponent()
      wrapper.vm.handleEnterKey({ key: 'a', shiftKey: false })

      expect(bus.emit).not.toHaveBeenCalledWith('find-action', expect.anything())
    })
  })

  // --- searchFn with regex validation ---
  describe('searchFn (regex)', () => {
    it('sets error for invalid regex', () => {
      const wrapper = mountComponent()
      wrapper.vm.isRegexp = true
      wrapper.vm.searchValue = '[invalid'

      wrapper.vm.searchFn()

      expect(wrapper.vm.searchErrorMsg).toBeTruthy()
      // Should NOT emit searchValue
    })

    it('sets error for regex matching empty string', () => {
      const wrapper = mountComponent()
      wrapper.vm.isRegexp = true
      wrapper.vm.searchValue = '.*'

      wrapper.vm.searchFn()

      expect(wrapper.vm.searchErrorMsg).toBeTruthy()
    })

    it('clears error and emits searchValue for valid regex', () => {
      const wrapper = mountComponent()
      wrapper.vm.isRegexp = true
      wrapper.vm.searchValue = 'hello'

      wrapper.vm.searchFn()

      expect(wrapper.vm.searchErrorMsg).toBe('')
      expect(bus.emit).toHaveBeenCalledWith('searchValue', expect.objectContaining({
        value: 'hello',
        opt: expect.objectContaining({ isRegexp: true })
      }))
    })

    it('emits searchValue for non-regex search', () => {
      const wrapper = mountComponent()
      wrapper.vm.searchValue = 'test'

      wrapper.vm.searchFn()

      expect(bus.emit).toHaveBeenCalledWith('searchValue', {
        value: 'test',
        opt: {
          isCaseSensitive: false,
          isWholeWord: false,
          isRegexp: false
        }
      })
    })
  })

  // --- replace ---
  describe('replace', () => {
    it('emits replaceValue with single=true by default', () => {
      const wrapper = mountComponent()
      wrapper.vm.replaceValue = 'new text'

      wrapper.vm.replace(true)

      expect(bus.emit).toHaveBeenCalledWith('replaceValue', {
        value: 'new text',
        opt: {
          isSingle: true,
          isCaseSensitive: false,
          isWholeWord: false,
          isRegexp: false
        }
      })
    })

    it('emits replaceValue with single=false for replace all', () => {
      const wrapper = mountComponent()
      wrapper.vm.replaceValue = 'replacement'

      wrapper.vm.replace(false)

      expect(bus.emit).toHaveBeenCalledWith('replaceValue', {
        value: 'replacement',
        opt: expect.objectContaining({ isSingle: false })
      })
    })
  })

  // --- computed: highlightIndex / highlightCount ---
  describe('computed properties', () => {
    it('highlightIndex returns -1 when no searchMatches', async () => {
      const wrapper = mountComponent()
      expect(wrapper.vm.highlightIndex).toBe(-1)
    })

    it('highlightIndex returns value from searchMatches', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile.searchMatches = {
        index: 3,
        matches: ['a', 'b', 'c', 'd'],
        value: 'test'
      }

      const wrapper = mountComponent()
      expect(wrapper.vm.highlightIndex).toBe(3)
    })

    it('highlightCount returns 0 when no searchMatches', async () => {
      const wrapper = mountComponent()
      expect(wrapper.vm.highlightCount).toBe(0)
    })

    it('highlightCount returns matches length', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile.searchMatches = {
        index: 0,
        matches: ['a', 'b', 'c'],
        value: 'test'
      }

      const wrapper = mountComponent()
      expect(wrapper.vm.highlightCount).toBe(3)
    })
  })

  // --- watcher: searchMatches ---
  describe('watcher: searchMatches', () => {
    it('updates searchValue when searchMatches.value changes', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile.searchMatches = {
        index: 0,
        matches: ['a'],
        value: 'old'
      }

      const wrapper = mountComponent()
      wrapper.vm.searchValue = 'old'

      // Change the value
      editorStore.currentFile.searchMatches = {
        index: 0,
        matches: ['a'],
        value: 'new'
      }

      await nextTick()
      expect(wrapper.vm.searchValue).toBe('new')
    })
  })

  // --- watcher: searchValue ---
  describe('watcher: searchValue', () => {
    it('does not trigger search when showSearch is false', async () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = false

      bus.emit.mockClear()
      wrapper.vm.searchValue = 'new value'
      await nextTick()

      // Should not emit searchValue (because showSearch is false)
      expect(bus.emit).not.toHaveBeenCalledWith('searchValue', expect.anything())
    })

    it('triggers search when showSearch is true', async () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true

      bus.emit.mockClear()
      wrapper.vm.searchValue = 'abc'
      await nextTick()

      expect(bus.emit).toHaveBeenCalledWith('searchValue', expect.objectContaining({
        value: 'abc'
      }))
    })
  })

  // --- click interactions ---
  describe('click interactions', () => {
    it('prev button emits find-action prev', async () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true
      await nextTick()

      const buttons = wrapper.findAll('.button')
      // First button with class "right" is prev
      const prevBtn = buttons[0]
      if (prevBtn) {
        await prevBtn.trigger('click')
        expect(bus.emit).toHaveBeenCalledWith('find-action', 'prev')
      }
    })

    it('next button emits find-action next', async () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true
      await nextTick()

      const buttons = wrapper.findAll('.button')
      // Second button in search section is next
      if (buttons[1]) {
        await buttons[1].trigger('click')
        expect(bus.emit).toHaveBeenCalledWith('find-action', 'next')
      }
    })

    it('left arrow toggles search type', async () => {
      const wrapper = mountComponent()
      wrapper.vm.showSearch = true
      await nextTick()

      const leftArrow = wrapper.find('.left-arrow')
      await leftArrow.trigger('click')

      expect(wrapper.vm.type).toBe('replace')
    })
  })
})
