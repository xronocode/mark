// FILE: tests/renderer/components/updateNotice.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-66 update notice semantics through its
//            C-NOTIFICATION-SYSTEM rendering — store-driven visibility
//            injects/removes one sticky info entry in the shared stack with
//            the localized «Mark X.Y.Z is available» title and the three
//            Update / Later / Skip this version actions dispatching the
//            matching store actions — plus the presence of every C-66 key
//            in all ten locale tables.
//   SCOPE: src/renderer/src/components/updateNotice/index.vue behaviour
//          (via store/notifications state), store/autoUpdates dispatch
//          spies, and the static/locales C-66 key inventory.
//   DEPENDS: @vue/test-utils, tests/renderer/pinia, real i18n (en table;
//          ru pinned by swapping the locale messages), store/notifications.
//   LINKS: .grace/changes/archive/C-66/spec.xml R-2/R-6 (semantic owner,
//          corner C-8 of C-NOTIFICATION-SYSTEM);
//          .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-7, T-005/T-007.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountNotice - mount the logic component with a fresh Pinia.
//   queueNotice - flip the autoUpdates store into the post-check state.
//   LOCALES - the ten shipped locale codes.
//   readJson - read a locale table.
//   NOTICE_KEYS - the updateNotice.* key inventory.
//   UPDATES_KEYS - the preferences.general.updates key inventory.
//   SEARCH_KEY - the preferences.search.items key checked alongside.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-005/T-007:
//   the DOM pins (.ag-update-notice buttons) became stack-entry pins —
//   visibility sync, localized labels, action dispatch and Later-on-dismiss
//   through the shared card entry; the ten-locale C-66 inventory below is
//   carried over unchanged.
//   v1.0.0 - 2026-10-19 C-66 T-002/T-003: initial DOM-level pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'update-notice-id')
}))

import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationsStore } from '@/store/notifications'
import { i18n } from '@/i18n'
import ruTranslations from '../../../static/locales/ru.json'
import UpdateNotice from '@/components/updateNotice/index.vue'

// TOP-LEVEL helpers (TEST/LOCALS).
const mountNotice = () => mount(UpdateNotice, { attachTo: document.body })

const queueNotice = (store, version = '2.6.0') => {
  store.notice = {
    visible: true,
    version,
    status: { currentVersion: '2.5.0', available: true, latestVersion: version, statusNote: null }
  }
}

const LOCALES = ['en', 'ru', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'zh-CN', 'zh-TW']
const readJson = (name) =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../static/locales', name), 'utf8'))
const NOTICE_KEYS = ['title', 'update', 'later', 'skip']
const UPDATES_KEYS = ['autoCheck', 'autoCheckHelp']
const SEARCH_KEY = 'autoCheckUpdates'

describe('components/updateNotice — shared-card entry (C-NOTIFICATION-SYSTEM T-005)', () => {
  let updates, notifications

  beforeEach(() => {
    setupTestPinia()
    updates = useAutoUpdatesStore()
    notifications = useNotificationsStore()
    document.body.innerHTML = ''
  })

  it('is hidden until the launch check queues it (boot-race safe)', async () => {
    const wrapper = mountNotice()
    await flushPromises()
    expect(notifications.stack).toHaveLength(0)
    wrapper.unmount()
  })

  it('visible=true injects exactly one sticky info entry with the three actions', async () => {
    const wrapper = mountNotice()
    queueNotice(updates)
    await flushPromises()
    expect(notifications.stack).toHaveLength(1)
    const entry = notifications.stack[0]
    expect(entry.severity).toBe('info')
    expect(entry.source).toBe('update')
    expect(entry.sticky).toBe(true)
    expect(entry.title).toBe('Mark 2.6.0 is available')
    expect(entry.actions.map((a) => a.label)).toEqual(['Update', 'Later', 'Skip this version'])
    expect(entry.actions[0].style).toBe('primary')
    expect(entry.actions[2].style).toBe('quiet')
    wrapper.unmount()
  })

  it('re-syncs when the store replaces the notice object (queue → dismiss)', async () => {
    const wrapper = mountNotice()
    queueNotice(updates, '2.6.1')
    await flushPromises()
    expect(notifications.stack[0].title).toBe('Mark 2.6.1 is available')

    updates.DISMISS_NOTICE()
    await flushPromises()
    expect(notifications.stack).toHaveLength(0)
    wrapper.unmount()
  })

  it('Update dispatches INSTALL_UPDATE (the shared signed install flow)', async () => {
    const wrapper = mountNotice()
    queueNotice(updates)
    await flushPromises()
    const install = vi.spyOn(updates, 'INSTALL_UPDATE').mockResolvedValue()
    notifications.stack[0].actions[0].handler()
    expect(install).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('Later dispatches DISMISS_NOTICE; Skip dispatches SKIP_VERSION', async () => {
    const wrapper = mountNotice()
    queueNotice(updates)
    await flushPromises()
    const dismiss = vi.spyOn(updates, 'DISMISS_NOTICE')
    const skip = vi.spyOn(updates, 'SKIP_VERSION').mockResolvedValue()
    notifications.stack[0].actions[1].handler()
    expect(dismiss).toHaveBeenCalledTimes(1)
    notifications.stack[0].actions[2].handler()
    expect(skip).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('card dismissal (body click / Esc via onDismiss) maps to the Later semantics', async () => {
    const wrapper = mountNotice()
    queueNotice(updates)
    await flushPromises()
    const dismiss = vi.spyOn(updates, 'DISMISS_NOTICE')
    notifications.stack[0].onDismiss()
    expect(dismiss).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders the ru table when the locale switches (native copy, not a key dump)', async () => {
    i18n.global.setLocaleMessage('ru', ruTranslations)
    const prevLocale = i18n.global.locale.value
    i18n.global.locale.value = 'ru'

    const wrapper = mountNotice()
    queueNotice(updates)
    await flushPromises()
    expect(notifications.stack[0].title).toBe('Доступен Mark 2.6.0')
    expect(notifications.stack[0].actions.map((a) => a.label)).toEqual([
      'Обновить',
      'Позже',
      'Пропустить эту версию'
    ])

    i18n.global.locale.value = prevLocale
    wrapper.unmount()
  })
})

describe('updateNotice + updates switch — all ten locales', () => {
  afterEach(() => {
    i18n.global.locale.value = 'en'
  })

  it('every locale ships the notice keys, the Updates switch keys and the search entry', () => {
    for (const locale of LOCALES) {
      const table = readJson(`${locale}.json`)
      for (const key of NOTICE_KEYS) {
        expect(typeof table.updateNotice?.[key], `${locale} updateNotice.${key}`).toBe('string')
        expect(table.updateNotice[key].length, `${locale} updateNotice.${key}`).toBeGreaterThan(0)
      }
      const updates = table.preferences?.general?.updates
      for (const key of UPDATES_KEYS) {
        expect(typeof updates?.[key], `${locale} preferences.general.updates.${key}`).toBe('string')
        expect(updates[key].length, `${locale} preferences.general.updates.${key}`).toBeGreaterThan(
          0
        )
      }
      const searchItem = table.preferences?.search?.items?.[SEARCH_KEY]
      expect(typeof searchItem, `${locale} preferences.search.items.${SEARCH_KEY}`).toBe('string')
      expect(searchItem.length, `${locale} preferences.search.items.${SEARCH_KEY}`).toBeGreaterThan(
        0
      )
    }
  })
})
