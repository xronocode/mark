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

  it('handles undo op — emits ext-undo', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'undo', payload: {}, extension_id: 'ext3' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-undo', { extensionId: 'ext3' })
  })

  // ── Document binding passthrough (C-SEC-EDIT-TARGETING) ─────

  it('forwards the document binding on the ext-text-insert emit', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: { text: 'hello', position: 2, document_id: 'tab-1', document_generation: 'document-1-a' }, extension_id: 'ext1' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-insert', { text: 'hello', position: 2, extensionId: 'ext1', documentId: 'tab-1', documentGeneration: 'document-1-a' })
  })

  it('forwards the document binding on the ext-text-transform emit', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'transform', payload: { text: 'UPPER', document_id: 'tab-9', document_generation: 'document-9-b' }, extension_id: 'ext2' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-transform', { text: 'UPPER', extensionId: 'ext2', documentId: 'tab-9', documentGeneration: 'document-9-b' })
  })

  it('forwards the document binding on the ext-undo emit', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'undo', payload: { document_id: 'tab-3', document_generation: 'document-3-c' }, extension_id: 'ext3' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-undo', { extensionId: 'ext3', documentId: 'tab-3', documentGeneration: 'document-3-c' })
  })

  it('a payload without binding fields forwards undefined documentId/documentGeneration', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: { text: 'unbound', position: null }, extension_id: 'ext1' } })
    eventHandler({ payload: { op_type: 'transform', payload: { text: 'unbound' }, extension_id: 'ext2' } })
    eventHandler({ payload: { op_type: 'undo', payload: {}, extension_id: 'ext3' } })
    expect(busMock.emit).toHaveBeenNthCalledWith(1, 'ext-text-insert', { text: 'unbound', position: null, extensionId: 'ext1', documentId: undefined, documentGeneration: undefined })
    expect(busMock.emit).toHaveBeenNthCalledWith(2, 'ext-text-transform', { text: 'unbound', extensionId: 'ext2', documentId: undefined, documentGeneration: undefined })
    expect(busMock.emit).toHaveBeenNthCalledWith(3, 'ext-undo', { extensionId: 'ext3', documentId: undefined, documentGeneration: undefined })
  })

  // ── requestId/opIndex relay (C-EXT-EDIT-PROOF) ──────────────

  it('forwards requestId/opIndex on the ext-text-insert emit', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: { text: 'hello', position: 2, request_id: 'apply-7', op_index: 0 }, extension_id: 'ext1' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-insert', { text: 'hello', position: 2, extensionId: 'ext1', requestId: 'apply-7', opIndex: 0 })
  })

  it('forwards requestId/opIndex on the ext-text-transform emit', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'transform', payload: { text: 'UPPER', request_id: 'apply-8', op_index: 1 }, extension_id: 'ext2' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-text-transform', { text: 'UPPER', extensionId: 'ext2', requestId: 'apply-8', opIndex: 1 })
  })

  it('forwards requestId/opIndex on the ext-undo emit', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'undo', payload: { request_id: 'apply-9', op_index: 2 }, extension_id: 'ext3' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-undo', { extensionId: 'ext3', requestId: 'apply-9', opIndex: 2 })
  })

  it('a payload without request fields forwards undefined requestId/opIndex', async () => {
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'insert', payload: { text: 'keyless', position: null }, extension_id: 'ext1' } })
    eventHandler({ payload: { op_type: 'transform', payload: { text: 'keyless' }, extension_id: 'ext2' } })
    eventHandler({ payload: { op_type: 'undo', payload: {}, extension_id: 'ext3' } })
    expect(busMock.emit).toHaveBeenNthCalledWith(1, 'ext-text-insert', { text: 'keyless', position: null, extensionId: 'ext1', requestId: undefined, opIndex: undefined })
    expect(busMock.emit).toHaveBeenNthCalledWith(2, 'ext-text-transform', { text: 'keyless', extensionId: 'ext2', requestId: undefined, opIndex: undefined })
    expect(busMock.emit).toHaveBeenNthCalledWith(3, 'ext-undo', { extensionId: 'ext3', requestId: undefined, opIndex: undefined })
  })

  it('logs warning for unknown op_type', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await initTextOpsListener()
    eventHandler({ payload: { op_type: 'delete', payload: {}, extension_id: 'ext1' } })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BLOCK_UNKNOWN_OP'))
    warnSpy.mockRestore()
  })

  it('handles context_request event', async () => {
    await initTextOpsListener()
    const ctxHandler = handlers['mt::ext::context_request']
    expect(ctxHandler).toBeTruthy()
    ctxHandler({ payload: { request_id: 'req-42' } })
    expect(busMock.emit).toHaveBeenCalledWith('ext-context-request', { requestId: 'req-42' })
  })

  it('ignores context_request with no request_id', async () => {
    await initTextOpsListener()
    const ctxHandler = handlers['mt::ext::context_request']
    ctxHandler({ payload: { other: 'data' } })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('ignores context_request with invalid payload', async () => {
    await initTextOpsListener()
    const ctxHandler = handlers['mt::ext::context_request']
    ctxHandler({ payload: null })
    ctxHandler({ payload: 'string' })
    expect(busMock.emit).not.toHaveBeenCalled()
  })

  it('destroy unregisters listener', async () => {
    await initTextOpsListener()
    destroyTextOpsListener()
  })
})
