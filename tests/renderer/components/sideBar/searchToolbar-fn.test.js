/**
 * Function coverage tests for sideBar/searchToolbar.vue
 * Covers: toggleOption, keywordModel computed setter/getter
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {
  search: { caseSensitiveTip: 'CS', wholeWordTip: 'WW', useRegexTip: 'Regex' },
  sideBar: { search: { searchInFolder: 'Search in folder' } }
} } })

describe('sideBar/searchToolbar.vue — fn coverage', () => {
  let pinia, SearchToolbar, searchStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useSearchStore } = await import('@/store/search')
    searchStore = useSearchStore()
    SearchToolbar = (await import('@/components/sideBar/searchToolbar.vue')).default
  })

  const stubs = { ElTooltip: { template: '<div><slot /></div>' } }

  const mount = () => shallowMount(SearchToolbar, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('toggleOption calls TOGGLE_OPTION on store', () => {
    const spy = vi.spyOn(searchStore, 'TOGGLE_OPTION').mockImplementation(() => {})
    const w = mount()
    w.vm.toggleOption('isCaseSensitive')
    expect(spy).toHaveBeenCalledWith('isCaseSensitive')
  })

  it('toggleOption for isWholeWord', () => {
    const spy = vi.spyOn(searchStore, 'TOGGLE_OPTION').mockImplementation(() => {})
    const w = mount()
    w.vm.toggleOption('isWholeWord')
    expect(spy).toHaveBeenCalledWith('isWholeWord')
  })

  it('toggleOption for isRegexp', () => {
    const spy = vi.spyOn(searchStore, 'TOGGLE_OPTION').mockImplementation(() => {})
    const w = mount()
    w.vm.toggleOption('isRegexp')
    expect(spy).toHaveBeenCalledWith('isRegexp')
  })

  it('keywordModel getter returns store keyword', () => {
    const w = mount()
    expect(w.vm.keywordModel).toBe(searchStore.keyword)
  })

  it('keywordModel setter calls SET_KEYWORD', () => {
    const spy = vi.spyOn(searchStore, 'SET_KEYWORD').mockImplementation(() => {})
    const w = mount()
    w.vm.keywordModel = 'test query'
    expect(spy).toHaveBeenCalledWith('test query')
  })
})
