// FILE: tests/renderer/components/rollbackConfirm.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-UPDATER-ROLLBACK confirmation card semantics —
//            store-driven visibility injects/removes one sticky warning
//            entry in the shared stack (dedupKey 'rollback-confirm', so
//            a repeated delegation or menu invocation reuses the same
//            entry instead of stacking), the localized disclosures carry
//            the target version, the settings revert and the skip of the
//            departed version, Confirm dispatches CONFIRM_ROLLBACK,
//            Cancel/dismiss dispatch CLOSE_ROLLBACK_CONFIRM only, and
//            the mt::rollback-delegate listener opens the card.
//   SCOPE: src/renderer/src/components/rollbackConfirm/index.vue behaviour
//          (via store/notifications state) and store/autoUpdates dispatch
//          spies; restore execution lives in Rust and is out of scope.
//   DEPENDS: @vue/test-utils, tests/renderer/pinia, real i18n (en table),
//          store/notifications, @tauri-apps/api/event mock.
//   LINKS: .grace/changes/active/C-UPDATER-ROLLBACK spec R-4/R-5,
//          corners C-2/C-5; components/updateNotice (the pattern).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountCard - mount the logic component with a fresh Pinia.
//   armRollback - flip the autoUpdates store into the confirmed-available state.
//   entry - the live stack entry the card injected.
//   listenMock - hoisted @tauri-apps/api/event listen spy (delegate listener pin).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-29 C-UPDATER-ROLLBACK T-006: initial component pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'rollback-confirm-id')
}))

const { listenMock } = vi.hoisted(() => ({ listenMock: vi.fn(async () => vi.fn()) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationsStore } from '@/store/notifications'
import RollbackConfirm from '@/components/rollbackConfirm/index.vue'

const mountCard = () => mount(RollbackConfirm, { attachTo: document.body })

const armRollback = (store) => {
  store.rollback = {
    visible: true,
    previousVersion: '2.9.0',
    currentVersion: '2.9.1'
  }
}

const entry = (notifications) =>
  notifications.stack.find((e) => e.dedupKey === 'rollback-confirm')

describe('components/rollbackConfirm — shared-card confirmation (C-UPDATER-ROLLBACK)', () => {
  let updates, notifications

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    setupTestPinia()
    updates = useAutoUpdatesStore()
    notifications = useNotificationsStore()
  })

  it('injects one sticky warning entry with the disclosures when armed', async () => {
    mountCard()
    armRollback(updates)
    await flushPromises()

    const e = entry(notifications)
    expect(e).toBeTruthy()
    expect(e.severity).toBe('warning')
    expect(e.sticky).toBe(true)
    expect(e.title).toContain('2.9.0')
    expect(e.message).toContain('2.9.1')
    expect(e.actions.map((a) => a.label)).toEqual([
      expect.stringContaining('Roll Back'),
      expect.stringContaining('Cancel')
    ])
  })

  it('is a singleton: re-arming does not stack a second entry', async () => {
    mountCard()
    armRollback(updates)
    await flushPromises()
    armRollback(updates)
    await flushPromises()
    expect(notifications.stack.filter((e) => e.dedupKey === 'rollback-confirm')).toHaveLength(1)
  })

  it('cancel_is_a_noop: Cancel dispatches CLOSE only and invokes nothing', async () => {
    const spy = vi.spyOn(updates, 'CONFIRM_ROLLBACK')
    mountCard()
    armRollback(updates)
    await flushPromises()
    const cancel = entry(notifications).actions.find((a) => a.label.toLowerCase().includes('cancel'))
    cancel.handler()
    await flushPromises()
    expect(updates.rollback.visible).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(entry(notifications)).toBeFalsy()
  })

  it('Confirm dispatches CONFIRM_ROLLBACK', async () => {
    const spy = vi.spyOn(updates, 'CONFIRM_ROLLBACK').mockResolvedValue()
    mountCard()
    armRollback(updates)
    await flushPromises()
    const confirm = entry(notifications).actions[0]
    confirm.handler()
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('dismiss maps to the Cancel semantics', async () => {
    const spy = vi.spyOn(updates, 'CLOSE_ROLLBACK_CONFIRM')
    mountCard()
    armRollback(updates)
    await flushPromises()
    entry(notifications).onDismiss()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('listens for mt::rollback-delegate and opens the card on the event', async () => {
    mountCard()
    await flushPromises()
    expect(listenMock).toHaveBeenCalledWith('mt::rollback-delegate', expect.any(Function))
    const handler = listenMock.mock.calls[0][1]
    updates.OPEN_ROLLBACK_CONFIRM = vi.fn(async () => true)
    handler()
    await flushPromises()
    expect(updates.OPEN_ROLLBACK_CONFIRM).toHaveBeenCalledTimes(1)
  })

  it('removes the entry when the store hides the card', async () => {
    mountCard()
    armRollback(updates)
    await flushPromises()
    updates.rollback.visible = false
    await flushPromises()
    expect(entry(notifications)).toBeFalsy()
  })
})
