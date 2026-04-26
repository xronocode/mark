// step-8g: native sidebar context-menu via mt::window-popup-context-menu.
// Renderer serializes the spec; main handles popup; renderer dispatches
// the local handler by clicked id. PASTE remains conditionally enabled
// based on hasPathCache.
import {
  SEPARATOR,
  getNEW_FILE,
  getNEW_DIRECTORY,
  getCOPY,
  getCUT,
  getPASTE,
  getRENAME,
  getDELETE,
  getSHOW_IN_FOLDER,
  HANDLERS
} from './menuItems'

export const showContextMenu = async (event, hasPathCache) => {
  const items = [
    getNEW_FILE(),
    getNEW_DIRECTORY(),
    SEPARATOR,
    getCOPY(),
    getCUT(),
    { ...getPASTE(), enabled: !!hasPathCache },
    SEPARATOR,
    getRENAME(),
    getDELETE(),
    SEPARATOR,
    getSHOW_IN_FOLDER()
  ]

  const clickedId = await window.electron.ipcRenderer.invoke(
    'mt::window-popup-context-menu',
    { items, x: event.clientX, y: event.clientY }
  )

  const handler = HANDLERS[clickedId]
  if (handler) handler()
}
