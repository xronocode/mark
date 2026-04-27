import * as contextMenu from './actions'
import { t } from '../../i18n'

// step-8g: split spec from handlers (same shape as
// contextMenu/tabs/menuItems.js — see that file for rationale).
// Specs are serialized through the mt::window-popup-context-menu IPC;
// HANDLERS keeps the click logic on the renderer side, indexed by id.

export const SEPARATOR = {
  type: 'separator'
}

export const getNEW_FILE = () => ({
  label: t('contextMenu.sideBar.newFile'),
  id: 'newFileMenuItem'
})

export const getNEW_DIRECTORY = () => ({
  label: t('contextMenu.sideBar.newDirectory'),
  id: 'newDirectoryMenuItem'
})

export const getCOPY = () => ({
  label: t('contextMenu.sideBar.copy'),
  id: 'copyMenuItem'
})

export const getCUT = () => ({
  label: t('contextMenu.sideBar.cut'),
  id: 'cutMenuItem'
})

export const getPASTE = () => ({
  label: t('contextMenu.sideBar.paste'),
  id: 'pasteMenuItem'
})

export const getRENAME = () => ({
  label: t('contextMenu.sideBar.rename'),
  id: 'renameMenuItem'
})

export const getDELETE = () => ({
  label: t('contextMenu.sideBar.moveToTrash'),
  id: 'deleteMenuItem'
})

export const getSHOW_IN_FOLDER = () => ({
  label: t('contextMenu.sideBar.showInFolder'),
  id: 'showInFolderMenuItem'
})

// id → handler. Sidebar items don't take a contextual argument: the
// active selection is resolved inside the action functions themselves
// (they read from project store).
export const HANDLERS = {
  newFileMenuItem: () => contextMenu.newFile(),
  newDirectoryMenuItem: () => contextMenu.newDirectory(),
  copyMenuItem: () => contextMenu.copy(),
  cutMenuItem: () => contextMenu.cut(),
  pasteMenuItem: () => contextMenu.paste(),
  renameMenuItem: () => contextMenu.rename(),
  deleteMenuItem: () => contextMenu.remove(),
  showInFolderMenuItem: () => contextMenu.showInFolder()
}

// Backwards-compat exports preserved (without click); future cleanup
// may drop them once no external imports rely on the constant form.
export const NEW_FILE = getNEW_FILE()
export const NEW_DIRECTORY = getNEW_DIRECTORY()
export const COPY = getCOPY()
export const CUT = getCUT()
export const PASTE = getPASTE()
export const RENAME = getRENAME()
export const DELETE = getDELETE()
export const SHOW_IN_FOLDER = getSHOW_IN_FOLDER()
