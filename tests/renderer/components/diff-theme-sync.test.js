// FILE: tests/renderer/components/diff-theme-sync.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify live theme synchronization belongs to both editors of the mounted comparison.
//   SCOPE: Mounted diffView theme changes, pending baseline and teardown with stateful owned-editor fixtures.
//   DEPENDS: Vue Test Utils, Vue refs, actual Pinia storeToRefs and theme classification, mocked MergeView and IPC.
//   LINKS: M-031; V-M-031.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   preferences - Reactive theme source retained across the mounted component lifetime.
//   tab - Current comparison owner reported by the editor-store fixture.
//   invokeMock - Controlled baseline provider.
//   notifyMock - Observe unexpected comparison exits.
//   mounted - Owned wrappers and hosts to release after each test.
//   fixtures - Comparison instances and their two stateful editors.
//   previousCodeMirror - Restore the pre-test global after teardown.
//   createEditor - Small stateful editor API fixture preserving value and read-only options.
//   installMergeView - Install a factory that records comparison identity and both owned editors.
//   mountDiff - Mount the actual component and settle its initial baseline/import work.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-13 - Guard both owned theme options, comparison identity and lifecycle without baseline refetch or content writes.
// END_CHANGE_SUMMARY

import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const preferences = { theme: ref('paper') }
const tab = { id: 'diff-theme-owner', diffMode: true }
const invokeMock = vi.fn()
const notifyMock = vi.fn()
const mounted = []
const fixtures = []
let previousCodeMirror

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invokeMock(...args) }))
vi.mock('@/store/preferences', () => ({ usePreferencesStore: () => preferences }))
vi.mock('@/store/editor', () => ({ useEditorStore: () => ({ currentFile: tab }) }))
vi.mock('@/store/diffSnapshots', () => ({ latestSnapshot: () => null, openedSnapshot: () => null }))
vi.mock('@/services/notification', () => ({ default: { notify: (...args) => notifyMock(...args) } }))
vi.mock('@/i18n', () => ({ t: key => key }))
vi.mock('@/util', () => ({ isOsx: true }))
vi.mock('codemirror/lib/codemirror.css', () => ({}))
vi.mock('codemirror/addon/merge/merge.css', () => ({}))
vi.mock('codemirror/theme/railscasts.css', () => ({}))
vi.mock('codemirror/addon/merge/merge', () => ({}))

const createEditor = (theme, value) => {
  const options = { theme, readOnly: true }
  return {
    options, value,
    getOption: key => options[key],
    setOption: vi.fn((key, next) => { options[key] = next }),
    setValue: vi.fn()
  }
}

const installMergeView = () => {
  window.CodeMirror = {
    MergeView: vi.fn((container, options) => {
      const current = createEditor(options.theme, options.value)
      const original = createEditor(options.theme, options.orig)
      const wrap = document.createElement('div')
      container.append(wrap)
      const view = { wrap, editor: () => current, rightOriginal: () => original }
      fixtures.push({ current, original, view })
      return view
    })
  }
}

const mountDiff = async () => {
  const { default: DiffView } = await import('@/components/editorWithTabs/diffView.vue')
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = mount(DiffView, { props: { markdown: '# Current', pathname: '/tmp/diff-theme.md' }, attachTo: host })
  mounted.push({ wrapper, host })
  await flushPromises()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  previousCodeMirror = window.CodeMirror
  preferences.theme.value = 'paper'
  tab.diffMode = true
  invokeMock.mockReset().mockResolvedValue('# Original')
  notifyMock.mockReset()
  fixtures.length = 0
  installMergeView()
})

afterEach(() => {
  for (const { wrapper, host } of mounted.splice(0)) {
    wrapper?.unmount()
    host.remove()
  }
  window.CodeMirror = previousCodeMirror
})

describe('diff-owned live theme synchronization', () => {
  it('updates both options through all existing theme families without rebuilding or changing comparison state', async () => {
    const unrelated = createEditor('default', '# Unrelated')
    const unrelatedHost = document.createElement('div')
    unrelatedHost.className = 'CodeMirror'
    unrelatedHost.CodeMirror = unrelated
    document.body.prepend(unrelatedHost)
    mounted.push({ wrapper: null, host: unrelatedHost })
    await mountDiff()
    const { current, original, view } = fixtures[0]
    for (const [theme, expected] of [['ink', 'railscasts'], ['one-dark', 'one-dark'], ['paper', 'default']]) {
      preferences.theme.value = theme
      await nextTick()
      expect([current.getOption('theme'), original.getOption('theme')]).toEqual([expected, expected])
      expect(fixtures[0].view).toBe(view)
      expect(window.CodeMirror.MergeView).toHaveBeenCalledTimes(1)
      expect(invokeMock).toHaveBeenCalledTimes(1)
      expect([current.value, original.value]).toEqual(['# Current', '# Original'])
      expect([current.getOption('readOnly'), original.getOption('readOnly')]).toEqual([true, true])
      expect(current.setValue).not.toHaveBeenCalled()
      expect(original.setValue).not.toHaveBeenCalled()
      expect(unrelated.getOption('theme')).toBe('default')
      expect(tab.diffMode).toBe(true)
      expect(notifyMock).not.toHaveBeenCalled()
    }
  })

  it('constructs with the latest theme when a change arrives while the baseline is pending', async () => {
    let resolveBaseline
    invokeMock.mockReturnValueOnce(new Promise(resolve => { resolveBaseline = resolve }))
    await mountDiff()
    expect(fixtures).toHaveLength(0)
    preferences.theme.value = 'ink'
    await nextTick()
    expect(window.CodeMirror.MergeView).not.toHaveBeenCalled()
    resolveBaseline('# Original')
    await flushPromises()
    expect(fixtures).toHaveLength(1)
    expect([fixtures[0].current.getOption('theme'), fixtures[0].original.getOption('theme')]).toEqual(['railscasts', 'railscasts'])
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('does not update retired editors after unmount', async () => {
    const wrapper = await mountDiff()
    const { current, original, view } = fixtures[0]
    wrapper.unmount()
    mounted.pop().host.remove()
    expect(view.wrap.parentNode).toBeNull()
    preferences.theme.value = 'ink'
    await nextTick()
    expect(current.setOption).not.toHaveBeenCalled()
    expect(original.setOption).not.toHaveBeenCalled()
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })
})
