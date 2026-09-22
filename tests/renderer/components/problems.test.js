// FILE: tests/renderer/components/problems.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-17 problems panel (visibility, issue list, preference gate, click-to-jump slug mapping).
//   SCOPE: jsdom mount of components/problems with mocked bus/electron-log and seeded Pinia stores.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, vue-i18n.
//   LINKS: .grace/changes/active/C-17; .grace/verification/runtime.xml V-M-011 scenario-30.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   busMock - The mocked bus module (handler capture + emit assertions).
//   i18n - Shared vue-i18n instance for panel mounts.
//   getBusHandler - Retrieves the panel's registration for a bus channel.
//   mountPanel - Mounts the overlay with seeded editor/preferences stores.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - commandPalette-style harness (electron-log mock, i18n plugin, in-test imports) — bus registration, recompute, preference gate, empty state, jump mapping.
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('../../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn() }
}))

const busMock = await import('@/bus')

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const getBusHandler = (channel) =>
  busMock.default.on.mock.calls.find(([c]) => c === channel)?.[1]

async function mountPanel({ markdownLint = true, listToc = [] } = {}) {
  const pinia = setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const { usePreferencesStore } = await import('@/store/preferences')
  const editorStore = useEditorStore()
  const preferencesStore = usePreferencesStore()
  editorStore.listToc = listToc
  preferencesStore.markdownLint = markdownLint

  const ProblemsPanel = (await import('@/components/problems/index.vue')).default
  const wrapper = mount(ProblemsPanel, { global: { plugins: [pinia, i18n] } })
  return { wrapper, editorStore, preferencesStore }
}

describe('problems panel — C-17', () => {
  beforeEach(() => {
    busMock.default.on.mockClear()
    busMock.default.emit.mockClear()
  })

  it('registers problems and doc-markdown-changed channels', async () => {
    await mountPanel()
    expect(busMock.default.on).toHaveBeenCalledWith('problems', expect.any(Function))
    expect(busMock.default.on).toHaveBeenCalledWith('doc-markdown-changed', expect.any(Function))
  })

  it('toggles visibility via the problems channel and lists recomputed issues', async () => {
    const { wrapper } = await mountPanel()
    expect(wrapper.find('.problems-panel').exists()).toBe(false)

    getBusHandler('problems')()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.problems-panel').exists()).toBe(true)

    getBusHandler('doc-markdown-changed')({
      markdown: '# A\n\n### jump  \ntext\n- item\n'
    })
    await wrapper.vm.$nextTick()

    const rules = wrapper.findAll('.rule').map((r) => r.text().toLowerCase())
    expect(rules).toContain('md001')
    expect(rules).toContain('md009')
    expect(rules).toContain('md032')
  })

  it('shows the empty state for a clean document', async () => {
    const { wrapper } = await mountPanel()
    getBusHandler('problems')()
    getBusHandler('doc-markdown-changed')({ markdown: '# A\n\nbody\n' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.empty').exists()).toBe(true)
    expect(wrapper.findAll('.issue')).toHaveLength(0)
  })

  it('stays empty when the markdownLint preference is off', async () => {
    const { wrapper } = await mountPanel({ markdownLint: false })
    getBusHandler('problems')()
    getBusHandler('doc-markdown-changed')({ markdown: '# A\n\n### jump\n' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.issue')).toHaveLength(0)
    expect(wrapper.find('.empty').exists()).toBe(true)
  })

  it('jumps to the nearest preceding heading via its listToc slug', async () => {
    const { wrapper } = await mountPanel({
      listToc: [
        { content: 'A', slug: 'ag-1', lvl: 1 },
        { content: 'jump', slug: 'ag-2', lvl: 3 }
      ]
    })
    getBusHandler('problems')()
    // MD009 on line 4 — under '### jump', the 2nd heading.
    getBusHandler('doc-markdown-changed')({ markdown: '# A\n\n### jump\ntrailing \n' })
    await wrapper.vm.$nextTick()

    // Click the MD009 issue on line 4 (the first listed issue is md001:3).
    const md009 = wrapper.findAll('.issue').find((i) => i.text().includes('trailing'))
    await md009.trigger('click')
    expect(busMock.default.emit).toHaveBeenCalledWith('scroll-to-header', 'ag-2')
  })

  it('does not jump when the issue precedes every heading', async () => {
    const { wrapper } = await mountPanel({ listToc: [] })
    getBusHandler('problems')()
    getBusHandler('doc-markdown-changed')({ markdown: 'lead text \n\n# A\n' })
    await wrapper.vm.$nextTick()

    await wrapper.find('.issue').trigger('click')
    expect(busMock.default.emit).not.toHaveBeenCalledWith('scroll-to-header', expect.anything())
  })
})
