/**
 * Deep tests for src/renderer/src/prefComponents/common/fontTextBox/index.vue
 *
 * Targets: querySearch, handleSelect, handleMoreClick, props.value watcher,
 * onMounted font loading, font filtering.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' },
  ArrowDown: { template: '<svg/>' }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

import FontTextBox from '@/prefComponents/common/fontTextBox/index.vue'

describe('fontTextBox/index.vue – deep tests', () => {
  let wrapper
  const onChangeMock = vi.fn()

  function createWrapper(props = {}) {
    // Setup font list mock
    window.electron.fonts = {
      list: vi.fn(async () => [
        '"Arial"',
        '"Helvetica Neue"',
        '"Courier New"',
        '"Menlo"',
        '"Monaco"',
        '"Fira Code"'
      ])
    }

    return shallowMount(FontTextBox, {
      props: {
        description: 'Font family',
        value: 'Arial',
        onChange: onChangeMock,
        ...props
      },
      global: {
        plugins: [i18n],
        stubs: {
          ElAutocomplete: true,
          InfoFilled: true,
          ArrowDown: true
        }
      }
    })
  }

  beforeEach(() => {
    onChangeMock.mockClear()
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  // ── onMounted ────────────────────────────────────────────────────────

  it('onMounted loads and cleans font names', async () => {
    wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.vm.fontFamilies).toHaveLength(6)
    expect(wrapper.vm.fontFamilies).toContain('Arial')
    expect(wrapper.vm.fontFamilies).toContain('Helvetica Neue')
    expect(wrapper.vm.fontFamilies).toContain('Courier New')
    // Quotes should be stripped
    expect(wrapper.vm.fontFamilies.every((f) => !f.includes('"'))).toBe(true)
  })

  // ── querySearch ──────────────────────────────────────────────────────

  it('querySearch returns all fonts when query is empty', async () => {
    wrapper = createWrapper()
    await flushPromises()

    const cb = vi.fn()
    wrapper.vm.querySearch('', cb)
    expect(cb).toHaveBeenCalledWith(wrapper.vm.fontFamilies)
  })

  it('querySearch returns all fonts when query matches defaultValue', async () => {
    wrapper = createWrapper({ value: 'Arial' })
    await flushPromises()

    const cb = vi.fn()
    wrapper.vm.querySearch('Arial', cb)
    // When queryString equals defaultValue, show all results
    expect(cb).toHaveBeenCalledWith(wrapper.vm.fontFamilies)
  })

  it('querySearch filters fonts by prefix (case insensitive)', async () => {
    wrapper = createWrapper()
    await flushPromises()

    const cb = vi.fn()
    wrapper.vm.querySearch('co', cb)
    const results = cb.mock.calls[0][0]
    expect(results).toContain('Courier New')
    expect(results).not.toContain('Arial')
  })

  it('querySearch returns empty when no fonts match', async () => {
    wrapper = createWrapper()
    await flushPromises()

    const cb = vi.fn()
    wrapper.vm.querySearch('zzzzz', cb)
    expect(cb.mock.calls[0][0]).toHaveLength(0)
  })

  // ── handleSelect ─────────────────────────────────────────────────────

  it('handleSelect calls onChange for valid font name', () => {
    wrapper = createWrapper()
    wrapper.vm.handleSelect('Arial')
    expect(onChangeMock).toHaveBeenCalledWith('Arial')
    expect(wrapper.vm.selectValue).toBe('Arial')
  })

  it('handleSelect calls onChange for font name with spaces', () => {
    wrapper = createWrapper()
    wrapper.vm.handleSelect('Helvetica Neue')
    expect(onChangeMock).toHaveBeenCalledWith('Helvetica Neue')
  })

  it('handleSelect calls onChange for font name with hyphens', () => {
    wrapper = createWrapper()
    wrapper.vm.handleSelect('Fira-Code')
    expect(onChangeMock).toHaveBeenCalledWith('Fira-Code')
  })

  it('handleSelect does not call onChange for invalid font names', () => {
    wrapper = createWrapper()
    onChangeMock.mockClear()
    // Leading space is invalid per the regex
    wrapper.vm.handleSelect(' Invalid')
    expect(onChangeMock).not.toHaveBeenCalled()
  })

  it('handleSelect does not call onChange for empty string', () => {
    wrapper = createWrapper()
    onChangeMock.mockClear()
    wrapper.vm.handleSelect('')
    expect(onChangeMock).not.toHaveBeenCalled()
  })

  // ── handleMoreClick ──────────────────────────────────────────────────

  it('handleMoreClick opens external URL when more is string', () => {
    wrapper = createWrapper({ more: 'https://fonts.google.com' })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith('https://fonts.google.com')
  })

  it('handleMoreClick does nothing when more is not a string', () => {
    wrapper = createWrapper({ more: undefined })
    const callCount = window.electron.shell.openExternal.mock.calls.length
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal.mock.calls.length).toBe(callCount)
  })

  // ── props.value watcher ──────────────────────────────────────────────

  it('watcher updates selectValue when props.value changes', async () => {
    wrapper = createWrapper({ value: 'Arial' })
    expect(wrapper.vm.selectValue).toBe('Arial')

    await wrapper.setProps({ value: 'Menlo' })
    expect(wrapper.vm.selectValue).toBe('Menlo')
  })

  it('watcher does not update when same value is set', async () => {
    wrapper = createWrapper({ value: 'Arial' })
    await wrapper.setProps({ value: 'Arial' })
    expect(wrapper.vm.selectValue).toBe('Arial')
  })

  // ── disable prop ─────────────────────────────────────────────────────

  it('applies ag-underdevelop class when disabled', () => {
    wrapper = createWrapper({ disable: true })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })

  it('does not apply ag-underdevelop when not disabled', () => {
    wrapper = createWrapper({ disable: false })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(false)
  })

  // ── description rendering ────────────────────────────────────────────

  it('renders description text', () => {
    wrapper = createWrapper({ description: 'Code Font' })
    expect(wrapper.find('.description').text()).toContain('Code Font')
  })
})
