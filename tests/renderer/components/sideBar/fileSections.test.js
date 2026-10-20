// FILE: tests/renderer/components/sideBar/fileSections.test.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-002 unit tests for components/sideBar/fileSections.vue — Recent/Pinned sections render with order + cap, missing rows greyed with Remove, unpin/remove actions, click-to-open (tab select vs mt::open-file), collapse persistence, and drag-reorder dispatch to the pinned store; C-51 T-013 pins the icon-less regular-weight rows.
//   SCOPE: real mount over the mocked @tauri-apps/api/core invoke (recent list, prefs, fs stat) with ChromeIcon stubbed.
//   DEPENDS: components/sideBar/fileSections.vue, store/{editor,pinned}, tests/renderer/setup.ts.
//   LINKS: .grace/changes/archive/C-51 T-002/T-013; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   flush - settle the component's async onMounted chain.
//   i18n - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-19 C-67: Clear Recent broom pins (clear call, empty section, failure path).
//   v1.1.0 - 2026-10-17 C-51 T-013: rows render no
//   file-type icon (the name span leads the row) — the FileIcon stub and
//   the muya fileIcons mock are gone with the component's own import.
//   v1.0.0 - 2026-10-16 C-51 T-002: initial tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../../pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { invoke } from '@tauri-apps/api/core'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      sideBar: {
        tree: {
          recentFiles: 'Recent',
          clearRecent: 'Clear Recent',
          pinnedFiles: 'Pinned',
          remove: 'Remove',
          unpin: 'Unpin'
        }
      }
    }
  }
})

const flush = () => flushPromises()

describe('components/sideBar/fileSections.vue (C-51 T-002)', () => {
  let recentList
  let pinnedList
  let missingPaths
  let FileSections
  let usePinnedStore

  const installInvoke = () => {
    // ipcInvoke translates 'mt::xxx::yyy' to 'mt_xxx_yy' before invoke.
    invoke.mockImplementation(async (cmd, args) => {
      if (cmd === 'mt_recent_list') return [...recentList]
      if (cmd === 'mt_prefs_get') {
        if (args?.key === 'pinnedFiles') return [...pinnedList]
        return null
      }
      if (cmd === 'mt_fs_stat') {
        if (missingPaths.includes(args?.path)) {
          // Tauri rejects with the structured error object, not an Error.
          throw { code: 'MT_FS_NOT_FOUND', message: 'No such file', command: 'mt::fs::stat' }
        }
        return { isFile: true, isDirectory: false, size: 1, mtimeMs: 0 }
      }
      return undefined
    })
  }

  beforeEach(async () => {
    recentList = ['/tmp/z-newest.md', '/tmp/y-second.md']
    pinnedList = ['/tmp/pin-a.md', '/tmp/pin-b.md', '/tmp/pin-gone.md']
    missingPaths = ['/tmp/pin-gone.md']
    installInvoke()
    setupTestPinia()
    FileSections = (await import('@/components/sideBar/fileSections.vue')).default
    ;({ usePinnedStore } = await import('@/store/pinned'))
  })

  const mountSections = async () => {
    const wrapper = mount(FileSections, {
      attachTo: document.body,
      global: {
        plugins: [setupTestPinia(), i18n],
        stubs: { ChromeIcon: true }
      }
    })
    // recent load → pinned load → per-path stat checks: several async hops.
    for (let i = 0; i < 6; i++) await flush()
    return wrapper
  }

  it('renders Recent rows newest-first with the localized header', async () => {
    const wrapper = await mountSections()
    const recent = wrapper.find('[data-section="recent"]')
    expect(recent.exists()).toBe(true)
    expect(recent.find('.section-title span').text()).toBe('Recent')
    const names = recent.findAll('.section-file-name').map((n) => n.text())
    expect(names).toEqual(['z-newest.md', 'y-second.md'])
  })

  it('section rows carry no file-type icon — the name span leads the row (C-51 T-013)', async () => {
    const wrapper = await mountSections()
    expect(wrapper.find('.file-icon').exists()).toBe(false)
    for (const section of ['recent', 'pinned']) {
      const rows = wrapper.find(`[data-section="${section}"]`).findAll('.section-file')
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        const first = row.element.firstElementChild
        expect(first.tagName).toBe('SPAN')
        expect(first.className).toContain('section-file-name')
        expect(row.find('svg').exists()).toBe(false)
      }
    }
  })

  it('caps the Recent list at 10 entries', async () => {
    recentList = Array.from({ length: 14 }, (_, i) => `/tmp/f${i}.md`)
    const wrapper = await mountSections()
    expect(wrapper.find('[data-section="recent"]').findAll('.section-file')).toHaveLength(10)
    expect(wrapper.find('[data-section="recent"]').findAll('.section-file-name')[0].text()).toBe('f0.md')
  })

  it('renders Pinned rows in store order and greys missing ones with a Remove tooltip', async () => {
    const wrapper = await mountSections()
    const pinned = wrapper.find('[data-section="pinned"]')
    const names = pinned.findAll('.section-file-name').map((n) => n.text())
    expect(names).toEqual(['pin-a.md', 'pin-b.md', 'pin-gone.md'])

    const missingRow = pinned.findAll('.section-file').at(2)
    expect(missingRow.classes()).toContain('missing')
    expect(missingRow.find('.section-remove').attributes('title')).toBe('Remove')
    const presentRow = pinned.findAll('.section-file').at(0)
    expect(presentRow.classes()).not.toContain('missing')
    expect(presentRow.find('.section-remove').attributes('title')).toBe('Unpin')
  })

  it('Remove on a Recent row drops it through ipcRecent.remove', async () => {
    const wrapper = await mountSections()
    const row = wrapper.find('[data-section="recent"]').findAll('.section-file').at(1)
    await row.find('.section-remove').trigger('click')
    await flush()
    const removeCall = invoke.mock.calls.find((c) => c[0] === 'mt_recent_remove')
    expect(removeCall?.[1]).toEqual({ path: '/tmp/y-second.md' })
    const names = wrapper.find('[data-section="recent"]').findAll('.section-file-name').map((n) => n.text())
    expect(names).toEqual(['z-newest.md'])
  })

  it('C-67: the Recent header broom clears the whole list through ipcRecent.clear', async () => {
    const wrapper = await mountSections()
    const broom = wrapper.find('[data-section="recent"] .section-title .section-action')
    expect(broom.exists()).toBe(true)
    expect(broom.attributes('title')).toBe('Clear Recent')
    expect(broom.attributes('aria-label')).toBe('Clear Recent')
    await broom.trigger('click')
    await flush()
    expect(invoke.mock.calls.some((c) => c[0] === 'mt_recent_clear')).toBe(true)
    // The section hides once the list is empty (v-if on recentRows).
    expect(wrapper.find('[data-section="recent"]').exists()).toBe(false)
  })

  it('C-67: a failed backend clear still empties the local rows and warns', async () => {
    const wrapper = await mountSections()
    const base = invoke.getMockImplementation()
    invoke.mockImplementation(async (cmd, args) => {
      if (cmd === 'mt_recent_clear') throw new Error('boom')
      return base(cmd, args)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await wrapper.find('[data-section="recent"] .section-title .section-action').trigger('click')
    await flush()
    expect(wrapper.find('[data-section="recent"]').exists()).toBe(false)
    expect(warn).toHaveBeenCalledWith('[SideBar][clearRecent][BLOCK_RECENT_CLEARED] persisted=false', expect.any(Error))
    warn.mockRestore()
  })

  it('the pinned row X unpins (persists the shorter list)', async () => {
    const wrapper = await mountSections()
    const row = wrapper.find('[data-section="pinned"]').findAll('.section-file').at(0)
    await row.find('.section-remove').trigger('click')
    await flush()
    const pinnedStore = usePinnedStore()
    expect(pinnedStore.pinnedFiles).toEqual(['/tmp/pin-b.md', '/tmp/pin-gone.md'])
    const setCall = invoke.mock.calls.filter((c) => c[0] === 'mt_prefs_set' && c[1]?.key === 'pinnedFiles').pop()
    expect(setCall?.[1]?.value).toEqual(['/tmp/pin-b.md', '/tmp/pin-gone.md'])
  })

  it('clicking a row opens the file through mt::open-file; a missing row is inert', async () => {
    window.fileUtils.isSamePathSync = vi.fn(() => false)
    window.electron.ipcRenderer.send.mockClear()
    const wrapper = await mountSections()
    const rows = wrapper.find('[data-section="pinned"]').findAll('.section-file')
    await rows.at(0).trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::open-file', '/tmp/pin-a.md', {})
    window.electron.ipcRenderer.send.mockClear()
    await rows.at(2).trigger('click') // missing → nothing
    expect(window.electron.ipcRenderer.send).not.toHaveBeenCalled()
  })

  it('collapsing a section persists and hides its list', async () => {
    const wrapper = await mountSections()
    expect(wrapper.find('[data-section="recent"] .section-list').isVisible()).toBe(true)
    await wrapper.find('[data-section="recent"] .section-title').trigger('click')
    await flush()
    expect(wrapper.find('[data-section="recent"] .section-list').isVisible()).toBe(false)
    const setCall = invoke.mock.calls.find(
      (c) => c[0] === 'mt_prefs_set' && c[1]?.key === 'sideBarRecentCollapsed'
    )
    expect(setCall?.[1]?.value).toBe(true)
  })

  it('a stored collapsed section starts hidden', async () => {
    invoke.mockImplementation(async (cmd, args) => {
      if (cmd === 'mt_recent_list') return [...recentList]
      if (cmd === 'mt_prefs_get') {
        if (args?.key === 'pinnedFiles') return [...pinnedList]
        if (args?.key === 'sideBarPinnedCollapsed') return true
        return null
      }
      return { isFile: true, isDirectory: false, mtimeMs: 0 }
    })
    const wrapper = await mountSections()
    expect(wrapper.find('[data-section="pinned"] .section-list').isVisible()).toBe(false)
    expect(wrapper.find('[data-section="recent"] .section-list').isVisible()).toBe(true)
  })

  it('drag reorder routes through MOVE_PINNED and reorders the persisted list', async () => {
    const wrapper = await mountSections()
    const dataTransfer = { effectAllowed: '', setData: vi.fn() }
    wrapper.vm.onDragStart(0, { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('move')
    wrapper.vm.onDrop(2)
    await flush()
    const pinnedStore = usePinnedStore()
    expect(pinnedStore.pinnedFiles).toEqual(['/tmp/pin-b.md', '/tmp/pin-gone.md', '/tmp/pin-a.md'])
    const names = wrapper.find('[data-section="pinned"]').findAll('.section-file-name').map((n) => n.text())
    expect(names).toEqual(['pin-b.md', 'pin-gone.md', 'pin-a.md'])
  })

  it('sections hide entirely while their lists are empty', async () => {
    recentList = []
    pinnedList = []
    const wrapper = await mountSections()
    expect(wrapper.find('[data-section="recent"]').exists()).toBe(false)
    expect(wrapper.find('[data-section="pinned"]').exists()).toBe(false)
  })
})
