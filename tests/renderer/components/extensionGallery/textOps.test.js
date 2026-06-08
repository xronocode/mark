const listenMock = vi.fn()
const busMock = { emit: vi.fn(), on: vi.fn(), off: vi.fn() }

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

vi.mock('@/bus', () => ({
  default: busMock
}))

describe('textOps listener – extended coverage', () => {
  let initTextOpsListener, destroyTextOpsListener, eventHandler

  beforeEach(async () => {
    vi.clearAllMocks()
    listenMock.mockImplementation(async (_event, handler) => {
      eventHandler = handler
      return vi.fn()
    })
    vi.resetModules()
    const mod = await import('@/components/extensionGallery/textOps.js')
    initTextOpsListener = mod.initTextOpsListener
    destroyTextOpsListener = mod.destroyTextOpsListener
  })

  // ── Lifecycle ────────────────────────────────────────────────

  it('registers listener on init', async () => {
    await initTextOpsListener()
    expect(listenMock).toHaveBeenCalledWith('mt::text::op', expect.any(Function))
  })

  it('is idempotent — second init does not re-register', async () => {
    await initTextOpsListener()
    await initTextOpsListener()
    expect(listenMock).toHaveBeenCalledTimes(1)
  })

  it('destroy unregisters listener', async () => {
    await initTextOpsListener()
    destroyTextOpsListener()
    // After destroy, calling init again should re-register
    await initTextOpsListener()
    expect(listenMock).toHaveBeenCalledTimes(2)
  })

  it('destroy is safe to call without prior init (no-op)', () => {
    // This tests the `if (unlisten)` falsy branch in destroyTextOpsListener
    destroyTextOpsListener()
    // No error thrown
  })

  it('destroy is safe to call twice (idempotent)', async () => {
    await initTextOpsListener()
    destroyTextOpsListener()
    destroyTextOpsListener()
    // No error thrown
  })

  // ── Insert operations ────────────────────────────────────────

  it('handles insert op — emits ext-text-insert with position', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'insert',
        payload: { text: 'hello', position: 5 },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-insert', {
      text: 'hello',
      position: 5,
      extensionId: 'ext1'
    })
  })

  it('handles insert op without position', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'insert',
        payload: { text: 'world' },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-insert', {
      text: 'world',
      position: undefined,
      extensionId: 'ext1'
    })
  })

  it('handles insert with empty string text', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'insert',
        payload: { text: '' },
        extension_id: 'ext1'
      }
    })
    // Empty string is still a valid string
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-insert', {
      text: '',
      position: undefined,
      extensionId: 'ext1'
    })
  })

  it('ignores insert with non-string text (number)', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'insert',
        payload: { text: 123 },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores insert with non-string text (null)', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'insert',
        payload: { text: null },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores insert with non-string text (undefined)', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'insert',
        payload: { text: undefined },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  // ── Transform operations ─────────────────────────────────────

  it('handles transform op — emits ext-text-transform', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'transform',
        payload: { text: 'UPPER' },
        extension_id: 'ext2'
      }
    })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-transform', {
      text: 'UPPER',
      extensionId: 'ext2'
    })
  })

  it('handles transform with empty string text', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'transform',
        payload: { text: '' },
        extension_id: 'ext2'
      }
    })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-transform', {
      text: '',
      extensionId: 'ext2'
    })
  })

  it('ignores transform with non-string text (null)', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'transform',
        payload: { text: null },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores transform with non-string text (object)', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'transform',
        payload: { text: { value: 'hello' } },
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  // ── Unknown / invalid events ─────────────────────────────────

  it('handles unknown op_type without emitting', async () => {
    await initTextOpsListener()
    eventHandler({
      payload: {
        op_type: 'delete',
        payload: {},
        extension_id: 'ext1'
      }
    })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with null payload', async () => {
    await initTextOpsListener()
    eventHandler({ payload: null })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with string payload', async () => {
    await initTextOpsListener()
    eventHandler({ payload: 'string' })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with no event object', async () => {
    await initTextOpsListener()
    eventHandler(null)
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with undefined payload', async () => {
    await initTextOpsListener()
    eventHandler({})
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with null op_type and null payload', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: null, payload: null } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with op_type but null inner payload', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: null } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores event with missing op_type', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { payload: { text: 'hello' } } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })
})
