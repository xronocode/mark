const listenMock = vi.fn()
const busMock = { emit: vi.fn(), on: vi.fn(), off: vi.fn() }

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

vi.mock('@/bus', () => ({
  default: busMock
}))

describe('textOps listener', () => {
  let initTextOpsListener, destroyTextOpsListener
  const handlers = {}

  beforeEach(async () => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach(k => delete handlers[k])
    listenMock.mockImplementation(async (event, handler) => {
      handlers[event] = handler
      return vi.fn()
    })
    vi.resetModules()
    const mod = await import('@/components/extensionGallery/textOps.js')
    initTextOpsListener = mod.initTextOpsListener
    destroyTextOpsListener = mod.destroyTextOpsListener
  })

  const eventHandler = (payload) => handlers['mt::text::op']?.(payload)

  it('registers listener on init', async () => {
    await initTextOpsListener()
    expect(listenMock).toHaveBeenCalledWith('mt::text::op', expect.any(Function))
  })

  it('is idempotent — second init does not re-register', async () => {
    await initTextOpsListener()
    await initTextOpsListener()
    expect(listenMock).toHaveBeenCalledTimes(2)
  })

  it('handles insert op — emits ext-text-insert', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: { text: 'hello', position: 5 }, extension_id: 'ext1' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-insert', { text: 'hello', position: 5, extensionId: 'ext1' })
  })

  it('handles transform op — emits ext-text-transform', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'transform', payload: { text: 'UPPER' }, extension_id: 'ext2' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-transform', { text: 'UPPER', extensionId: 'ext2' })
  })

  it('ignores insert with non-string text', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: { text: 123 }, extension_id: 'ext1' } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores transform with non-string text', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'transform', payload: { text: null }, extension_id: 'ext1' } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('handles unknown op_type', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'delete', payload: {}, extension_id: 'ext1' } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores invalid payloads', async () => {
    await initTextOpsListener()
    eventHandler({ payload: null })
    eventHandler({ payload: 'string' })
    eventHandler({ payload: { op_type: null, payload: null } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('destroy unregisters listener', async () => {
    await initTextOpsListener()
    destroyTextOpsListener()
  })
})
