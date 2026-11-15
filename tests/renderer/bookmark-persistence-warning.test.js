// FILE: tests/renderer/bookmark-persistence-warning.test.js
// C-BOOKMARK-PERSISTENCE-DURABILITY: real notification-store delivery controls.
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationsStore } from '@/store/notifications'
import notice from '@/services/notification'
import { createBookmarkPersistenceWarningDrain } from '@/util/bookmarkPersistenceWarning'

let idSequence = 0
vi.mock('@/util', () => ({ getUniqueId: () => `bookmark-notice-${++idSequence}` }))

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => useNotificationsStore().CLEAR())

const consumer = (invoke) => createBookmarkPersistenceWarningDrain({
  invoke, notify: (options) => notice.notify(options), translate: (key) => key
})

describe('bookmark persistence warning', () => {
  it('recovers a queued pre-listener failure into one sticky visible card', async () => {
    let pending = true
    const invoke = vi.fn(async (command) => {
      expect(command).toBe('mt_take_bookmark_persistence_warning')
      const value = pending
      pending = false
      return value
    })
    await consumer(invoke)()
    const store = useNotificationsStore()
    expect(store.liveStack).toHaveLength(1)
    expect(store.liveStack[0]).toMatchObject({
      severity: 'error', source: 'file', sticky: true,
      dedupKey: 'bookmark-persistence-failure',
      title: 'workspace.bookmarkPersistenceFailedTitle',
      message: 'workspace.bookmarkPersistenceFailedMessage'
    })
  })

  it('deduplicates repeated consumed live failures in the actual notification store', async () => {
    const drain = consumer(vi.fn(async () => true))
    await drain()
    await drain()
    const store = useNotificationsStore()
    expect(store.liveStack).toHaveLength(1)
    expect(store.liveStack[0].count).toBe(2)
    expect(store.history).toHaveLength(2)
  })

  it.each([false, null, undefined, 'true', {}, []])('does not warn for a non-pending result %j', async (value) => {
    await consumer(vi.fn(async () => value))()
    expect(useNotificationsStore().liveStack).toHaveLength(0)
  })

  it('serializes overlapping wakeups and retains a follow-up read', async () => {
    let finish
    const first = new Promise(resolve => { finish = resolve })
    const invoke = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(true)
    const drain = consumer(invoke)
    const initial = drain()
    await Promise.resolve()
    const live = drain()
    expect(invoke).toHaveBeenCalledTimes(1)
    finish(false)
    await Promise.all([initial, live])
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(useNotificationsStore().liveStack).toHaveLength(1)
  })

  it('catches a rejected drain and permits the next live wakeup', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const invoke = vi.fn().mockRejectedValueOnce(new Error('fixture transport')).mockResolvedValueOnce(true)
    const drain = consumer(invoke)
    await expect(drain()).resolves.toBeUndefined()
    expect(useNotificationsStore().liveStack).toHaveLength(0)
    await drain()
    expect(useNotificationsStore().liveStack).toHaveLength(1)
    expect(error).toHaveBeenCalledWith('[SecurityBookmarks][warning][BLOCK_BOOKMARK_WARNING_DRAIN_FAILED]')
    error.mockRestore()
  })
})
