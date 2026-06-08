import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, fallback) => fallback || key })
}))

const SAMPLE_EXT = {
  id: 'com.example.hello',
  name: 'Hello',
  version: '1.0.0',
  description: 'A test extension',
  enabled: true,
  healthy: true,
  capabilities: ['text.insert'],
  install_url: null
}

describe('ExtensionGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mountComponent = async (list = []) => {
    invokeMock.mockResolvedValueOnce(list)
    const mod = await import('@/components/extensionGallery/index.vue')
    const wrapper = mount(mod.default, {
      attachTo: document.createElement('div')
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('shows loading then extensions after mount', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_list')
    expect(wrapper.find('.ext-name').text()).toBe('Hello')
  })

  it('shows empty state when no extensions', async () => {
    const wrapper = await mountComponent([])
    expect(wrapper.find('.gallery-empty').exists()).toBe(true)
  })

  it('shows error when list fails', async () => {
    invokeMock.mockReset()
    invokeMock.mockRejectedValueOnce(new Error('IPC fail'))
    const mod = await import('@/components/extensionGallery/index.vue')
    const wrapper = mount(mod.default, { attachTo: document.createElement('div') })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.gallery-error').text()).toContain('IPC fail')
  })

  it('refresh calls discover then list', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockResolvedValueOnce(undefined)
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT, { ...SAMPLE_EXT, id: 'ext2', name: 'Ext2' }])
    await wrapper.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_discover')
    expect(wrapper.findAll('.ext-card').length).toBe(2)
  })

  it('refresh handles discover error', async () => {
    const wrapper = await mountComponent([])
    invokeMock.mockRejectedValueOnce(new Error('discover fail'))
    invokeMock.mockRejectedValueOnce(new Error('list also fails'))
    await wrapper.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.gallery-error').exists()).toBe(true)
  })

  it('toggle calls disable for enabled extension', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockResolvedValueOnce(undefined)
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_disable', { id: 'com.example.hello' })
  })

  it('toggle calls enable for disabled extension', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    invokeMock.mockResolvedValueOnce(undefined)
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_enable', { id: 'com.example.hello' })
  })

  it('toggle handles error', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockRejectedValueOnce(new Error('toggle fail'))
    invokeMock.mockRejectedValueOnce(new Error('list also fails'))
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(wrapper.find('.gallery-error').exists()).toBe(true)
  })

  it('shows offline badge and install link for unhealthy extension', async () => {
    const unhealthy = { ...SAMPLE_EXT, healthy: false, install_url: 'https://example.com' }
    const wrapper = await mountComponent([unhealthy])
    expect(wrapper.find('.ext-status-offline').exists()).toBe(true)
    expect(wrapper.find('.ext-install-btn').exists()).toBe(true)
  })

  it('shows capability tags', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(wrapper.find('.ext-cap-tag').text()).toBe('text.insert')
  })

  it('shows disabled badge for disabled extension', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    expect(wrapper.find('.ext-status-inactive').exists()).toBe(true)
  })
})
