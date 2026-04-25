<template>
  <div>
    <div class="title-bar-editor-bg" :class="{ 'tabs-visible': showTabBar }"></div>
    <div
      class="title-bar"
      :class="[
        { active: active },
        { 'tabs-visible': showTabBar },
        { frameless: titleBarStyle === 'custom' },
        { isOsx: isOsx }
      ]"
    >
      <div class="title" @dblclick.stop="toggleMaxmizeOnMacOS">
        <span v-if="!filename">Mark</span>
        <span v-else>
          <span v-for="(path, index) of paths" :key="index">
            {{ path }}
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-arrow-right"></use>
            </svg>
          </span>
          <span class="filename" :class="{ isOsx: platform === 'darwin' }" @click="rename">
            {{ filename }}
          </span>
          <span class="save-dot" :class="{ show: !isSaved }"></span>
        </span>
      </div>
      <!-- v1.1.0: navigation cluster — sidebar-toggle + Files + TOC + Settings, all left,
           no gap between them. Replaces the per-icon left column inside sidebar. -->
      <div
        class="titlebar-nav title-no-drag"
        :class="{ 'titlebar-nav--osx': isOsx }"
      >
        <div
          class="titlebar-nav-btn"
          :class="{ active: showSideBar }"
          :title="t('menu.view.toggleSidebar')"
          @click.stop="handleSidebarToggleClick"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </div>
        <div
          class="titlebar-nav-btn"
          :class="{ active: showSideBar && rightColumn === 'files' }"
          :title="t('sideBar.icons.files')"
          @click.stop="handleNavClick('files')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
          </svg>
        </div>
        <div
          class="titlebar-nav-btn"
          :class="{ active: showSideBar && rightColumn === 'toc' }"
          :title="t('sideBar.icons.toc')"
          @click.stop="handleNavClick('toc')"
        >
          <!-- TOC: ≡ with varying line lengths to suggest outline depth -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="7" y1="11" x2="17" y2="11"/>
            <line x1="10" y1="16" x2="20" y2="16"/>
          </svg>
        </div>
        <div
          class="titlebar-nav-btn"
          :title="t('sideBar.icons.settings')"
          @click.stop="handleSettingsClick"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </div>
      </div>
      <div :class="showCustomTitleBar ? 'left-toolbar title-no-drag' : 'right-toolbar'">
        <div
          v-if="showCustomTitleBar"
          class="frameless-titlebar-menu title-no-drag"
          @click.stop="handleMenuClick"
        >
          <span class="text-center-vertical">&#9776;</span>
        </div>
        <el-tooltip
          v-if="wordCount"
          class="item"
          :content="`${wordCount[show]} ${HASH[show].full + (wordCount[show] > 1 ? 's' : '')}`"
          placement="bottom-end"
        >
          <template #content>
            <div class="title-item">
              <span class="front">{{ t('menu.counter.words') }}:</span
              ><span class="text">{{ wordCount['word'] }}</span>
            </div>
            <div class="title-item">
              <span class="front">{{ t('menu.counter.characters') }}:</span
              ><span class="text">{{ wordCount['character'] }}</span>
            </div>
            <div class="title-item">
              <span class="front">{{ t('menu.counter.paragraphs') }}:</span
              ><span class="text">{{ wordCount['paragraph'] }}</span>
            </div>
          </template>
          <div
            v-if="wordCount"
            class="word-count"
            :class="[{ 'title-no-drag': platform !== 'darwin' }]"
            @click.stop="handleWordClick"
          >
            <span class="text-center-vertical">{{ `${HASH[show].short} ${wordCount[show]}` }}</span>
          </div>
        </el-tooltip>
      </div>
      <div
        v-if="titleBarStyle === 'custom' && !isFullScreen && !isOsx"
        class="right-toolbar"
        :class="[{ 'title-no-drag': titleBarStyle === 'custom' }]"
      >
        <div
          class="frameless-titlebar-button frameless-titlebar-close"
          @click.stop="handleCloseClick"
        >
          <div>
            <svg width="10" height="10">
              <path :d="windowIconClose" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-toggle"
          @click.stop="handleMaximizeClick"
        >
          <div>
            <svg width="10" height="10">
              <path v-show="!isMaximized" :d="windowIconMaximize" />
              <path v-show="isMaximized" :d="windowIconRestore" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-minimize"
          @click.stop="handleMinimizeClick"
        >
          <div>
            <svg width="10" height="10">
              <path :d="windowIconMinimize" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getCurrentWindow, Menu as RemoteMenu } from '@electron/remote'
import { usePreferencesStore } from '@/store/preferences.js'
import { useLayoutStore } from '@/store/layout.js'
import { useProjectStore } from '@/store/project'
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import bus from '@/bus'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR } from '../../config'
import { isOsx as isOsxPlatform } from '@/util'
import { useEditorStore } from '@/store/editor'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  project: Object,
  filename: String,
  pathname: String,
  active: Boolean,
  wordCount: Object,
  platform: String,
  isSaved: Boolean
})

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const { t } = useI18n()

const isOsx = isOsxPlatform
const HASH = {
  word: {
    short: 'W',
    full: 'word'
  },
  character: {
    short: 'C',
    full: 'character'
  },
  paragraph: {
    short: 'P',
    full: 'paragraph'
  },
  all: {
    short: 'A',
    full: '(with space)character'
  }
}
const windowIconMinimize = minimizePath
const windowIconRestore = restorePath
const windowIconMaximize = maximizePath
const windowIconClose = closePath

const isFullScreen = ref(getCurrentWindow().isFullScreen())
const isMaximized = ref(getCurrentWindow().isMaximized())
const show = ref('word')

const { titleBarStyle } = storeToRefs(preferencesStore)
const { showTabBar, showSideBar, rightColumn } = storeToRefs(layoutStore)

const paths = computed(() => {
  if (!props.pathname) return []
  const pathnameToken = props.pathname.split(PATH_SEPARATOR).filter((i) => i)
  return pathnameToken.slice(0, pathnameToken.length - 1).slice(-3)
})

const showCustomTitleBar = computed(() => {
  return titleBarStyle.value === 'custom' && !isOsx
})

watch(
  () => props.filename,
  (value) => {
    // Set filename when hover on dock
    const hasOpenFolder = props.project && props.project.name
    let title = ''
    if (value) {
      title = hasOpenFolder ? `${value} - ${props.project.name}` : `${value}`
    } else {
      title = hasOpenFolder ? props.project.name : ''
    }

    document.title = title
  }
)

// Sidebar toggle: emits the canonical bus event (same path as Cmd+J).
const handleSidebarToggleClick = () => {
  bus.emit('view:toggle-layout-entry', 'showSideBar')
}

// In-flight guard: prevents two synchronous clicks (rapid double-click)
// from spawning two Finder dialogs. Cleared by the renderer's IPC reply
// path (mt::open-directory) or after a short timeout if user cancelled.
let dialogPending = false
const DIALOG_DEDUP_MS = 600

// Files / TOC / Settings titlebar nav with multi-root-aware Files semantics.
//
// Click 📂 (Files):
//   • sidebar closed     → open + switch to Files; no dialog
//   • on TOC view        → switch to Files; no dialog
//   • already on Files
//        with ≥1 project → opens Finder (intent: ADD another root)
//        with 0 projects → opens Finder (intent: FIRST folder)
//
// Click 📑 (TOC):
//   • only switches view; never opens dialog.
//
// All paths log a structured marker so the decision tree is debuggable
// post-hoc (per V-A6-5).
const handleNavClick = (view) => {
  const sidebarOpen = showSideBar.value
  const prevView = rightColumn.value
  const projectsCount = (projectStore.projectTrees || []).length
  // eslint-disable-next-line no-console
  console.debug(`[TitleBar][handleNavClick][BLOCK_ENTRY] view=${view} sidebarOpen=${sidebarOpen} prevView=${prevView} projectsCount=${projectsCount}`)

  let dispatched = []
  if (!sidebarOpen) {
    layoutStore.SET_LAYOUT({ rightColumn: view, showSideBar: true })
    // eslint-disable-next-line no-console
    console.debug(`[TitleBar][handleNavClick][BLOCK_OPEN_SIDEBAR] view=${view}`)
    dispatched.push('set_layout')
  } else if (prevView !== view) {
    layoutStore.SET_LAYOUT({ rightColumn: view })
    // eslint-disable-next-line no-console
    console.debug(`[TitleBar][handleNavClick][BLOCK_SWITCH_VIEW] view=${view} prevView=${prevView}`)
    dispatched.push('set_layout')
  }

  if (view === 'files') {
    // Decision tree for Finder dialog:
    //   already-on-files (sidebar open, prevView=files) AND ≥1 project → ADD
    //   no projects loaded (any state) → FIRST folder
    //   else → no dialog (it's a pure view switch)
    const alreadyOnFiles = sidebarOpen && prevView === 'files'
    if (alreadyOnFiles && projectsCount >= 1) {
      if (dialogPending) {
        // eslint-disable-next-line no-console
        console.debug('[TitleBar][handleNavClick][BLOCK_NOOP_DIALOG] reason=in-flight-guard')
      } else {
        dialogPending = true
        setTimeout(() => { dialogPending = false }, DIALOG_DEDUP_MS)
        projectStore.ASK_FOR_OPEN_PROJECT()
        // eslint-disable-next-line no-console
        console.debug('[TitleBar][handleNavClick][BLOCK_OPEN_DIALOG] reason=add-another-root')
        dispatched.push('ask_for_open_project')
      }
    } else if (projectsCount === 0) {
      if (dialogPending) {
        // eslint-disable-next-line no-console
        console.debug('[TitleBar][handleNavClick][BLOCK_NOOP_DIALOG] reason=in-flight-guard')
      } else {
        dialogPending = true
        setTimeout(() => { dialogPending = false }, DIALOG_DEDUP_MS)
        projectStore.ASK_FOR_OPEN_PROJECT()
        // eslint-disable-next-line no-console
        console.debug('[TitleBar][handleNavClick][BLOCK_OPEN_DIALOG] reason=no-projects-loaded')
        dispatched.push('ask_for_open_project')
      }
    } else {
      // eslint-disable-next-line no-console
      console.debug('[TitleBar][handleNavClick][BLOCK_NOOP_DIALOG] reason=view-switch-only')
    }
  }

  // eslint-disable-next-line no-console
  console.debug(`[TitleBar][handleNavClick][BLOCK_EXIT] dispatched=${dispatched.join(',') || 'none'}`)
}

const handleSettingsClick = () => {
  projectStore.OPEN_SETTING_WINDOW()
}

const handleWordClick = () => {
  const ITEMS = ['word', 'paragraph', 'character', 'all']
  const len = ITEMS.length
  let index = ITEMS.indexOf(show.value)
  index += 1
  if (index >= len) index = 0
  show.value = ITEMS[index]
}

const handleCloseClick = () => {
  getCurrentWindow().close()
}

const handleMaximizeClick = () => {
  const win = getCurrentWindow()
  if (win.isFullScreen()) {
    win.setFullScreen(false)
  } else if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
}

const toggleMaxmizeOnMacOS = () => {
  if (isOsx) {
    handleMaximizeClick()
  }
}

const handleMinimizeClick = () => {
  getCurrentWindow().minimize()
}

const handleMenuClick = () => {
  const win = getCurrentWindow()
  RemoteMenu.getApplicationMenu().popup({ window: win, x: 23, y: 20 })
}

const rename = () => {
  if (props.platform === 'darwin') {
    editorStore.RESPONSE_FOR_RENAME()
  }
}

const onMaximize = () => {
  isMaximized.value = true
}
const onUnmaximize = () => {
  isMaximized.value = false
}
const onEnterFullScreen = () => {
  isFullScreen.value = true
}
const onLeaveFullScreen = () => {
  isFullScreen.value = false
}

window.electron.ipcRenderer.on('mt::window-maximize', onMaximize)
window.electron.ipcRenderer.on('mt::window-unmaximize', onUnmaximize)
window.electron.ipcRenderer.on('mt::window-enter-full-screen', onEnterFullScreen)
window.electron.ipcRenderer.on('mt::window-leave-full-screen', onLeaveFullScreen)

onBeforeUnmount(() => {
  window.electron.ipcRenderer.removeListener('mt::window-maximize', onMaximize)
  window.electron.ipcRenderer.removeListener('mt::window-unmaximize', onUnmaximize)
  window.electron.ipcRenderer.removeListener('mt::window-enter-full-screen', onEnterFullScreen)
  window.electron.ipcRenderer.removeListener('mt::window-leave-full-screen', onLeaveFullScreen)
})
</script>

<style scoped>
.title-bar-editor-bg {
  height: var(--titleBarHeight);
  background: var(--editorBgColor);
  position: relative;
  left: 0;
  top: 0;
  right: 0;
}
.title-bar {
  -webkit-app-region: drag;
  user-select: none;
  background: transparent;
  height: var(--titleBarHeight);
  box-sizing: border-box;
  color: var(--editorColor50);
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
  transition: color 0.4s ease-in-out;
  cursor: default;
}
.active {
  color: var(--editorColor);
}
img {
  height: 90%;
  margin-top: 1px;
  vertical-align: top;
}
.title {
  padding: 0 142px;
  height: 100%;
  line-height: var(--titleBarHeight);
  font-size: 14px;
  text-align: center;
  transition: all 0.25s ease-in-out;
  & .filename {
    transition: all 0.25s ease-in-out;
  }
  &::after {
    content: '';
    position: absolute;
    top: 0;
    height: 1px;
    width: 100%;
    z-index: 1;
    -webkit-app-region: no-drag;
  }
}
div.title > span {
  /* Workaround for GH#339 */
  display: block;
  direction: rtl;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}

.title-bar .title .filename.isOsx:hover {
  color: var(--themeColor);
}

.active .save-dot {
  margin-left: 3px;
  width: 7px;
  height: 7px;
  display: inline-block;
  border-radius: 50%;
  background: var(--highlightThemeColor);
  opacity: 0.7;
  visibility: hidden;
}
.active .save-dot.show {
  visibility: visible;
}
.title:hover {
  color: var(sideBarTitleColor);
}

.left-toolbar {
  padding: 0 10px;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  width: 118px; /* + 2*10px padding*/
  display: flex;
  flex-direction: row;
}
.right-toolbar {
  height: 100%;
  position: absolute;
  top: 0;
  right: 0;
  width: 138px;
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
  & .item {
    margin-right: 10px;
  }
}

.word-count {
  cursor: pointer;
  font-size: 14px;
  color: var(--editorColor30);
  text-align: center;
  line-height: 24px;
  padding: 0 5px;
  box-sizing: border-box;
  transition: all 0.25s ease-in-out;
  & > .text-center-vertical {
    padding: 2px 5px;
    border-radius: 3px;
  }
  &:hover > span {
    background: var(--sideBarBgColor);
    color: var(--sideBarTitleColor);
  }
}

.title-no-drag {
  -webkit-app-region: no-drag;
}

/* v1.1.0: titlebar nav cluster — sidebar-toggle + Files + TOC + Settings,
   slammed together on the left, no gap. On macOS we shift past the three
   traffic-lights (~70px reserved), on Win/Linux we sit at left:8px. */
.titlebar-nav {
  position: absolute;
  top: 50%;
  left: 8px;
  /* +2px optical-center nudge to align with macOS traffic-light row. */
  transform: translateY(calc(-50% + 2px));
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0; /* explicit: no gap between buttons */
  z-index: 10;
}
.titlebar-nav--osx {
  left: 78px;
}
.titlebar-nav-btn {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  cursor: pointer;
  color: var(--editorColor50);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.titlebar-nav-btn:hover {
  background-color: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
  color: var(--sideBarTitleColor);
}
.titlebar-nav-btn.active {
  color: var(--sideBarTitleColor);
}
.titlebar-nav-btn.active::after {
  /* Underline bar when this view is currently the active sidebar content. */
  content: '';
  position: absolute;
  bottom: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 2px;
  background-color: var(--highlightThemeColor);
  border-radius: 1px;
}
.titlebar-nav-btn svg {
  pointer-events: none;
}
/* frameless window controls */
.frameless-titlebar-button {
  position: relative;
  display: block;
  width: 46px;
  height: var(--titleBarHeight);
}
.frameless-titlebar-button > div {
  position: absolute;
  display: inline-flex;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
}
.frameless-titlebar-menu {
  color: var(--sideBarColor);
}
.frameless-titlebar-close:hover {
  background-color: rgb(228, 79, 79);
}
.frameless-titlebar-minimize:hover,
.frameless-titlebar-toggle:hover {
  background-color: rgba(0, 0, 0, 0.1);
}
.frameless-titlebar-button svg {
  fill: #000000;
}
.frameless-titlebar-close:hover svg {
  fill: #ffffff;
}

.text-center-vertical {
  display: inline-block;
  vertical-align: middle;
  line-height: normal;
}
</style>

<style>
.title-item {
  height: 28px;
  line-height: 28px;
  & .front {
    opacity: 0.7;
  }
  & .text {
    margin-left: 10px;
  }
}
</style>
