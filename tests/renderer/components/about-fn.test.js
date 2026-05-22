/**
 * Function coverage tests for about/index.vue
 * Covers: showDialog, onMounted/onBeforeUnmount lifecycle, computed refs
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/store', () => ({
  useMainStore: () => ({ appVersion: '2.0.0' })
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {
  about: {
    copyright: 'Copyright (c) {year}',
    copyrightContributors: 'Contributors'
  }
} } })

describe('about/index.vue — fn coverage', () => {
  let pinia, About, bus

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    About = (await import('@/components/about/index.vue')).default
  })

  const stubs = {
    ElDialog: { template: '<div><slot /></div>' },
    ElRow: { template: '<div><slot /></div>' },
    ElCol: { template: '<div><slot /></div>' }
  }

  const mount = () => shallowMount(About, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('showDialog opens the dialog', () => {
    const w = mount()
    expect(w.vm.showAboutDialog).toBe(false)
    const handler = bus.on.mock.calls.find(c => c[0] === 'aboutDialog')[1]
    handler()
    expect(w.vm.showAboutDialog).toBe(true)
    expect(bus.emit).toHaveBeenCalledWith('editor-blur')
  })

  it('mounts and registers bus listener', () => {
    mount()
    expect(bus.on).toHaveBeenCalledWith('aboutDialog', expect.any(Function))
  })

  it('unmount removes bus listener', () => {
    const w = mount()
    w.unmount()
    expect(bus.off).toHaveBeenCalledWith('aboutDialog', expect.any(Function))
  })

  it('renders name and version', () => {
    const w = mount()
    expect(w.text()).toContain('Mark')
    expect(w.text()).toContain('2.0.0')
  })

  it('renders copyright text', () => {
    const w = mount()
    expect(w.text()).toContain('Copyright')
  })

  it('renders contributors text', () => {
    const w = mount()
    expect(w.text()).toContain('Contributors')
  })

  it('showDialog can be called multiple times', () => {
    const w = mount()
    const handler = bus.on.mock.calls.find(c => c[0] === 'aboutDialog')[1]
    handler()
    handler()
    expect(w.vm.showAboutDialog).toBe(true)
  })
})
