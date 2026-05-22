/**
 * Unit tests for src/renderer/src/store/tweet.js
 *
 * Coverage target: 0% → 95%+
 *
 * The tweet store is minimal — one action (LISTEN_FOR_TWEET) that
 * registers an ipcRenderer.on handler. When the handler fires with
 * type='twitter', it emits 'tweetDialog' on the bus.
 */

import { setupTestPinia } from '../pinia'

const busEmitMock = vi.fn()
vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: busEmitMock }
}))

describe('store/tweet', () => {
  beforeEach(() => {
    setupTestPinia()
    busEmitMock.mockReset()
  })

  it('state is an empty object', async () => {
    const { useTweetStore } = await import('@/store/tweet')
    const s = useTweetStore()
    expect(s.$state).toEqual({})
  })

  describe('LISTEN_FOR_TWEET', () => {
    it('registers an ipcRenderer.on handler for mt::tweet', async () => {
      const { useTweetStore } = await import('@/store/tweet')
      const s = useTweetStore()
      s.LISTEN_FOR_TWEET()
      expect(window.electron.ipcRenderer.on).toHaveBeenCalledWith(
        'mt::tweet',
        expect.any(Function)
      )
    })

    it('emits tweetDialog on bus when type is "twitter"', async () => {
      const { useTweetStore } = await import('@/store/tweet')
      const s = useTweetStore()
      s.LISTEN_FOR_TWEET()

      // Extract the handler that was registered
      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::tweet'
      )[1]

      handler({}, 'twitter')
      expect(busEmitMock).toHaveBeenCalledWith('tweetDialog')
    })

    it('does NOT emit tweetDialog when type is not "twitter"', async () => {
      const { useTweetStore } = await import('@/store/tweet')
      const s = useTweetStore()
      s.LISTEN_FOR_TWEET()

      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::tweet'
      )[1]

      handler({}, 'facebook')
      expect(busEmitMock).not.toHaveBeenCalled()
    })

    it('does NOT emit tweetDialog when type is undefined', async () => {
      const { useTweetStore } = await import('@/store/tweet')
      const s = useTweetStore()
      s.LISTEN_FOR_TWEET()

      const handler = window.electron.ipcRenderer.on.mock.calls.find(
        (c) => c[0] === 'mt::tweet'
      )[1]

      handler({}, undefined)
      expect(busEmitMock).not.toHaveBeenCalled()
    })
  })
})
