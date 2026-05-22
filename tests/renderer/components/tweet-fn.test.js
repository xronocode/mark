/**
 * Function coverage tests for tweet/index.vue
 * Covers: showDialog, faceClick, reportViaGithub, reportViaTwitter
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {
  tweet: {
    title: 'Tweet', feelingsQuestion: 'How?', feedbackQuestion: 'What?',
    reportViaGithub: 'GitHub', tweet: 'Tweet'
  }
} } })

describe('tweet/index.vue — fn coverage', () => {
  let pinia, Tweet, bus

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    Tweet = (await import('@/components/tweet/index.vue')).default
  })

  const stubs = {
    ElDialog: { template: '<div><slot /><slot name="title" /></div>' }
  }

  const mount = () => shallowMount(Tweet, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('showDialog opens dialog and emits editor-blur', () => {
    const w = mount()
    const handler = bus.on.mock.calls.find(c => c[0] === 'tweetDialog')[1]
    handler()
    expect(w.vm.showTweetDialog).toBe(true)
    expect(bus.emit).toHaveBeenCalledWith('editor-blur')
  })

  it('faceClick sets selectedFace', () => {
    const w = mount()
    expect(w.vm.selectedFace).toBe('smile')
    w.vm.faceClick('sad')
    expect(w.vm.selectedFace).toBe('sad')
    w.vm.faceClick('smile')
    expect(w.vm.selectedFace).toBe('smile')
  })

  it('reportViaGithub opens external link', () => {
    const w = mount()
    w.vm.reportViaGithub()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('github.com')
    )
  })

  it('reportViaTwitter does nothing when value is empty', () => {
    const w = mount()
    w.vm.value = ''
    w.vm.reportViaTwitter()
    expect(window.electron.shell.openExternal).not.toHaveBeenCalled()
  })

  it('reportViaTwitter opens twitter link with value and smile hashtag', () => {
    const w = mount()
    w.vm.value = 'Great editor!'
    w.vm.selectedFace = 'smile'
    w.vm.reportViaTwitter()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('twitter.com')
    )
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('markEditor')
    )
    expect(w.vm.showTweetDialog).toBe(false)
  })

  it('reportViaTwitter opens twitter link without hashtag for sad', () => {
    const w = mount()
    w.vm.value = 'Needs improvement'
    w.vm.selectedFace = 'sad'
    w.vm.reportViaTwitter()
    const url = window.electron.shell.openExternal.mock.calls[0][0]
    expect(url).not.toContain('hashtags')
  })

  it('unmount removes bus listener', () => {
    const w = mount()
    w.unmount()
    expect(bus.off).toHaveBeenCalledWith('tweetDialog', expect.any(Function))
  })
})
