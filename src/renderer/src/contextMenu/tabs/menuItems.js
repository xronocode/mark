import * as contextMenu from './actions'
import { t } from '../../i18n'

// step-8g: split spec from handlers.
// - getXxx() factories return SERIALIZABLE specs ({label, id, type?})
//   — no `click` field, since we now pass these through IPC to main.
// - HANDLERS maps id → renderer-side function. After main popups the
//   native menu and resolves with the clicked id, index.js looks up
//   the handler here and calls it with the contextual argument
//   (a tab id, derived from event payload, not the menu).

export const SEPARATOR = {
  type: 'separator'
}

export const getCLOSE_THIS = () => ({
  label: t('contextMenu.tabs.close'),
  id: 'closeThisTab'
})

export const getCLOSE_OTHERS = () => ({
  label: t('contextMenu.tabs.closeOthers'),
  id: 'closeOtherTabs'
})

export const getCLOSE_SAVED = () => ({
  label: t('contextMenu.tabs.closeSavedTabs'),
  id: 'closeSavedTabs'
})

export const getCLOSE_ALL = () => ({
  label: t('contextMenu.tabs.closeAllTabs'),
  id: 'closeAllTabs'
})

export const getRENAME = () => ({
  label: t('contextMenu.tabs.rename'),
  id: 'renameFile'
})

export const getCOPY_PATH = () => ({
  label: t('contextMenu.tabs.copyPath'),
  id: 'copyPath'
})

export const getSHOW_IN_FOLDER = () => ({
  label: t('contextMenu.tabs.showInFolder'),
  id: 'showInFolder'
})

// id → handler. Each receives the active tab id at click dispatch time.
// Items whose action ignores the tab id (close-saved / close-all)
// simply discard the argument.
export const HANDLERS = {
  closeThisTab: (tabId) => contextMenu.closeThis(tabId),
  closeOtherTabs: (tabId) => contextMenu.closeOthers(tabId),
  closeSavedTabs: () => contextMenu.closeSaved(),
  closeAllTabs: () => contextMenu.closeAll(),
  renameFile: (tabId) => contextMenu.rename(tabId),
  copyPath: (tabId) => contextMenu.copyPath(tabId),
  showInFolder: (tabId) => contextMenu.showInFolder(tabId)
}

// Backwards-compat shape kept for any external import sites; click is
// no longer present, so direct RemoteMenuItem construction is no longer
// supported (those import sites must migrate via showContextMenu).
export const CLOSE_THIS = getCLOSE_THIS()
export const CLOSE_OTHERS = getCLOSE_OTHERS()
export const CLOSE_SAVED = getCLOSE_SAVED()
export const CLOSE_ALL = getCLOSE_ALL()
export const RENAME = getRENAME()
export const COPY_PATH = getCOPY_PATH()
export const SHOW_IN_FOLDER = getSHOW_IN_FOLDER()
