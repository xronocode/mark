/**
 * C-68 T-001 — ⌘D always has something to compare.
 *
 * Outside git (mt_diff_baseline rejects with the raw Rust error, e.g.
 * «Not a git repository») the «opened» snapshot — the content the tab
 * last loaded from disk — is the baseline of last resort, and the header
 * names it («Since you opened the file · time»). When even that cannot
 * produce a diff (no baseline at all, or a baseline equal to the current
 * markdown) the view exits with a calm info notice — the raw backend
 * error never reaches the UI.
 */

// FILE: tests/renderer/components/diff-opened-baseline.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-68 baseline priority chain in diffView.vue — external snapshot → stored backend baseline → opened snapshot — plus the calm info notices for no-baseline, equal-content and untitled cases (raw backend errors never surface).
//   SCOPE: Baseline priority, calm notices, path/tab supersession, exit/unmount cancellation and selected MergeView contents.
//   DEPENDS: src/renderer/src/components/editorWithTabs/diffView.vue, src/renderer/src/store/diffSnapshots.js (real module)
//   LINKS: .grace/changes/active/C-68 R-2/R-3/R-4; .grace/verification/runtime.xml V-M-011 scenario-67
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TAB_ID - owning tab identity for baseline fixtures.
//   tab - reactive active-tab double for asynchronous isolation checks.
//   wrappers - mounted views unmounted after each case.
//   invokeMock - controllable baseline requests, including deferred completions.
//   notifyMock - captures calm notices and rejects stale-view notifications.
//   NOT_A_GIT_REPO - backend failure fixture; never displayed raw.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Reproduce and guard four async request/tab/view lifetime failures.
//   PREV: v1.0.0 - 2026-10-19 C-68 T-001 initial priority-chain and calm-notice tests.
// END_CHANGE_SUMMARY

import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import {
  recordSnapshot,
  recordOpenedSnapshot,
  __resetDiffSnapshots
} from '@/store/diffSnapshots'

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
const tab = reactive({ id: TAB_ID, diffMode: true })
const wrappers = []
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

// The raw Rust error an ordinary note outside git produces.
const NOT_A_GIT_REPO = 'not_a_git_repo: /tmp/test.md is not inside a git repository'

describe('diffView.vue — C-68 opened-baseline fallback', () => {
  // Local 10:42:07 — deterministic for the {time} formatting assertion.
  const FIXED_TAKEN_AT = new Date(2026, 9, 19, 10, 42, 7).getTime()

  let mergeViewMock

  afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

  beforeEach(() => {
    vi.clearAllMocks()
    __resetDiffSnapshots()
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
    wrappers.push(wrapper)
    await flushPromises()
    await nextTick()
    return wrapper
  }

  const mergeOptions = () => mergeViewMock.mock.calls[0][1]
  const baselineSide = (wrapper) => wrapper.findAll('.diff-side')[1]
  const noticeCall = () => notifyMock.mock.calls[0]?.[0] ?? null

  it('a late backend failure cannot close or notify a different active tab', async () => {
    let rejectOld
    invokeMock.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject }))
    invokeMock.mockResolvedValue('# Other baseline')
    await mountComponent()
    tab.id = 'other-tab'
    await nextTick()
    await flushPromises()
    rejectOld(new Error(NOT_A_GIT_REPO))
    await flushPromises()
    expect(tab.diffMode).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('an older pathname response cannot overwrite the latest comparison', async () => {
    let resolveOld
    invokeMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    invokeMock.mockResolvedValueOnce('# Latest baseline')
    const wrapper = await mountComponent()
    await wrapper.setProps({ pathname: '/latest.md', markdown: '# Latest current' })
    await flushPromises()
    resolveOld('# Obsolete baseline')
    await flushPromises()
    expect(mergeViewMock).toHaveBeenCalledTimes(1)
    expect(mergeOptions().orig).toBe('# Latest baseline')
    expect(mergeOptions().value).toBe('# Latest current')
  })

  it('an unmounted comparison ignores its pending failure', async () => {
    let rejectOld
    invokeMock.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject }))
    const wrapper = await mountComponent()
    wrapper.unmount()
    rejectOld(new Error(NOT_A_GIT_REPO))
    await flushPromises()
    expect(tab.diffMode).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
    expect(mergeViewMock).not.toHaveBeenCalled()
  })

  it('closing a pending comparison does not resurrect it on a late response', async () => {
    let resolveOld
    invokeMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const wrapper = await mountComponent()
    await wrapper.find('.diff-exit').trigger('click')
    resolveOld('# Late baseline')
    await flushPromises()
    expect(tab.diffMode).toBe(false)
    expect(mergeViewMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('a backend error falls back to the opened snapshot with its source label', async () => {
    invokeMock.mockRejectedValueOnce(new Error(NOT_A_GIT_REPO))
    recordOpenedSnapshot(TAB_ID, '# At open', FIXED_TAKEN_AT)
    const wrapper = await mountComponent({ markdown: '# Edited' })

    // The backend was tried (priority 2)…
    expect(invokeMock).toHaveBeenCalledWith('mt_diff_baseline', { path: '/test.md' })
    // …its error was swallowed into the opened fallback (priority 3)…
    expect(mergeOptions().orig).toBe('# At open')
    expect(mergeOptions().value).toBe('# Edited')
    expect(tab.diffMode).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
    // …and the header names the opened source with the 24h local timestamp.
    const label = baselineSide(wrapper).text()
    expect(label).toContain('diffView.baseline')
    expect(label).toContain('diffView.sourceOpened')
    expect(label).toContain('10:42:07')
    expect(label).not.toContain('diffView.sourcePrevious')
  })

  it('the external-change ring still outranks the opened slot', async () => {
    invokeMock.mockRejectedValue(new Error(NOT_A_GIT_REPO))
    recordOpenedSnapshot(TAB_ID, '# After the reload landed', FIXED_TAKEN_AT + 1_000)
    recordSnapshot(TAB_ID, '# Before the external save', FIXED_TAKEN_AT)
    await mountComponent()

    expect(mergeOptions().orig).toBe('# Before the external save')
    // invoke never ran: the ring wins without touching the backend.
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('a stored backend baseline still outranks the opened slot', async () => {
    recordOpenedSnapshot(TAB_ID, '# At open', FIXED_TAKEN_AT)
    const wrapper = await mountComponent({ markdown: '# Edited' })

    expect(mergeOptions().orig).toBe('stored baseline content')
    const label = baselineSide(wrapper).text()
    expect(label).toContain('diffView.sourcePrevious')
    expect(label).not.toContain('diffView.sourceOpened')
  })

  it('a backend error with no opened snapshot: calm info notice, never the raw error', async () => {
    invokeMock.mockRejectedValueOnce(NOT_A_GIT_REPO)
    await mountComponent()

    expect(tab.diffMode).toBe(false)
    expect(mergeViewMock).not.toHaveBeenCalled()
    const notice = noticeCall()
    expect(notice).toEqual(
      expect.objectContaining({ type: 'info', message: 'diffView.noChanges' })
    )
    expect(JSON.stringify(notifyMock.mock.calls)).not.toContain('not_a_git_repo')
  })

  it('an opened snapshot of ANOTHER tab does not leak into this tab\u2019s fallback', async () => {
    invokeMock.mockRejectedValueOnce(new Error(NOT_A_GIT_REPO))
    recordOpenedSnapshot('other-tab', '# someone else\u2019s opened content', FIXED_TAKEN_AT)
    await mountComponent()

    expect(tab.diffMode).toBe(false)
    expect(noticeCall()).toEqual(
      expect.objectContaining({ type: 'info', message: 'diffView.noChanges' })
    )
  })

  it('an opened baseline equal to the current markdown: no diff, calm notice', async () => {
    invokeMock.mockRejectedValueOnce(new Error(NOT_A_GIT_REPO))
    recordOpenedSnapshot(TAB_ID, '# Untouched', FIXED_TAKEN_AT)
    await mountComponent({ markdown: '# Untouched' })

    expect(tab.diffMode).toBe(false)
    expect(mergeViewMock).not.toHaveBeenCalled()
    expect(noticeCall()).toEqual(
      expect.objectContaining({ type: 'info', message: 'diffView.noChanges' })
    )
  })

  it('a stored baseline equal to the current markdown: no diff, calm notice', async () => {
    invokeMock.mockResolvedValueOnce('# Untouched')
    await mountComponent({ markdown: '# Untouched' })

    expect(tab.diffMode).toBe(false)
    expect(mergeViewMock).not.toHaveBeenCalled()
    expect(noticeCall()).toEqual(
      expect.objectContaining({ type: 'info', message: 'diffView.noChanges' })
    )
  })

  it('a ring snapshot equal to the current markdown: no diff, calm notice', async () => {
    recordSnapshot(TAB_ID, '# Back to the same', FIXED_TAKEN_AT)
    await mountComponent({ markdown: '# Back to the same' })

    expect(invokeMock).not.toHaveBeenCalled()
    expect(tab.diffMode).toBe(false)
    expect(mergeViewMock).not.toHaveBeenCalled()
    expect(noticeCall()).toEqual(
      expect.objectContaining({ type: 'info', message: 'diffView.noChanges' })
    )
  })

  it('an untitled tab: nothingToCompare notice, backend never asked', async () => {
    await mountComponent({ pathname: '' })

    expect(tab.diffMode).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(mergeViewMock).not.toHaveBeenCalled()
    expect(noticeCall()).toEqual(
      expect.objectContaining({ type: 'info', message: 'diffView.nothingToCompare' })
    )
  })
})
