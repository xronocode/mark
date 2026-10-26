/**
 * Tests for src/renderer/src/services/notification/index.js — the
 * C-NOTIFICATION-SYSTEM compatibility facade.
 *
 * Covers: the legacy notify({title,message,type,time}) call shape keeps
 * working against the pinia store (primary→info mapping, localized
 * defaults), the new event fields pass through, notify returns undefined
 * (corner C-7: no promise semantics), and clear() empties the stack.
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'test-id')
}))

import notification from '@/services/notification'
import { useNotificationsStore, normalizeSeverity } from '@/store/notifications'
import { setupTestPinia } from '../pinia'

describe('notification facade (C-NOTIFICATION-SYSTEM)', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('has name "notify"', () => {
    expect(notification.name).toBe('notify')
  })

  it('notify returns undefined — never a promise (corner C-7)', () => {
    const result = notification.notify({ title: 'T', message: 'M' })
    expect(result).toBeUndefined()
  })

  it('legacy shape lands in the store with primary mapped to info (corner C-6)', () => {
    notification.notify({ title: 'T', message: 'M', type: 'primary', time: 12345 })
    const store = useNotificationsStore()
    expect(store.stack).toHaveLength(1)
    expect(store.stack[0].severity).toBe('info')
    expect(store.stack[0].title).toBe('T')
    expect(store.stack[0].message).toBe('M')
    expect(store.stack[0].time).toBe(12345)
    expect(store.stack[0].source).toBe('system')
  })

  it('applies localized defaults for missing title/message', () => {
    notification.notify({})
    const store = useNotificationsStore()
    expect(store.stack[0].title).toBe('notifications.defaultTitle')
    expect(store.stack[0].message).toBe('notifications.defaultMessage')
  })

  it('severity field passes through and error is sticky (corner C-2)', () => {
    notification.notify({ severity: 'error', message: 'boom' })
    const store = useNotificationsStore()
    expect(store.stack[0].severity).toBe('error')
    expect(store.stack[0].sticky).toBe(true)
  })

  it('forwards source, actions, dedupKey and sticky', () => {
    const actions = [{ kind: 'copy', payload: 'x' }]
    notification.notify({ source: 'export', actions, dedupKey: 'k', sticky: true })
    const store = useNotificationsStore()
    expect(store.stack[0].source).toBe('export')
    expect(store.stack[0].actions).toStrictEqual(actions)
    expect(store.stack[0].dedupKey).toBe('k')
    expect(store.stack[0].sticky).toBe(true)
  })

  it('clear() empties the stack', () => {
    notification.notify({ title: 'a' })
    notification.notify({ title: 'b' })
    notification.clear()
    const store = useNotificationsStore()
    expect(store.stack).toHaveLength(0)
  })

  it('normalizeSeverity maps every legacy value safely', () => {
    expect(normalizeSeverity('primary')).toBe('info')
    expect(normalizeSeverity('info')).toBe('info')
    expect(normalizeSeverity('success')).toBe('success')
    expect(normalizeSeverity('warning')).toBe('warning')
    expect(normalizeSeverity('error')).toBe('error')
    expect(normalizeSeverity('nonsense')).toBe('info')
    expect(normalizeSeverity(undefined)).toBe('info')
  })
})
