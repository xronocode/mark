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
          <span>{{ file.filename }}</span>
          <svg class="close-icon icon" aria-hidden="true" @click.stop="removeFileInTab(file)">
            <circle id="unsaved-circle-icon" cx="6" cy="6" r="3"></circle>
            <use id="default-close-icon" xlink:href="#icon-close-small"></use>
          </svg>
        </li>
      </ul>
    </div>
    <div class="new-file" @click.stop="newFile()">
      <svg class="icon" aria-hidden="true">
        <use xlink:href="#icon-plus"></use>
      </svg>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/editorWithTabs/tabs.vue
// VERSION: 1.2.0
// START_CHANGE_SUMMARY
//   - 2026-09-16 v1.1.0: auto-scroll the strip so the active tab is always visible (C-6) — activation via cycling, sidebar, close-to-neighbor, restore, or reorder no longer leaves the active tab off-screen.
//   - 2026-09-16 v1.2.0: ResizeObserver on the strip re-reveals the active tab after container resize (C-7).
// END_CHANGE_SUMMARY
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import autoScroll from 'dom-autoscroller'
import dragula from 'dragula'
import { showContextMenu } from '../../contextMenu/tabs'
import { computeActiveTabScroll } from '@/util/tabsScroll'
import bus from '../../bus'

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

const handleContextMenu = (event, tab) => {
  if (tab.id) {
    showContextMenu(event, tab)
  }
}

onMounted(() => {
  bus.on('TABS::close-this', closeTab)
  bus.on('TABS::close-others', closeOthers)
  bus.on('TABS::close-saved', closeSaved)
  bus.on('TABS::close-all', closeAll)
  bus.on('TABS::rename', rename)
  bus.on('TABS::copy-path', copyPath)
  bus.on('TABS::show-in-folder', showInFolder)
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
  bus.off('EDITOR_TABS::change-max-width', changeMaxWidth)
})
</script>

<style scoped>
svg.close-icon #unsaved-circle-icon {
  transition: all 0.15s ease-in-out;
  fill: var(--themeColor);
}

svg.close-icon:hover {
  cursor: pointer;
  fill: var(--focusColor);
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
    &:focus {
      outline: none;
    }
    &:hover {
      background: var(--floatBgColor) !important;
    }
    &:hover > svg {
      opacity: 1;
    }
    &:hover > svg.close-icon #default-close-icon {
      display: block !important;
    }
    &:hover > svg.close-icon #unsaved-circle-icon {
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
      opacity: 1;
    }
    & > svg.close-icon #unsaved-circle-icon {
      display: block;
    }
    & > svg.close-icon #default-close-icon {
      display: none;
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
      background: var(--themeColor);
    }
    & > svg {
      opacity: 1;
    }
    & > svg.close-icon #unsaved-circle-icon {
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
    fill: var(--focusColor);
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
