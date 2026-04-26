// step-8g: @electron/remote.Menu / MenuItem / getCurrentWindow gone.
// The native context menu is now spawned by main via the
// mt::window-popup-context-menu IPC; renderer only serializes the
// menu spec and dispatches the local click handler by id.
import {
  SEPARATOR,
  getCLOSE_THIS,
  getCLOSE_OTHERS,
  getCLOSE_SAVED,
  getCLOSE_ALL,
  getRENAME,
  getCOPY_PATH,
  getSHOW_IN_FOLDER,
  HANDLERS
} from './menuItems'

export const showContextMenu = async (event, tab) => {
  const { pathname } = tab
  const items = [
    getCLOSE_THIS(),
    getCLOSE_OTHERS(),
    getCLOSE_SAVED(),
    getCLOSE_ALL(),
    SEPARATOR,
    { ...getRENAME(), enabled: !!pathname },
    { ...getCOPY_PATH(), enabled: !!pathname },
    { ...getSHOW_IN_FOLDER(), enabled: !!pathname }
  ]

  const clickedId = await window.electron.ipcRenderer.invoke(
    'mt::window-popup-context-menu',
    { items, x: event.clientX, y: event.clientY }
  )

  const handler = HANDLERS[clickedId]
  if (handler) handler(tab.id)
}
