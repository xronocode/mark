import { shallowMount } from '@vue/test-utils'

vi.mock('../../assets/window-controls.js', () => ({
  closePath: 'M0,0'
}))

describe('prefComponents/common/titlebar.vue', () => {
  it('mounts without errors', async () => {
    const Titlebar = (await import('@/prefComponents/common/titlebar.vue')).default
    const wrapper = shallowMount(Titlebar)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.title-bar').exists()).toBe(true)
  })

  it('renders close button', async () => {
    const Titlebar = (await import('@/prefComponents/common/titlebar.vue')).default
    const wrapper = shallowMount(Titlebar)
    expect(wrapper.find('.frameless-titlebar-close').exists()).toBe(true)
  })

  it('sends IPC close on click', async () => {
    const Titlebar = (await import('@/prefComponents/common/titlebar.vue')).default
    const wrapper = shallowMount(Titlebar)
    await wrapper.find('.frameless-titlebar-close').trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::close-window')
  })
})
