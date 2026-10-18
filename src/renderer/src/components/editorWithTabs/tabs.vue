<template>
  <div class="editor-tabs">
    <div ref="tabContainer" class="scrollable-tabs">
      <ul ref="tabDropContainer" class="tabs-container">
        <li
          v-for="file of tabs"
          :key="file.id"
          :title="file.pathname"
          :class="{ active: currentFile.id === file.id, unsaved: !file.isSaved }"
          :data-id="file.id"
          @click.stop="selectFile(file)"
          @click.middle="closeTab(file.id)"
          @contextmenu.prevent="handleContextMenu($event, file)"
        >
          <!-- C-40 T-004: lock badge — only an explicit lock (View ›
               Lock Document / tab menu). The Finder/CLI reading view
               shows no badge: it ends with the first click, and a badge
               on every externally opened tab read as «all locked». -->
          <chrome-icon
            v-if="file.locked"
            name="lock"
            :size="11"
            class="tab-lock-badge"
            :title="t('tabs.lockedTitle')"
          ></chrome-icon>
          <span>{{ file.filename }}</span>
          <!-- C-38 T-006: close glyph + unsaved marker drawn from the
               chromeIcons set; the CSS below keeps the old swap logic
               (unsaved non-active tabs show the dot, hover/active show
               the X). -->
          <chrome-icon
            name="close"
            :size="12"
            class="close-icon"
            aria-hidden="true"
            @click.stop="removeFileInTab(file)"
          ></chrome-icon>
          <chrome-icon
            name="dot"
            :size="8"
            class="unsaved-dot"
            aria-hidden="true"
          ></chrome-icon>
        </li>
      </ul>
    </div>
    <div class="new-file" @click.stop="newFile()">
      <chrome-icon name="plus" :size="16" aria-hidden="true"></chrome-icon>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/editorWithTabs/tabs.vue
// VERSION: 1.6.0
// START_CHANGE_SUMMARY
//   - 2026-10-16 v1.5.0: C-51 T-002 — the tab context menu gains
//     Pin/Unpin: TABS::pin-file resolves the tab pathname and toggles
//     the persisted Pinned sidebar list (store/pinned); untitled tabs
//     are a no-op.
//   - 2026-10-18 v1.6.0: the lock badge marks an explicit lock only
//     (tab.locked); the Finder/CLI reading view (previewMode) shows no
//     badge — every externally opened tab used to look locked.
//   - 2026-10-15 v1.4.0: C-38 T-006 N4 b/d — the close glyph, the
//     unsaved marker dot and the new-tab plus render from the drawn
//     chromeIcons set (the iconfont sprite is gone); the active-tab
//     marker follows the system accent instead of the theme green.
//   - 2026-10-15 v1.3.0: C-40 T-004 — a tab in the read-only mode
//     (locked via View › Lock Document, or Finder-opened reading view)
//     carries a lock badge (chromeIcons 'lock', 11 px) before its
//     filename; the badge stays visible at rest. The tab context menu
//     gains Lock/Unlock, Split View and the copy-document flavors
//     (Markdown exact per tab; HTML/structured activate the tab and
//     reuse the editor pipeline).
//   - 2026-09-16 v1.1.0: auto-scroll the strip so the active tab is always visible (C-6) — activation via cycling, sidebar, close-to-neighbor, restore, or reorder no longer leaves the active tab off-screen.
//   - 2026-09-16 v1.2.0: ResizeObserver on the strip re-reveals the active tab after container resize (C-7).
// END_CHANGE_SUMMARY
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { usePinnedStore } from '@/store/pinned'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import autoScroll from 'dom-autoscroller'
import dragula from 'dragula'
import { showContextMenu } from '../../contextMenu/tabs'
import { computeActiveTabScroll } from '@/util/tabsScroll'
import { ChromeIcon } from '../icons/chromeIcons.js'
import bus from '../../bus'

const { t } = useI18n()

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()

const { currentFile, tabs } = storeToRefs(editorStore)

const tabContainer = ref(null)
const tabDropContainer = ref(null)
let autoScroller = null
let drake = null

// Computed properties

// Methods incorporated from tabsMixins
const selectFile = (file) => {
  if (file.id !== currentFile.value.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const removeFileInTab = (file) => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}

// Original methods
const newFile = () => {
  editorStore.NEW_UNTITLED_TAB({})
}

// START_BLOCK_SCROLL_ACTIVE_TAB_INTO_VIEW
// C-6: activation can change without a click on the strip (Ctrl+Tab cycling,
// sidebar selection, close-to-neighbor, session restore, drag reorder), so
// the active tab may sit outside the visible window. The :not(.gu-mirror)
// guard matters because dragula clones the dragged li — data-id included —
// into this same ul; today the original precedes the mirror in document
// order, and the guard keeps that invariant from silently mattering.
const scrollActiveTabIntoView = () => {
  const container = tabContainer.value
  const activeId = currentFile.value && currentFile.value.id
  if (!container || !activeId) return
  const activeTab = container.querySelector(`li[data-id="${activeId}"]:not(.gu-mirror)`)
  if (!activeTab) return
  // offsetLeft is relative to the offsetParent (the position:relative ul),
  // which coincides with the scroll-content origin while the ul and
  // .scrollable-tabs keep zero padding/border/margin.
  const target = computeActiveTabScroll({
    activeLeft: activeTab.offsetLeft,
    activeWidth: activeTab.offsetWidth,
    scrollLeft: container.scrollLeft,
    viewportWidth: container.clientWidth
  })
  if (target !== null) {
    // The strip element clamps the write to [0, scrollWidth - clientWidth].
    container.scrollLeft = target
  }
}
// END_BLOCK_SCROLL_ACTIVE_TAB_INTO_VIEW

// Watch the active id plus the tab order as ONE primitive: Vue dedups
// watcher sources with Object.is, so an array-returning getter would fire on
// every tracked re-run even when id and order are unchanged (e.g. LOAD_CHANGE
// restoring the same id). Reorder/add/remove can move the active tab
// off-screen while its id stays the same — hence the order in the source.
watch(
  () => {
    const activeId = (currentFile.value && currentFile.value.id) || ''
    return `${activeId}\u0000${tabs.value.map((t) => t.id).join('\u0000')}`
  },
  () => nextTick(scrollActiveTabIntoView)
)

// Re-showing the hidden tab bar (view toggle) restarts from scrollLeft 0 —
// display:none discards it — with the active tab possibly off-screen.
watch(
  () => layoutStore.showTabBar,
  (visible) => {
    if (visible) nextTick(scrollActiveTabIntoView)
  }
)

// A container resize (window resize) can clip the active tab without any
// store change (C-7); feature-detected because jsdom has no ResizeObserver.
let resizeObserver = null

const handleTabScroll = (event) => {
  // Use mouse wheel value first but prioritize X value more (e.g. touchpad input).
  let delta = event.deltaY
  if (event.deltaX !== 0) {
    delta = event.deltaX
  }

  const tabs = tabContainer.value
  const newLeft = Math.max(0, Math.min(tabs.scrollLeft + delta, tabs.scrollWidth))
  tabs.scrollLeft = newLeft
}

const closeTab = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_TAB(tab)
  }
}

const closeOthers = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_OTHER_TABS(tab)
  }
}

const closeSaved = () => {
  editorStore.CLOSE_SAVED_TABS()
}

const closeAll = () => {
  editorStore.CLOSE_ALL_TABS()
}

const changeMaxWidth = (width) => {
  layoutStore.CHANGE_SIDE_BAR_WIDTH(width)
}

const rename = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    editorStore.RENAME_FILE(tab)
  }
}

const copyPath = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.clipboard.writeText(tab.pathname)
  }
}

const showInFolder = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.shell.showItemInFolder(tab.pathname)
  }
}

// C-40 T-004: tab context menu Lock/Unlock — toggles the specific tab's
// read-only lock (works for background tabs too, no activation switch).
const toggleLock = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.TOGGLE_LOCK_DOCUMENT(tabId)
  }
}

// C-40 T-004: per-tab Split View from the tab context menu — the same
// tab.splitView flag the view.split-view command flips for the current
// tab (a background tab's split view shows when it is activated).
const toggleSplitView = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    tab.splitView = !tab.splitView
    console.debug(`[editor][split][BLOCK_SPLIT_TOGGLED state=${tab.splitView ? 'on' : 'off'} tab=${tabId}]`)
  }
}

// C-40 T-004: Copy as Markdown writes the clicked tab's raw markdown
// straight to the clipboard (exact for background tabs too).
const copyAsMarkdown = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    window.electron.clipboard.writeText(tab.markdown || '')
    console.debug(`[Tabs][copyAsMarkdown][BLOCK_COPY_AS_MARKDOWN tab=${tabId}]`)
  }
}

// C-40 T-004: the rendered flavors (HTML / structured text) run through
// the live editor pipeline, so a background tab is activated first and
// the handler fires after the document swap settles (the same 150 ms
// budget the command palette's focusEditorAndExecute uses).
const COPY_DOCUMENT_SETTLE_MS = 150
const copyDocumentAs = ({ kind, tabId }) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (!tab) return
  if (currentFile.value && currentFile.value.id !== tab.id) {
    editorStore.UPDATE_CURRENT_FILE(tab)
  }
  setTimeout(() => {
    bus.emit(kind === 'html' ? 'copyAsHtmlRich' : 'copyAsStructuredText')
  }, COPY_DOCUMENT_SETTLE_MS)
}

const handleContextMenu = (event, tab) => {
  if (tab.id) {
    showContextMenu(event, tab)
  }
}

// C-51 T-002: Pin/Unpin the tab's file into the persisted Pinned sidebar
// section (tab context menu). Untitled tabs have no pathname — no-op.
const pinFile = (tabId) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (!tab || !tab.pathname) return
  usePinnedStore().TOGGLE_PIN(tab.pathname)
}

onMounted(() => {
  bus.on('TABS::close-this', closeTab)
  bus.on('TABS::close-others', closeOthers)
  bus.on('TABS::close-saved', closeSaved)
  bus.on('TABS::close-all', closeAll)
  bus.on('TABS::rename', rename)
  bus.on('TABS::copy-path', copyPath)
  bus.on('TABS::show-in-folder', showInFolder)
  bus.on('TABS::toggle-lock', toggleLock)
  bus.on('TABS::toggle-split-view', toggleSplitView)
  bus.on('TABS::pin-file', pinFile)
  bus.on('TABS::copy-as-markdown', copyAsMarkdown)
  bus.on('TABS::copy-document-as', copyDocumentAs)
  bus.on('EDITOR_TABS::change-max-width', changeMaxWidth)

  const tabs = tabContainer.value

  // Allow to scroll through the tabs by mouse wheel or touchpad.
  tabs.addEventListener('wheel', handleTabScroll)

  // Allow tab drag and drop to reorder tabs.
  drake = dragula([tabDropContainer.value], {
    direction: 'horizontal',
    revertOnSpill: true,
    mirrorContainer: tabDropContainer.value,
    ignoreInputTextSelection: false
  }).on('drop', (el, target, source, sibling) => {
    // Current tab that was dropped and need to be reordered.
    const droppedId = el.getAttribute('data-id')
    // This should be the next tab (tab | ... | el | sibling | tab | ...) but may be
    // the mirror image or null (tab | ... | el | sibling or null) if last tab.
    const nextTabId = sibling && sibling.getAttribute('data-id')
    const isLastTab = !sibling || sibling.classList.contains('gu-mirror')
    if (!droppedId || (sibling && !nextTabId)) {
      console.error('Tab reorder error: invalid tab IDs')
      return
    }

    editorStore.EXCHANGE_TABS_BY_ID({
      fromId: droppedId,
      toId: isLastTab ? null : nextTabId
    })
  })

  // Scroll when dragging a tab to the beginning or end of the tab container.
  autoScroller = autoScroll([tabs], {
    margin: 20,
    maxSpeed: 6,
    scrollWhenOutside: false,
    autoScroll: () => {
      return autoScroller.down && drake.dragging
    }
  })

  // A restored session can start with the active tab beyond the fold.
  nextTick(scrollActiveTabIntoView)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      // display:none reports zero width; the showTabBar watcher owns that
      // transition instead.
      if (entry && entry.contentRect.width > 0) {
        nextTick(scrollActiveTabIntoView)
      }
    })
    resizeObserver.observe(tabs)
  }
})

onBeforeUnmount(() => {
  const tabs = tabContainer.value
  if (tabs) {
    tabs.removeEventListener('wheel', handleTabScroll)
  }

  if (autoScroller) {
    // Force destroy
    autoScroller.destroy(true)
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (drake) {
    drake.destroy()
  }

  // Remove event listeners
  bus.off('TABS::close-this', closeTab)
  bus.off('TABS::close-others', closeOthers)
  bus.off('TABS::close-saved', closeSaved)
  bus.off('TABS::close-all', closeAll)
  bus.off('TABS::rename', rename)
  bus.off('TABS::copy-path', copyPath)
  bus.off('TABS::show-in-folder', showInFolder)
  bus.off('TABS::toggle-lock', toggleLock)
  bus.off('TABS::toggle-split-view', toggleSplitView)
  bus.off('TABS::pin-file', pinFile)
  bus.off('TABS::copy-as-markdown', copyAsMarkdown)
  bus.off('TABS::copy-document-as', copyDocumentAs)
  bus.off('EDITOR_TABS::change-max-width', changeMaxWidth)
})
</script>

<style scoped>
/* C-38 T-006: the close glyph and the unsaved dot are two glyphs from
   the chromeIcons set. Same visibility contract as the old single-svg
   pair: hidden at rest, dot always on unsaved non-active tabs, X on
   hover and on the active tab. */
svg.close-icon {
  transition: all 0.15s ease-in-out;
  cursor: pointer;
  color: var(--editorColor50);
}

svg.close-icon:hover {
  color: var(--focusColor);
}

svg.unsaved-dot {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  color: var(--themeColor);
  display: none;
}

.editor-tabs {
  position: relative;
  display: flex;
  flex-direction: row;
  height: 35px;
  user-select: none;
  box-shadow: 0px 0px 9px 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  &:hover > .new-file {
    opacity: 1 !important;
  }
}
.scrollable-tabs {
  flex: 0 1 auto;
  height: 35px;
  overflow: hidden;
}
.tabs-container {
  min-width: min-content;
  list-style: none;
  margin: 0;
  padding: 0;
  height: 35px;
  position: relative;
  display: flex;
  flex-direction: row;
  overflow-y: hidden;
  z-index: 2;
  &::-webkit-scrollbar:horizontal {
    display: none;
  }
  & > li {
    transition: all 0.15s ease-in-out;
    position: relative;
    padding: 0 8px;
    color: var(--editorColor50);
    font-size: 12px;
    line-height: 35px;
    height: 35px;
    max-width: 280px;
    border-top-right-radius: 15px;
    border-top-left-radius: 15px;
    display: flex;
    align-items: center;
    &[aria-grabbed='true'] {
      color: var(--editorColor30) !important;
    }
    & > svg {
      opacity: 0;
    }
    /* C-40 T-004: the lock badge is always visible (unlike the close
       icon, which appears on hover) — a read-only tab must be legible
       at rest. */
    & > svg.tab-lock-badge {
      opacity: 1;
      flex-shrink: 0;
      margin-right: 2px;
      color: var(--editorColor50);
    }
    &:focus {
      outline: none;
    }
    &:hover {
      background: var(--floatBgColor) !important;
    }
    &:hover > svg {
      opacity: 1;
    }
    &:hover > svg.unsaved-dot {
      display: none !important;
    }
    & > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 3px;
    }
  }
  & > li.unsaved:not(.active) {
    & > svg.close-icon {
      opacity: 0;
    }
    & > svg.unsaved-dot {
      display: block;
      opacity: 1;
    }
  }
  & > li.active {
    background: var(--itemBgColor);
    z-index: 3;
    &:after {
      content: '';
      position: absolute;
      left: 0;
      bottom: 0;
      right: 0;
      height: 2px;
      background: var(--chromeAccent);
    }
    & > svg {
      opacity: 1;
    }
    & > svg.unsaved-dot {
      display: none;
    }
  }
}
.editor-tabs > .new-file {
  flex: 0 0 35px;
  width: 35px;
  height: 35px;
  border-right: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-around;
  cursor: pointer;
  color: var(--editorColor50);
  opacity: 0;
  &.always-visible {
    opacity: 1;
  }
}

.editor-tabs > .new-file:hover {
  transition: all 0.15s ease-in-out;
  & > svg {
    color: var(--focusColor);
  }
}

/* dragula effects */
.gu-mirror {
  position: fixed !important;
  margin: 0 !important;
  z-index: 9999 !important;
  opacity: 0.8;
  cursor: grabbing;
}
.gu-hide {
  display: none !important;
}
.gu-unselectable {
  user-select: none !important;
}
.gu-transit {
  opacity: 0.2;
}
</style>
