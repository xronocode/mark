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
  getLOCK,
  getSPLIT_VIEW,
  getPIN,
  getCOPY_AS_MARKDOWN,
  getCOPY_AS_HTML,
  getCOPY_AS_STRUCTURED,
  HANDLERS
} from './menuItems'
import { usePinnedStore } from '../../store/pinned'

export const showContextMenu = async (event, tab) => {
  const { pathname } = tab
  const pinnedStore = usePinnedStore()
  const items = [
    getCLOSE_THIS(),
    getCLOSE_OTHERS(),
    getCLOSE_SAVED(),
    getCLOSE_ALL(),
    SEPARATOR,
    // C-40 T-004: per-tab read-only lock (works on untitled tabs too).
    // The label keys on tab.locked — a Finder-opened tab in plain
    // reading view is not locked yet and still offers Lock (which makes
    // the read-only state sticky against the click-to-exit gesture).
    getLOCK(!!tab.locked),
    // C-40 T-004: the R-2 document tools stay reachable here (option A
    // removed them from the title bar): Split View and the copy-document
    // flavors.
    getSPLIT_VIEW(),
    getCOPY_AS_MARKDOWN(),
    getCOPY_AS_HTML(),
    getCOPY_AS_STRUCTURED(),
    SEPARATOR,
    { ...getRENAME(), enabled: !!pathname },
    { ...getCOPY_PATH(), enabled: !!pathname },
    // C-51 T-002: Pin/Unpin the saved tab's file into the Pinned section.
    { ...getPIN(!!pathname && pinnedStore.isPinned(pathname)), enabled: !!pathname },
    { ...getSHOW_IN_FOLDER(), enabled: !!pathname }
  ]

  const clickedId = await window.electron.ipcRenderer.invoke(
    'mt::window-popup-context-menu',
    { items, x: event.clientX, y: event.clientY }
  )

  const handler = HANDLERS[clickedId]
  if (handler) handler(tab.id)
}
