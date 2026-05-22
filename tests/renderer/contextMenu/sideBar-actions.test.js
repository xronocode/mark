vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

describe('contextMenu/sideBar/actions.js', () => {
  let bus

  beforeEach(async () => {
    bus = (await import('@/bus')).default
  })

  it('newFile emits SIDEBAR::new with file', async () => {
    const { newFile } = await import('@/contextMenu/sideBar/actions.js')
    newFile()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'file')
  })

  it('newDirectory emits SIDEBAR::new with directory', async () => {
    const { newDirectory } = await import('@/contextMenu/sideBar/actions.js')
    newDirectory()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'directory')
  })

  it('copy emits SIDEBAR::copy-cut with copy', async () => {
    const { copy } = await import('@/contextMenu/sideBar/actions.js')
    copy()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::copy-cut', 'copy')
  })

  it('cut emits SIDEBAR::copy-cut with cut', async () => {
    const { cut } = await import('@/contextMenu/sideBar/actions.js')
    cut()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::copy-cut', 'cut')
  })

  it('paste emits SIDEBAR::paste', async () => {
    const { paste } = await import('@/contextMenu/sideBar/actions.js')
    paste()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::paste')
  })

  it('rename emits SIDEBAR::rename', async () => {
    const { rename } = await import('@/contextMenu/sideBar/actions.js')
    rename()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::rename')
  })

  it('remove emits SIDEBAR::remove', async () => {
    const { remove } = await import('@/contextMenu/sideBar/actions.js')
    remove()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::remove')
  })

  it('showInFolder emits SIDEBAR::show-in-folder', async () => {
    const { showInFolder } = await import('@/contextMenu/sideBar/actions.js')
    showInFolder()
    expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::show-in-folder')
  })
})
