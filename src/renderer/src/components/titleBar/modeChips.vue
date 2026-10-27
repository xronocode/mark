<!--
  FILE: src/renderer/src/components/titleBar/modeChips.vue
  VERSION: 1.1.0
  START_MODULE_CONTRACT
    PURPOSE: C-TITLEBAR-MODE-CHIPS T-004 — the titlebar chips cluster:
             one document-view chip (icon + short label) for the current
             tab's exclusive view state, plus compact icon chips for the
             active writing modes; nothing renders in the standard state
             or with no document open.
    SCOPE: Projection of mode state (tab.splitView / tab.diffMode,
           preferences.sourceCode / typewriter / focus) into the chips and
           the two-group switch menu; menu actions dispatch the five
           existing renderer command ids and perform the spec's view
           normalization. Owns no document state and no new command ids.
    DEPENDS: vue, pinia stores (editor, preferences), vue-i18n,
             components/icons/chromeIcons.js.
    LINKS: .grace/graph/runtime.xml M-062; .grace/verification/runtime.xml
           V-M-062; .grace/changes/active/C-TITLEBAR-MODE-CHIPS/spec.xml
           R-1, R-4, R-7.
    ROLE: RUNTIME
    MAP_MODE: LOCALS
  END_MODULE_CONTRACT

  START_MODULE_MAP
    VIEW_ORDER - flag-truth precedence: diffMode > splitView > sourceCode.
    viewId - the visible view chip id, or null.
    writingModes - active writing-mode ids (typewriter, focus).
    chips - everything the template renders, in bar order.
    narrow - editor container below MIN_SPLIT_WIDTH (split note).
  END_MODULE_MAP

  START_CHANGE_SUMMARY
    LAST_CHANGE: v1.1.0 - 2026-10-27 C-TITLEBAR-MODE-CHIPS T-005: the
    two-group switch menu — exclusive document views with normalization,
    independent writing toggles, visible-surface checkmarks, shipped
    shortcuts, hint lines, the reset footer, live reactivity, outside-click
    and Escape closing, and the BLOCK_MENU_ACTION marker.
    v1.0.0 - 2026-10-27 T-004: initial chips cluster — flag-truth view
    chip, compact writing chips, hint tooltips, aria-labels from the short
    labels, narrow-window note and the BLOCK_CHIPS_RENDERED log marker.
  END_CHANGE_SUMMARY
-->
<template>
  <div class="titlebar-mode-chips-wrap" ref="rootRef">
    <div v-if="chips.length" class="titlebar-mode-chips" data-testid="mode-chips">
      <button
        v-for="chip in chips"
        :key="chip.key"
        type="button"
        class="mode-chip"
        :class="{ 'mode-chip--labelled': chip.label }"
        :title="chip.tooltip"
        :aria-label="chip.aria"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        @click.stop="toggleMenu"
      >
        <chrome-icon :name="chip.icon" :size="16"></chrome-icon>
        <span v-if="chip.label" class="mode-chip-label">{{ chip.label }}</span>
      </button>
    </div>

    <div
      v-if="open"
      class="mode-menu"
      data-testid="mode-menu"
      role="menu"
      @click.stop
    >
      <div class="mode-menu-group-title">{{ t('titleBar.modeChips.viewGroup') }}</div>
      <button
        v-for="option in viewOptions"
        :key="option.id"
        type="button"
        role="menuitemradio"
        :aria-checked="activeView === option.id ? 'true' : 'false'"
        class="mode-menu-row"
        :class="{ 'is-active': activeView === option.id }"
        :title="option.hint"
        @click="selectView(option.id)"
      >
        <span class="mode-menu-check" aria-hidden="true">{{ activeView === option.id ? '✓' : '' }}</span>
        <chrome-icon :name="option.icon" :size="16"></chrome-icon>
        <span class="mode-menu-text">
          <span class="mode-menu-label">{{ option.label }}</span>
          <span class="mode-menu-hint">{{ option.hint }}</span>
        </span>
        <kbd v-if="option.shortcut" class="mode-menu-shortcut">{{ option.shortcut }}</kbd>
      </button>

      <div class="mode-menu-group-title">{{ t('titleBar.modeChips.writingGroup') }}</div>
      <button
        v-for="option in writingOptions"
        :key="option.id"
        type="button"
        role="menuitemcheckbox"
        :aria-checked="option.checked ? 'true' : 'false'"
        class="mode-menu-row"
        :class="{ 'is-active': option.checked }"
        :title="option.hint"
        @click="toggleWriting(option.id)"
      >
        <span class="mode-menu-check" aria-hidden="true">{{ option.checked ? '✓' : '' }}</span>
        <chrome-icon :name="option.icon" :size="16"></chrome-icon>
        <span class="mode-menu-text">
          <span class="mode-menu-label">{{ option.label }}</span>
          <span class="mode-menu-hint">{{ option.hint }}</span>
        </span>
      </button>

      <div class="mode-menu-footer">
        <button type="button" class="mode-menu-row mode-menu-reset" @click="resetAll">
          <span class="mode-menu-check" aria-hidden="true"></span>
          <span class="mode-menu-text">
            <span class="mode-menu-label">{{ t('titleBar.modeChips.resetAll') }}</span>
            <span class="mode-menu-hint">{{ t('titleBar.modeChips.hintReset') }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { isOsx } from '@/util'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences.js'
import { ChromeIcon } from '../icons/chromeIcons.js'

const MIN_SPLIT_WIDTH = 800

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const { t } = useI18n()

const emit = defineEmits(['open-menu'])

const rootRef = ref(null)
const open = ref(false)
const tab = computed(() => editorStore.currentFile || null)
const hasDocument = computed(() => !!(tab.value && tab.value.id))

// Flag truth: a stale splitView flag must never outrank diff mode.
const viewId = computed(() => {
  if (!hasDocument.value) return null
  if (tab.value.diffMode) return 'changes'
  if (tab.value.splitView) return 'split'
  if (preferencesStore.sourceCode) return 'source'
  return null
})

const activeView = computed(() => viewId.value || 'standard')

const writingModes = computed(() => {
  if (!hasDocument.value) return []
  const modes = []
  if (preferencesStore.typewriter) modes.push('typewriter')
  if (preferencesStore.focus) modes.push('focus')
  return modes
})

// R-7: the split stays visible but its state is explained when the editor
// container can no longer hold two panes.
const narrow = ref(false)
let resizeObserver = null

const measure = () => {
  const surface = document.querySelector('.editor-with-tabs')
  const width = surface && surface.clientWidth ? surface.clientWidth : window.innerWidth
  narrow.value = width < MIN_SPLIT_WIDTH
}

const hint = (id) => t(`titleBar.modeChips.hint${id[0].toUpperCase()}${id.slice(1)}`)
const shortLabel = (id) => t(`titleBar.modeChips.${id}`)

const chips = computed(() => {
  if (!hasDocument.value) return []
  const out = []
  if (viewId.value) {
    const id = viewId.value
    let tooltip = hint(id)
    if (id === 'split' && narrow.value) {
      tooltip = `${tooltip} — ${t('titleBar.modeChips.narrowNote')}`
    }
    out.push({
      key: `view-${id}`,
      id,
      icon: `mode-${id}`,
      label: shortLabel(id),
      aria: shortLabel(id),
      tooltip
    })
  }
  for (const id of writingModes.value) {
    out.push({
      key: `writing-${id}`,
      id,
      icon: `mode-${id}`,
      label: '',
      aria: shortLabel(id),
      tooltip: hint(id)
    })
  }
  return out
})

const shortcuts = computed(() => ({
  split: isOsx ? '⌥⌘\\' : 'Ctrl+Alt+\\',
  source: isOsx ? '⌘⌥S' : 'Ctrl+Alt+S',
  changes: isOsx ? '⌘D' : 'Ctrl+D'
}))

const viewOptions = computed(() => [
  { id: 'standard', icon: 'mode-standard', label: t('titleBar.modeChips.standard'), hint: t('titleBar.modeChips.hintStandard') },
  { id: 'split', icon: 'mode-split', label: shortLabel('split'), hint: t('titleBar.modeChips.hintSplit'), shortcut: shortcuts.value.split },
  { id: 'source', icon: 'mode-source', label: shortLabel('source'), hint: t('titleBar.modeChips.hintSource'), shortcut: shortcuts.value.source },
  { id: 'changes', icon: 'mode-diff', label: shortLabel('changes'), hint: t('titleBar.modeChips.hintChanges'), shortcut: shortcuts.value.changes }
])

const writingOptions = computed(() => [
  { id: 'typewriter', icon: 'mode-typewriter', label: shortLabel('typewriter'), hint: t('titleBar.modeChips.hintTypewriter'), checked: !!preferencesStore.typewriter },
  { id: 'focus', icon: 'mode-focus', label: shortLabel('focus'), hint: t('titleBar.modeChips.hintFocus'), checked: !!preferencesStore.focus }
])

// Menu actions reuse the shipped command ids — no new ids, and the
// normalization the spec demands lives here (one action, one end state).
const runCommand = (id) => bus.emit('cmd::execute', id)

const selectView = (id) => {
  const current = tab.value
  if (!current) return
  if (id === 'standard') {
    if (current.diffMode) runCommand('view.diff-mode')
    if (current.splitView) runCommand('view.split-view')
    if (preferencesStore.sourceCode) runCommand('view.source-code-mode')
  } else if (id === 'split') {
    if (current.diffMode) runCommand('view.diff-mode')
    if (!current.splitView) runCommand('view.split-view')
  } else if (id === 'source') {
    if (current.diffMode) runCommand('view.diff-mode')
    if (current.splitView) runCommand('view.split-view')
    if (!preferencesStore.sourceCode) runCommand('view.source-code-mode')
  } else if (id === 'changes') {
    if (current.splitView) runCommand('view.split-view')
    if (!current.diffMode) runCommand('view.diff-mode')
  }
  console.debug(`[TitleBar][mode-chips][BLOCK_MENU_ACTION command=view.${id} view=${id}]`)
}

const toggleWriting = (id) => {
  runCommand(`view.${id}-mode`)
  console.debug(
    `[TitleBar][mode-chips][BLOCK_MENU_ACTION command=view.${id}-mode view=${activeView.value}]`
  )
}

const resetAll = () => {
  selectView('standard')
  if (preferencesStore.typewriter) runCommand('view.typewriter-mode')
  if (preferencesStore.focus) runCommand('view.focus-mode')
  console.debug('[TitleBar][mode-chips][BLOCK_MENU_ACTION command=reset view=standard]')
}

const toggleMenu = (event) => {
  open.value = !open.value
  if (open.value) {
    console.debug('[TitleBar][mode-chips][BLOCK_MENU_OPENED]')
    emit('open-menu', { anchor: event?.currentTarget ?? null })
  }
}

const closeMenu = () => {
  open.value = false
}

const onPointerDown = (event) => {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target)) closeMenu()
}

const onKeyDown = (event) => {
  if (event.key === 'Escape' && open.value) closeMenu()
}

watchEffect(() => {
  const view = viewId.value || 'none'
  const writing = writingModes.value.join(',') || 'none'
  const tabId = hasDocument.value ? tab.value.id : 'none'
  console.debug(
    `[TitleBar][mode-chips][BLOCK_CHIPS_RENDERED view=${view} writing=${writing} tab=${tabId}]`
  )
})

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  if (typeof ResizeObserver !== 'undefined') {
    const surface = document.querySelector('.editor-with-tabs')
    if (surface) {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(surface)
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKeyDown)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

defineExpose({ viewId, writingModes, narrow, open })
</script>

<style scoped>
.titlebar-mode-chips-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.titlebar-mode-chips {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: 2px;
}
.mode-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1200;
  width: 320px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--floatBorderColor, rgba(0, 0, 0, 0.12));
  background: var(--floatBgColor, #fff);
  color: var(--editorColor, #222);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}
.mode-menu-group-title {
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}
.mode-menu-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: default;
}
.mode-menu-row:hover,
.mode-menu-row.is-active {
  background: var(--itemBgColor, rgba(0, 0, 0, 0.06));
}
.mode-menu-check {
  width: 14px;
  flex: none;
  text-align: center;
  opacity: 0.9;
}
.mode-menu-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.mode-menu-label {
  font-size: 13px;
  line-height: 1.3;
}
.mode-menu-hint {
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.62;
}
.mode-menu-shortcut {
  flex: none;
  font-family: inherit;
  font-size: 11px;
  opacity: 0.6;
}
.mode-menu-footer {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--floatBorderColor, rgba(0, 0, 0, 0.1));
}
.mode-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  min-width: 28px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  cursor: default;
  color: var(--editorColor80);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.mode-chip--labelled {
  padding: 0 6px;
}
.mode-chip:hover {
  background-color: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
  color: var(--sideBarTitleColor);
}
.mode-chip svg {
  pointer-events: none;
}
.mode-chip-label {
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
}
</style>
