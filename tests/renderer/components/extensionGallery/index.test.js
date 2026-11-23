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

describe('ExtensionGallery – extended coverage', () => {
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

  // ── Mount & basic rendering ──────────────────────────────────

  it('mounts and fetches extensions on mount', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_list')
    expect(wrapper.find('.extension-gallery').exists()).toBe(true)
    expect(wrapper.find('.ext-name').text()).toBe('Hello')
  })

  it('shows empty state when no extensions', async () => {
    const wrapper = await mountComponent([])
    expect(wrapper.find('.gallery-empty').exists()).toBe(true)
    expect(wrapper.find('.gallery-list').exists()).toBe(false)
  })

  // ── Error handling ───────────────────────────────────────────

  it('shows error when initial list call fails', async () => {
    invokeMock.mockReset()
    invokeMock.mockRejectedValueOnce(new Error('IPC fail'))
    const mod = await import('@/components/extensionGallery/index.vue')
    const wrapper = mount(mod.default, { attachTo: document.createElement('div') })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.gallery-error').text()).toContain('IPC fail')
  })

  // ── Refresh ──────────────────────────────────────────────────

  it('refresh calls discover then re-fetches list', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockResolvedValueOnce(undefined) // discover
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT, { ...SAMPLE_EXT, id: 'ext2', name: 'Ext2' }])
    await wrapper.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_discover')
    expect(wrapper.findAll('.ext-card').length).toBe(2)
  })

  it('refresh shows error when discover fails and list also fails', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockRejectedValueOnce(new Error('discover fail'))
    invokeMock.mockRejectedValueOnce(new Error('list also fails'))
    await wrapper.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.gallery-error').exists()).toBe(true)
  })

  it('refresh clears error when discover fails but list succeeds', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockRejectedValueOnce(new Error('discover fail'))
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT]) // list succeeds, clearing the error
    await wrapper.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    // error set by discover is cleared by successful list fetch
    expect(wrapper.find('.gallery-error').exists()).toBe(false)
  })

  it('refresh button disabled while loading', async () => {
    // Make invoke hang so we can check loading state
    let resolveList
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT]) // initial list
    const mod = await import('@/components/extensionGallery/index.vue')
    const wrapper = mount(mod.default, { attachTo: document.createElement('div') })
    await flushPromises()
    await nextTick()

    invokeMock.mockImplementationOnce(() => new Promise(r => { resolveList = r })) // discover hangs
    const btn = wrapper.find('.gallery-refresh-btn')
    await btn.trigger('click')
    await nextTick()

    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toBe('Refreshing...')

    resolveList()
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT])
    await flushPromises()
    await nextTick()
  })

  // ── Toggle ───────────────────────────────────────────────────

  it('toggle calls disable for an enabled extension', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockResolvedValueOnce(undefined) // disable
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_disable', { id: 'com.example.hello' })
  })

  it('toggle calls enable for a disabled extension', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    invokeMock.mockResolvedValueOnce(undefined) // enable
    invokeMock.mockResolvedValueOnce([SAMPLE_EXT])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_enable', { id: 'com.example.hello' })
  })

  it('toggle handles invoke error gracefully', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    invokeMock.mockRejectedValueOnce(new Error('toggle fail'))
    invokeMock.mockRejectedValueOnce(new Error('list fail'))
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(wrapper.find('.gallery-error').exists()).toBe(true)
  })

  it('surfaces the re-approval instruction when enable exceeds the pairing grant', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    // C-SEC-EXT-GRANT-BOUND: mt_ext_enable refuses into explicit
    // re-approval and the gallery error surface carries the instruction.
    invokeMock.mockRejectedValueOnce('ext_enable_reapproval_required')
    invokeMock.mockResolvedValueOnce([disabled])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_enable', { id: 'com.example.hello' })
    const error = wrapper.find('.gallery-error')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('pair again')
  })

  it('retries disable after a failed revocation instead of enabling', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    // C-EXT-TRUST-COHERENCE: the disable's revocation failed and the
    // refetched list shows the extension disabled — the retry toggle on
    // the same card must send Disable again, not Enable.
    invokeMock.mockRejectedValueOnce('ext_disable_revoke_failed')
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_disable', { id: 'com.example.hello' })
    invokeMock.mockClear()
    invokeMock.mockResolvedValueOnce(undefined) // retry disable
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_disable', { id: 'com.example.hello' })
  })

  it('clears the disable retry after a successful disable or an enabled listing', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    // A successful disable clears the retry state: the next toggle
    // follows the list flag again.
    invokeMock.mockResolvedValueOnce(undefined) // disable succeeds
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    invokeMock.mockClear()
    invokeMock.mockResolvedValueOnce(undefined) // enable succeeds
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: true }])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_enable', { id: 'com.example.hello' })

    // An enabled listing clears the retry state too: after the armed
    // retry state saw one enabled listing, the next toggle on a disabled
    // listing follows the flag again instead of retrying Disable.
    const wrapper2 = await mountComponent([SAMPLE_EXT])
    invokeMock.mockRejectedValueOnce('ext_disable_revoke_failed')
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper2.find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    invokeMock.mockResolvedValueOnce(undefined) // refresh: discover
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: true }]) // refresh: list
    await wrapper2.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    invokeMock.mockResolvedValueOnce(undefined) // refresh: discover
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }]) // refresh: list
    await wrapper2.find('.gallery-refresh-btn').trigger('click')
    await flushPromises()
    invokeMock.mockClear()
    invokeMock.mockResolvedValueOnce(undefined) // enable succeeds
    invokeMock.mockResolvedValueOnce([{ ...SAMPLE_EXT, enabled: false }])
    await wrapper2.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_enable', { id: 'com.example.hello' })
  })

  it('surfaces the revoke-pending instruction when enable is locked', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    // C-EXT-TRUST-COHERENCE: mt_ext_enable refuses into the explicit
    // revoke-pending instruction (disable again to retry the revocation,
    // pair afresh once it succeeds).
    invokeMock.mockRejectedValueOnce('ext_enable_revoke_pending')
    invokeMock.mockResolvedValueOnce([disabled])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledWith('mt_ext_enable', { id: 'com.example.hello' })
    const error = wrapper.find('.gallery-error')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('Disable the extension again')
  })

  // ── Template branch coverage ─────────────────────────────────

  it('shows offline badge and install link for unhealthy ext with install_url', async () => {
    const unhealthy = { ...SAMPLE_EXT, healthy: false, install_url: 'https://example.com' }
    const wrapper = await mountComponent([unhealthy])
    expect(wrapper.find('.ext-status-offline').exists()).toBe(true)
    expect(wrapper.find('.ext-install-btn').exists()).toBe(true)
    expect(wrapper.find('.ext-install-btn').attributes('href')).toBe('https://example.com')
  })

  it('shows offline badge but no install link when install_url missing', async () => {
    const unhealthy = { ...SAMPLE_EXT, healthy: false, install_url: null }
    const wrapper = await mountComponent([unhealthy])
    expect(wrapper.find('.ext-status-offline').exists()).toBe(true)
    expect(wrapper.find('.ext-install-btn').exists()).toBe(false)
  })

  it('shows active badge for enabled healthy extension', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(wrapper.find('.ext-status-active').exists()).toBe(true)
  })

  it('shows inactive badge for disabled extension', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    expect(wrapper.find('.ext-status-inactive').exists()).toBe(true)
  })

  it('shows capability tags', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(wrapper.find('.ext-cap-tag').text()).toBe('text.insert')
  })

  it('hides capabilities section when array is empty', async () => {
    const noCaps = { ...SAMPLE_EXT, capabilities: [] }
    const wrapper = await mountComponent([noCaps])
    expect(wrapper.find('.ext-capabilities').exists()).toBe(false)
  })

  it('hides description when empty', async () => {
    const noDesc = { ...SAMPLE_EXT, description: '' }
    const wrapper = await mountComponent([noDesc])
    expect(wrapper.find('.ext-description').exists()).toBe(false)
  })

  it('shows description when present', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(wrapper.find('.ext-description').text()).toBe('A test extension')
  })

  it('applies ext-disabled class on disabled extension card', async () => {
    const disabled = { ...SAMPLE_EXT, enabled: false }
    const wrapper = await mountComponent([disabled])
    expect(wrapper.find('.ext-card.ext-disabled').exists()).toBe(true)
  })

  it('applies ext-unhealthy class on unhealthy extension card', async () => {
    const unhealthy = { ...SAMPLE_EXT, healthy: false }
    const wrapper = await mountComponent([unhealthy])
    expect(wrapper.find('.ext-card.ext-unhealthy').exists()).toBe(true)
  })

  it('renders version string', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(wrapper.find('.ext-version').text()).toBe('v1.0.0')
  })

  it('renders extension id', async () => {
    const wrapper = await mountComponent([SAMPLE_EXT])
    expect(wrapper.find('.ext-id').text()).toBe('com.example.hello')
  })

  it('renders multiple extensions', async () => {
    const ext2 = { ...SAMPLE_EXT, id: 'com.example.world', name: 'World' }
    const wrapper = await mountComponent([SAMPLE_EXT, ext2])
    expect(wrapper.findAll('.ext-card').length).toBe(2)
  })
})
