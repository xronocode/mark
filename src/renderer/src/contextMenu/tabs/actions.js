import bus from '../../bus'

export const closeThis = (tabId) => {
  bus.emit('TABS::close-this', tabId)
}

export const closeOthers = (tabId) => {
  bus.emit('TABS::close-others', tabId)
}

export const closeSaved = () => {
  bus.emit('TABS::close-saved')
}

export const closeAll = () => {
  bus.emit('TABS::close-all')
}

export const rename = (tabId) => {
  bus.emit('TABS::rename', tabId)
}

export const copyPath = (tabId) => {
  bus.emit('TABS::copy-path', tabId)
}

export const showInFolder = (tabId) => {
  bus.emit('TABS::show-in-folder', tabId)
}

// C-40 T-004: per-tab read-only lock (View › Lock Document twin).
export const toggleLock = (tabId) => {
  bus.emit('TABS::toggle-lock', tabId)
}

// C-40 T-004: per-tab Split View (view.split-view twin for the tab the
// menu was opened on).
export const toggleSplitView = (tabId) => {
  bus.emit('TABS::toggle-split-view', tabId)
}

// C-51 T-002: Pin/Unpin the tab's file — tabs.vue's TABS::pin-file
// listener resolves the tab's pathname and toggles the persisted pinned
// list.
export const pinFile = (tabId) => {
  bus.emit('TABS::pin-file', tabId)
}

// C-40 T-004: copy-document flavors from the tab context menu.
export const copyAsMarkdown = (tabId) => {
  bus.emit('TABS::copy-as-markdown', tabId)
}

// html | structuredText — the rendered flavors run through the live
// editor pipeline (copyAsHtmlRich / copyAsStructuredText), so the tab is
// activated first when the menu targeted a background tab.
export const copyDocumentAs = (kind, tabId) => {
  bus.emit('TABS::copy-document-as', { kind, tabId })
}
