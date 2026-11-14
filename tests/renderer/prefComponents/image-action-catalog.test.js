// FILE: tests/renderer/prefComponents/image-action-catalog.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify Settings search advertises only the two supported image actions from the existing upload-retirement policy.
//   SCOPE: Real schema, Advanced option builder and mounted SearchPanel/index; shipped English/Russian labels with controlled translation/router boundaries.
//   DEPENDS: Vue Test Utils, Vitest, shipped locales, Settings search and Advanced config.
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011; .grace/changes/archive/C-38; owner decision 0c17da80.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   translation - Controlled current-locale translator for the production index and panel.
//   routerMock - Observe the production search selection route.
//   localeMessages - Shipped English and Russian translation data.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-13 CONFIG:F-005: cover supported image metadata and retired-term search rejection with positive discovery/routing controls.
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import schema from '@/_shims/preferences/schema.json'
import en from '../../../static/locales/en.json'
import ru from '../../../static/locales/ru.json'

const translation = vi.hoisted(() => ({ current: key => key }))
const routerMock = vi.hoisted(() => ({ push: vi.fn(async () => {}) }))

vi.mock('@/i18n', () => ({ t: (...args) => translation.current(...args) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (...args) => translation.current(...args) }) }))
vi.mock('vue-router', () => ({ useRouter: () => routerMock }))

import SearchPanel from '@/prefComponents/tabsBar/searchPanel.vue'
import { getImageActions } from '@/prefComponents/tabs/advanced/config'

const localeMessages = { en, ru }

it('keeps the catalog aligned with the two supported image actions', () => {
  expect(schema.imageInsertAction.enum).toEqual(['folder', 'path'])
  expect(getImageActions().map(action => action.value)).toEqual(['folder', 'path'])
  expect(schema.imageInsertAction.default).toBe('folder')
})

describe.each(['en', 'ru'])('image-action search in %s', locale => {
  let wrapper

  beforeEach(async () => {
    routerMock.push.mockClear()
    translation.current = key => {
      const value = key.split('.').reduce((node, part) => node?.[part], localeMessages[locale])
      return typeof value === 'string' ? value : key
    }
    wrapper = mount(SearchPanel)
    wrapper.vm.openPanel()
    await nextTick()
  })

  afterEach(() => {
    wrapper?.unmount()
    translation.current = key => key
  })

  it.each(['upload', 'cloud'])('does not advertise the retired %s action', async query => {
    const label = localeMessages[locale].preferences.search.items.imageInsertAction
    const input = wrapper.get('input[type="search"]')
    await input.setValue('folder')
    expect(wrapper.findAll('.pref-search-results .name').map(row => row.text())).toContain(label)

    await input.setValue(query)
    expect(wrapper.findAll('.pref-search-results .name').map(row => row.text())).not.toContain(label)
  })

  it('finds the supported image row and routes it to Advanced', async () => {
    const label = localeMessages[locale].preferences.search.items.imageInsertAction
    await wrapper.get('input[type="search"]').setValue('folder')
    const hit = wrapper.findAll('[role="option"]').find(row => row.find('.name').text() === label)
    expect(hit).toBeDefined()
    await hit.trigger('click')

    expect(routerMock.push).toHaveBeenCalledExactlyOnceWith({ path: '/preference/advanced' })
    expect(wrapper.find('[role="search"]').exists()).toBe(false)
    expect(wrapper.emitted('closed')).toHaveLength(1)
  })
})
