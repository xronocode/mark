import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      tweet: {
        title: 'Tweet',
        feelingsQuestion: 'How do you feel?',
        feedbackQuestion: 'Feedback?',
        reportViaGithub: 'Report via GitHub',
        tweet: 'Tweet'
      }
    }
  }
})

describe('tweet/index.vue — deep coverage', () => {
  let pinia, bus, Tweet

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    Tweet = (await import('@/components/tweet/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(Tweet, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: { template: '<div><slot name="title" /><slot /></div>' }
        }
      }
    })

  // --- showDialog ---
  describe('showDialog', () => {
    it('opens dialog, clears value, emits editor-blur', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'tweetDialog')[1]

      wrapper.vm.value = 'old text'
      handler()

      expect(wrapper.vm.showTweetDialog).toBe(true)
      expect(wrapper.vm.value).toBe('')
      expect(bus.emit).toHaveBeenCalledWith('editor-blur')
    })
  })

  // --- faceClick ---
  describe('faceClick', () => {
    it('sets selectedFace to smile', () => {
      const wrapper = mountComponent()
      wrapper.vm.faceClick('smile')
      expect(wrapper.vm.selectedFace).toBe('smile')
    })

    it('sets selectedFace to sad', () => {
      const wrapper = mountComponent()
      wrapper.vm.faceClick('sad')
      expect(wrapper.vm.selectedFace).toBe('sad')
    })
  })

  // --- reportViaGithub ---
  describe('reportViaGithub', () => {
    it('opens external link', () => {
      const wrapper = mountComponent()
      wrapper.vm.reportViaGithub()

      expect(window.electron.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/xronocode/mark/issues/new'
      )
    })
  })

  // --- reportViaTwitter ---
  describe('reportViaTwitter', () => {
    it('does nothing when value is empty', () => {
      const wrapper = mountComponent()
      wrapper.vm.value = ''
      wrapper.vm.reportViaTwitter()

      expect(window.electron.shell.openExternal).not.toHaveBeenCalled()
    })

    it('opens twitter intent with smile hashtags', () => {
      const wrapper = mountComponent()
      wrapper.vm.value = 'I love it'
      wrapper.vm.selectedFace = 'smile'

      wrapper.vm.reportViaTwitter()

      const callArg = window.electron.shell.openExternal.mock.calls[0][0]
      expect(callArg).toContain('twitter.com/intent/tweet')
      expect(callArg).toContain('via=marktextme')
      expect(callArg).toContain('text=I love it')
      expect(callArg).toContain('hashtags=markEditor')
      expect(wrapper.vm.showTweetDialog).toBe(false)
    })

    it('opens twitter intent without hashtags when sad', () => {
      const wrapper = mountComponent()
      wrapper.vm.value = 'Not great'
      wrapper.vm.selectedFace = 'sad'

      wrapper.vm.reportViaTwitter()

      const callArg = window.electron.shell.openExternal.mock.calls[0][0]
      expect(callArg).not.toContain('hashtags')
      expect(wrapper.vm.showTweetDialog).toBe(false)
    })
  })

  // --- unmount ---
  describe('unmount', () => {
    it('unregisters tweetDialog bus listener', () => {
      const wrapper = mountComponent()
      wrapper.unmount()
      expect(bus.off).toHaveBeenCalledWith('tweetDialog', expect.any(Function))
    })
  })
})
