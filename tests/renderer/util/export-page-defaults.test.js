// FILE: tests/renderer/util/export-page-defaults.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify future-export page defaults without changing the legacy appearance record.
//   SCOPE: Typed field hydration, independent fallbacks, fresh cross-realm reads and honest storage failures.
//   DEPENDS: Vitest, browser Storage, util/exportPageDefaults.js.
//   LINKS: .grace/graph/features.xml M-072; .grace/verification/features.xml V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   FACTORY - Independent specification oracle for the five page defaults.
//   STORAGE_KEY - Complementary record that must not replace appearance storage.
//   loadSubject - Load a fresh helper realm after the test resets modules.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-EXPORT-SETTINGS-SECTION: verify page-default persistence and cross-window freshness.
// END_CHANGE_SUMMARY

const FACTORY = {
  pageSize: 'A4', pageSizeWidth: 210, pageSizeHeight: 297,
  isLandscape: false, htmlTitle: ''
}
const STORAGE_KEY = 'mark-export-page-options'
const loadSubject = () => import('@/util/exportPageDefaults.js')

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  window.localStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

it('returns independent factory values without creating a stored record', async () => {
  const { DEFAULT_EXPORT_PAGE_OPTIONS, getRememberedExportPageOptions } = await loadSubject()
  expect(DEFAULT_EXPORT_PAGE_OPTIONS()).toEqual(FACTORY)
  const first = DEFAULT_EXPORT_PAGE_OPTIONS()
  first.pageSizeWidth = 999
  expect(getRememberedExportPageOptions()).toEqual(FACTORY)
  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
})

it('remembers all five explicitly configured fields and leaves legacy appearance bytes intact', async () => {
  const appearance = '{"theme":"ink","header":{"center":"keep"}}'
  window.localStorage.setItem('mark-last-print-options', appearance)
  const page = { pageSize: 'custom', pageSizeWidth: 420.5, pageSizeHeight: 600, isLandscape: true, htmlTitle: 'Отчёт <&> 日本語' }
  const helper = await loadSubject()
  expect(helper.rememberExportPageOptions(page)).toBe(true)
  expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(page)
  expect(helper.getRememberedExportPageOptions()).toEqual(page)
  expect(window.localStorage.getItem('mark-last-print-options')).toBe(appearance)
})

it('reads another realm’s current record instead of retaining its module-load snapshot', async () => {
  const first = await loadSubject()
  first.rememberExportPageOptions({ ...FACTORY, isLandscape: true })
  expect(first.getRememberedExportPageOptions().isLandscape).toBe(true)
  vi.resetModules()
  const other = await loadSubject()
  other.rememberExportPageOptions({ ...FACTORY, pageSize: 'Letter', htmlTitle: 'Second window' })
  expect(first.getRememberedExportPageOptions()).toEqual({ ...FACTORY, pageSize: 'Letter', htmlTitle: 'Second window' })
})

it.each(['null', '[]', '42', '"page"', '{broken'])('falls back for invalid record shape %s', async (raw) => {
  window.localStorage.setItem(STORAGE_KEY, raw)
  expect((await loadSubject()).getRememberedExportPageOptions()).toEqual(FACTORY)
})

it('defaults invalid fields independently while preserving valid fields and dropping unknown keys', async () => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    pageSize: 'custom', pageSizeWidth: '420', pageSizeHeight: 999,
    isLandscape: 'false', htmlTitle: 7, arbitrary: 'discard'
  }))
  expect((await loadSubject()).getRememberedExportPageOptions()).toEqual({ ...FACTORY, pageSize: 'custom', pageSizeHeight: 999 })
})

it.each(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid', 'custom'])('retains the existing page-size value %s', async (pageSize) => {
  const helper = await loadSubject()
  helper.rememberExportPageOptions({ ...FACTORY, pageSize })
  expect(helper.getRememberedExportPageOptions().pageSize).toBe(pageSize)
})

it('accepts boundary dimensions and refuses out-of-range, non-finite and mistyped values', async () => {
  const helper = await loadSubject()
  helper.rememberExportPageOptions({ ...FACTORY, pageSizeWidth: 10, pageSizeHeight: 2000 })
  expect(helper.getRememberedExportPageOptions()).toEqual({ ...FACTORY, pageSizeWidth: 10, pageSizeHeight: 2000 })
  helper.rememberExportPageOptions({ pageSize: 'unknown', pageSizeWidth: Infinity, pageSizeHeight: 9, isLandscape: 1, htmlTitle: null })
  expect(helper.getRememberedExportPageOptions()).toEqual(FACTORY)
})

it('does not remember inherited fields or caller mutations', async () => {
  const helper = await loadSubject()
  const input = Object.assign(Object.create({ isLandscape: true }), { pageSize: 'Letter' })
  helper.rememberExportPageOptions(input)
  input.pageSize = 'A3'
  const read = helper.getRememberedExportPageOptions()
  expect(read).toEqual({ ...FACTORY, pageSize: 'Letter' })
  read.htmlTitle = 'mutated'
  expect(helper.getRememberedExportPageOptions().htmlTitle).toBe('')
})

it('keeps the last known same-realm values during a read failure', async () => {
  const helper = await loadSubject()
  helper.rememberExportPageOptions({ ...FACTORY, pageSize: 'A5' })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked storage') })
  expect(helper.getRememberedExportPageOptions()).toEqual({ ...FACTORY, pageSize: 'A5' })
})

it('treats a corrupt current record as defaults rather than an unavailable-storage fallback', async () => {
  const helper = await loadSubject()
  helper.rememberExportPageOptions({ ...FACTORY, pageSize: 'A5' })
  window.localStorage.setItem(STORAGE_KEY, '{broken')
  expect(helper.getRememberedExportPageOptions()).toEqual(FACTORY)
})

it('reports a failed write and keeps unsaved values in that realm until a later successful save', async () => {
  const helper = await loadSubject()
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(helper.rememberExportPageOptions({ ...FACTORY, isLandscape: true })).toBe(false)
  expect(helper.getRememberedExportPageOptions()).toEqual({ ...FACTORY, isLandscape: true })
  set.mockRestore()
  expect(helper.rememberExportPageOptions(FACTORY)).toBe(true)
  expect(helper.getRememberedExportPageOptions()).toEqual(FACTORY)
  expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(FACTORY)
})

it('honors removal of a persisted record as a return to factory defaults', async () => {
  const helper = await loadSubject()
  helper.rememberExportPageOptions({ ...FACTORY, isLandscape: true })
  window.localStorage.removeItem(STORAGE_KEY)
  expect(helper.getRememberedExportPageOptions()).toEqual(FACTORY)
})
