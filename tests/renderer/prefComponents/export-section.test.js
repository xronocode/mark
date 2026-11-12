// FILE: tests/renderer/prefComponents/export-section.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove Export preferences hydrate without writes and apply every control without exporting.
//   SCOPE: Mounted section, page persistence/remount, numeric v-model, optional-key removal, Reset and honest failure/retry state.
//   DEPENDS: Vue Test Utils, Vitest, actual page-default helper; controlled appearance-store and bus facades.
//   LINKS: M-072; V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   appearance - Controlled legacy appearance record.
//   remember - Appearance write result and option observation.
//   bus - Assert the section never starts an export or mounts a dialog listener.
//   stubs - Existing control boundaries, including actual numeric v-model events.
//   i18n - Key-preserving section labels.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: replace obsolete modal lifecycle checks with immediate-apply behavior.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appearance, remember, bus } = vi.hoisted(() => ({
  appearance: { value: {} }, remember: vi.fn(), bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/bus', () => ({ default: bus }))
vi.mock('@/prefComponents/common/compound', () => ({
  default: { name: 'Compound', template: '<section><slot name="head"/><slot name="children"/></section>' }
}))
vi.mock('@/store/editor', () => ({
  getRememberedExportAppearance: () => ({
    theme: null, pageMarginTop: 20, pageMarginRight: 15, pageMarginBottom: 20, pageMarginLeft: 15,
    autoNumberingHeadings: false, showFrontMatter: false, tocTitle: '', tocIncludeTopHeading: true,
    ...appearance.value
  }),
  useEditorStore: () => ({ REMEMBER_EXPORT_OPTIONS: remember })
}))
vi.mock('@/i18n', () => ({ t: key => key }))
const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
const stubs = {
  Compound: { template: '<section><slot name="head"/><slot name="children"/></section>' },
  ElInputNumber: {
    name: 'ElInputNumber', props: ['modelValue'], emits: ['update:modelValue', 'change'],
    template: '<input class="dimension" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />'
  },
  Bool: true, CurSelect: true, FontTextBox: true, Range: true, TextBox: true, HeaderFooterStrip: true
}

describe('Export preferences immediate apply', () => {
  let ExportSection
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.resetModules()
    localStorage.clear()
    appearance.value = {}
    remember.mockReset().mockReturnValue(true)
    bus.on.mockClear(); bus.off.mockClear(); bus.emit.mockClear()
    window.marktext = { paths: { userDataPath: '/tmp/fixture' }, env: { type: 'settings' } }
    window.path = { join: (...parts) => parts.join('/') }
    window.fileUtils = { isDirectory: () => false }
    ExportSection = (await import('@/prefComponents/tabs/export/index.vue')).default
  })

  const mount = () => shallowMount(ExportSection, { global: { plugins: [i18n], stubs } })

  it('mounts all four groups without a dialog, export button or export listener', () => {
    const w = mount()
    expect(w.findAll('section'), w.html()).toHaveLength(4)
    expect(w.find('el-dialog-stub').exists()).toBe(false)
    expect(w.find('.button-primary').exists()).toBe(false)
    expect(bus.on.mock.calls.some(call => call[0] === 'showExportDialog')).toBe(false)
    expect(bus.emit).not.toHaveBeenCalledWith('export', expect.anything())
    w.unmount()
  })

  it('hydrates legacy appearance and page defaults without saving or adopting a document title', async () => {
    appearance.value = { theme: 'paper.css', header: { type: 1, center: 'Heading' }, fontSize: 18, fontFamily: 'Georgia' }
    localStorage.setItem('mark-export-page-options', JSON.stringify({ pageSize: 'A5', isLandscape: true, htmlTitle: 'Explicit title' }))
    const w = mount()
    await nextTick()
    expect(w.vm.theme).toBe('paper.css')
    expect(w.vm.headerTextCenter).toBe('Heading')
    expect(w.vm.fontSettingsOverwrite).toBe(true)
    expect(w.vm.fontSize).toBe(18)
    expect(w.vm.pageSize).toBe('A5')
    expect(w.vm.isLandscape).toBe(true)
    expect(w.vm.htmlTitle).toBe('Explicit title')
    expect(remember).not.toHaveBeenCalled()
    w.unmount()
  })

  it('persists numeric v-model edits and all page defaults through remount', async () => {
    const w = mount()
    w.vm.onSelectChange('pageSize', 'custom')
    w.vm.onSelectChange('isLandscape', true)
    w.vm.onSelectChange('htmlTitle', 'Future title')
    await nextTick()
    const inputs = w.findAll('input.dimension')
    await inputs[0].setValue('333')
    await inputs[1].setValue('444')
    expect(JSON.parse(localStorage.getItem('mark-export-page-options'))).toMatchObject({ pageSize: 'custom', pageSizeWidth: 333, pageSizeHeight: 444, isLandscape: true, htmlTitle: 'Future title' })
    expect(remember).toHaveBeenCalled()
    w.unmount()
    const fresh = mount()
    expect(fresh.vm.pageSizeWidth).toBe(333)
    expect(fresh.vm.pageSizeHeight).toBe(444)
    expect(fresh.vm.htmlTitle).toBe('Future title')
    fresh.unmount()
  })

  it('removes optional font/header/footer/style keys when their controls are cleared', async () => {
    appearance.value = { fontSize: 20, header: { center: 'Header' }, footer: { right: 'Footer' }, headerFooterFontSize: 16 }
    const w = mount()
    w.vm.onSelectChange('fontSettingsOverwrite', false)
    w.vm.onSelectChange('headerFooterCustomize', false)
    w.vm.onStripChange('header', { left: '', center: '', right: '' })
    w.vm.onStripChange('footer', { left: '', center: '', right: '' })
    await nextTick()
    const options = remember.mock.calls.at(-1)[0]
    for (const key of ['fontSize', 'fontFamily', 'lineHeight', 'header', 'footer', 'headerFooterStyled', 'headerFooterFontSize']) expect(options).not.toHaveProperty(key)
    w.unmount()
  })

  it('Reset persists factory page and appearance defaults without exporting', async () => {
    appearance.value = { theme: 'other.css', fontSize: 19, pageMarginTop: 8, header: { center: 'Remove' } }
    localStorage.setItem('mark-export-page-options', JSON.stringify({ pageSize: 'Letter', isLandscape: true, htmlTitle: 'Remove' }))
    const w = mount()
    await w.vm.handleReset()
    expect(JSON.parse(localStorage.getItem('mark-export-page-options'))).toEqual({ pageSize: 'A4', pageSizeWidth: 210, pageSizeHeight: 297, isLandscape: false, htmlTitle: '' })
    const options = remember.mock.calls.at(-1)[0]
    expect(options).toMatchObject({ theme: null, pageMarginTop: 20, pageMarginLeft: 15 })
    expect(options).not.toHaveProperty('header')
    expect(options).not.toHaveProperty('fontSize')
    expect(bus.emit).not.toHaveBeenCalledWith('export', expect.anything())
    w.unmount()
  })

  it('shows failed persistence and allows a write retry without exporting', async () => {
    remember.mockReturnValue(false)
    const w = mount()
    w.vm.onSelectChange('theme', 'paper.css')
    await nextTick()
    expect(w.find('[role="alert"]').exists()).toBe(true)
    remember.mockReturnValue(true)
    await w.find('.button-retry').trigger('click')
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(bus.emit).not.toHaveBeenCalledWith('export', expect.anything())
    w.unmount()
  })

  it('keeps an unsuccessful page write visible after returning to the section', async () => {
    const original = Storage.prototype.setItem
    const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'mark-export-page-options') throw new Error('quota')
      return original.call(this, key, value)
    })
    const first = mount()
    first.vm.onSelectChange('pageSize', 'Letter')
    await nextTick()
    expect(first.find('[role="alert"]').exists()).toBe(true)
    first.unmount()
    const reopened = mount()
    expect(reopened.vm.pageSize).toBe('Letter')
    expect(reopened.find('[role="alert"]').exists()).toBe(true)
    setter.mockRestore()
    await reopened.find('.button-retry').trigger('click')
    expect(reopened.find('[role="alert"]').exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem('mark-export-page-options')).pageSize).toBe('Letter')
    reopened.unmount()
  })
})
