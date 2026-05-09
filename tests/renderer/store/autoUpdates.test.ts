/**
 * Unit tests for src/renderer/src/store/autoUpdates.js
 *
 * Post-W7 cleanup state: this module is a minimal Pinia stub. All four
 * legacy `LISTEN_FOR_UPDATE*` listeners and the `mt::NEED_UPDATE` send
 * are gone — the store is now `{ state: {}, actions: {} }`. The user-
 * facing update flow goes through commands/index.js id="file.check-update"
 * + Rust `mt_updater_check`. We simply verify the post-cleanup surface.
 */

import { setupTestPinia } from '../pinia'

describe('store/autoUpdates (post-W7 stub)', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('store is constructable with id "autoUpdates"', async () => {
    const { useAutoUpdatesStore } = await import('@/store/autoUpdates')
    const s = useAutoUpdatesStore()
    expect(s).toBeDefined()
    expect(s.$id).toBe('autoUpdates')
  })

  it('state is empty (no remaining update fields)', async () => {
    const { useAutoUpdatesStore } = await import('@/store/autoUpdates')
    const s = useAutoUpdatesStore()
    // Pinia adds internal keys ($id, $state, etc.) on the store but
    // $state should be a plain empty object after the W7 purge.
    expect(Object.keys(s.$state)).toEqual([])
  })

  it('exposes no legacy listener actions (LISTEN_FOR_UPDATE* removed)', async () => {
    const { useAutoUpdatesStore } = await import('@/store/autoUpdates')
    const s = useAutoUpdatesStore() as unknown as Record<string, unknown>
    expect(s.LISTEN_FOR_UPDATE).toBeUndefined()
    expect(s.LISTEN_FOR_UPDATE_ERROR).toBeUndefined()
    expect(s.LISTEN_FOR_UPDATE_NOT_AVAILABLE).toBeUndefined()
    expect(s.LISTEN_FOR_UPDATE_DOWNLOADED).toBeUndefined()
    expect(s.LISTEN_FOR_UPDATE_AVAILABLE).toBeUndefined()
  })
})
