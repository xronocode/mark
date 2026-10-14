/**
 * C-43 S1 — diffView baseline priority tests.
 *
 * The diff view must prefer Mark's own snapshot of the pre-reload content
 * over the stored (.before / git) baseline: with a snapshot for the active
 * tab, mt_diff_baseline is never invoked and the header names the snapshot
 * source with its timestamp; without one, the invoke path runs and the
 * header shows the neutral "Previous version" label.
 */

// FILE: tests/renderer/components/diff-view-snapshot.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-43 baseline priority in diffView.vue — latest per-tab snapshot wins over mt_diff_baseline — and the header source label for both paths.
//   SCOPE: createMergeView baseline resolution + baselineSideLabel; MergeView receives the snapshot as orig when present.
//   DEPENDS: src/renderer/src/components/editorWithTabs/diffView.vue, src/renderer/src/store/diffSnapshots.js (real module)
//   LINKS: .grace/changes/active/C-43 R-2/R-3; .grace/verification/runtime.xml V-M-011 scenario-38
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TAB_ID - the active tab id the editor-store mock reports.
//   FIXED_TAKEN_AT - deterministic snapshot timestamp (local 10:42:07).
//   mountComponent - mount diffView with CodeMirror MergeView mocked and captured.
//   mergeOptions - the options object the last MergeView call received.
//   baselineSide - the header span naming the baseline source.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-43 S1 initial priority tests.
// END_CHANGE_SUMMARY

import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { recordSnapshot, __resetDiffSnapshots } from '@/store/diffSnapshots'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

vi.mock('codemirror/lib/codemirror.css', () => ({}))
vi.mock('codemirror/addon/merge/merge.css', () => ({}))
vi.mock('codemirror/theme/railscasts.css', () => ({}))

vi.mock('codemirror/addon/merge/merge', () => ({}))

vi.mock('diff-match-patch', () => ({
  default: class DiffMatchPatch {}
}))

vi.mock('@/config', () => ({
  oneDarkThemes: ['one-dark'],
  railscastsThemes: ['railscasts']
}))

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({
    theme: 'default'
  })
}))

const TAB_ID = 'tab-1'
const tab = { id: TAB_ID, diffMode: true }
const notifyMock = vi.fn()
vi.mock('@/store/editor', () => ({ useEditorStore: () => ({ currentFile: tab }) }))
// Interpolation-aware t: named params ride along so tests can assert the
// {time} value the component passed.
vi.mock('@/i18n', () => ({
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
}))
vi.mock('@/util', () => ({ isOsx: true }))
vi.mock('@/services/notification', () => ({ default: { notify: notifyMock } }))

vi.mock('pinia', () => ({
  storeToRefs: (store) => {
    const { ref } = require('vue')
    return { theme: ref(store.theme) }
  }
}))

describe('diffView.vue — C-43 baseline priority', () => {
  // Local 10:42:07 — deterministic for the {time} formatting assertion.
  const FIXED_TAKEN_AT = new Date(2026, 9, 15, 10, 42, 7).getTime()

  let mergeViewMock

  beforeEach(() => {
    vi.clearAllMocks()
    __resetDiffSnapshots()
    window.CodeMirror = null
    tab.diffMode = true
    tab.id = TAB_ID

    mergeViewMock = vi.fn(() => ({
      editor: () => ({ setValue: vi.fn() }),
      wrap: document.createElement('div')
    }))
    window.CodeMirror = { MergeView: mergeViewMock }
    invokeMock.mockResolvedValue('stored baseline content')
  })

  const mountComponent = async (props = {}) => {
    const mod = await import('@/components/editorWithTabs/diffView.vue')
    const wrapper = mount(mod.default, {
      props: { markdown: '# Current', pathname: '/test.md', ...props },
      attachTo: document.createElement('div')
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  const mergeOptions = () => mergeViewMock.mock.calls[0][1]
  const baselineSide = (wrapper) => wrapper.findAll('.diff-side')[1]

  it('uses the tab snapshot as the baseline and never invokes mt_diff_baseline', async () => {
    recordSnapshot(TAB_ID, '# Before the external save', FIXED_TAKEN_AT)
    const wrapper = await mountComponent()

    expect(invokeMock).not.toHaveBeenCalled()
    expect(mergeOptions().orig).toBe('# Before the external save')
    expect(mergeOptions().value).toBe('# Current')
    // Header names the snapshot source with the 24h local timestamp.
    const label = baselineSide(wrapper).text()
    expect(label).toContain('diffView.baseline')
    expect(label).toContain('diffView.sourceSnapshot')
    expect(label).toContain('10:42:07')
    expect(tab.diffMode).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('falls back to mt_diff_baseline when this tab has no snapshot', async () => {
    const wrapper = await mountComponent()

    expect(invokeMock).toHaveBeenCalledWith('mt_diff_baseline', { path: '/test.md' })
    expect(mergeOptions().orig).toBe('stored baseline content')
    // Neutral label — the invoke result cannot distinguish .before from git.
    const label = baselineSide(wrapper).text()
    expect(label).toContain('diffView.sourcePrevious')
    expect(label).not.toContain('diffView.sourceSnapshot')
  })

  it('a snapshot of ANOTHER tab does not leak into this tab\u2019s diff', async () => {
    recordSnapshot('other-tab', '# someone else\u2019s pre-reload content', FIXED_TAKEN_AT)
    await mountComponent()

    expect(invokeMock).toHaveBeenCalledWith('mt_diff_baseline', { path: '/test.md' })
    expect(mergeOptions().orig).toBe('stored baseline content')
  })

  it('exits with a notice when the stored baseline invoke fails and no snapshot exists', async () => {
    invokeMock.mockRejectedValueOnce(new Error('not_a_git_repo'))
    await mountComponent()

    expect(tab.diffMode).toBe(false)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', message: expect.stringContaining('not_a_git_repo') })
    )
  })

  it('a snapshot keeps the diff alive even when the stored baseline would have failed', async () => {
    invokeMock.mockRejectedValue(new Error('not_a_git_repo'))
    recordSnapshot(TAB_ID, '# Before the external save', FIXED_TAKEN_AT)
    await mountComponent()

    expect(mergeOptions().orig).toBe('# Before the external save')
    expect(tab.diffMode).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
