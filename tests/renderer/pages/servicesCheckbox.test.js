/**
 * Tests for src/renderer/src/prefComponents/image/components/uploader/legalNoticesCheckbox.vue
 *
 * The assignment calls this "servicesCheckbox" — it maps to legalNoticesCheckbox.vue.
 */

import { shallowMount } from '@vue/test-utils'

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

import LegalNoticesCheckbox from '@/prefComponents/image/components/uploader/legalNoticesCheckbox.vue'

describe('LegalNoticesCheckbox.vue', () => {
  const mockService = {
    name: 'GitHub',
    agreedToLegalNotices: false,
    privacyUrl: 'https://github.com/privacy',
    tosUrl: 'https://github.com/terms',
    isGdprCompliant: true
  }

  let wrapper

  beforeEach(() => {
    wrapper = shallowMount(LegalNoticesCheckbox, {
      props: {
        uploaderService: mockService
      },
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          'el-checkbox': true
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders without errors', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('has pref-cb-legal-notices root class', () => {
    expect(wrapper.find('.pref-cb-legal-notices').exists()).toBe(true)
  })

  it('renders privacy and terms links', () => {
    const links = wrapper.findAll('.link')
    expect(links.length).toBe(2)
  })

  it('calls openExternal when link is clicked', async () => {
    const link = wrapper.findAll('.link')[0]
    await link.trigger('click')
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith('https://github.com/privacy')
  })

  it('renders GDPR warning for non-compliant services', () => {
    const nonGdpr = {
      ...mockService,
      isGdprCompliant: false
    }
    const w = shallowMount(LegalNoticesCheckbox, {
      props: { uploaderService: nonGdpr },
      global: {
        mocks: { $t: (key) => key },
        stubs: { 'el-checkbox': true }
      }
    })
    // The span for GDPR warning should be visible
    expect(w.text()).toContain('preferences.image.uploader.legalNotices.gdprWarning')
    w.unmount()
  })

  it('does not render GDPR warning for compliant services', () => {
    // Default mock service is GDPR compliant
    // The v-if="!uploaderService.isGdprCompliant" should hide the span
    const spans = wrapper.findAll('span')
    const gdprSpan = spans.find(
      (s) => s.text() === 'preferences.image.uploader.legalNotices.gdprWarning'
    )
    expect(gdprSpan).toBeUndefined()
  })
})
