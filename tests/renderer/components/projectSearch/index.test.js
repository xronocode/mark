import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'
import bus from '@/bus'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const mountComponent = async (pinia) => {
  const ProjectSearch = (await import('@/components/projectSearch/index.vue')).default
  return shallowMount(ProjectSearch, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        SearchResultItem: true,
        ElButton: true
      }
    }
  })
}

describe('projectSearch/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  afterEach(() => {
    bus.all.clear()
  })

  it('mounts hidden by default', async () => {
    const wrapper = await mountComponent(pinia)
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('opens when bus emits projectSearch', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-search-overlay').exists()).toBe(true)
    expect(wrapper.find('.search-input').exists()).toBe(true)
  })

  it('closes when bus emits projectSearch again (toggle)', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-search-overlay').exists()).toBe(true)

    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('closes when close button clicked', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    await wrapper.find('.panel-close').trigger('click')
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('closes on overlay click', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    await wrapper.find('.project-search-overlay').trigger('click')
    expect(wrapper.find('.project-search-overlay').exists()).toBe(false)
  })

  it('shows search options (Aa, \\b, .*)', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    const opts = wrapper.findAll('.opt')
    expect(opts.length).toBe(3)
  })

  it('toggles case sensitivity option', async () => {
    const { useSearchStore } = await import('@/store/search')
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    const initial = searchStore.isCaseSensitive
    await wrapper.findAll('.opt')[0].trigger('click')
    expect(searchStore.isCaseSensitive).toBe(!initial)
  })

  it('shows no-folder message when no project is open', async () => {
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.result-info').exists()).toBe(true)
  })

  it('updates keyword via input model', async () => {
    const { useSearchStore } = await import('@/store/search')
    const searchStore = useSearchStore()
    const wrapper = await mountComponent(pinia)
    bus.emit('projectSearch')
    await wrapper.vm.$nextTick()

    await wrapper.find('.search-input').setValue('test query')
    expect(searchStore.keyword).toBe('test query')
  })

  it('cleans up bus listener on unmount', async () => {
    const wrapper = await mountComponent(pinia)
    wrapper.unmount()

    const handlerCount = bus.all.get('projectSearch')?.length ?? 0
    expect(handlerCount).toBe(0)
  })
})
