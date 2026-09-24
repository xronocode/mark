// FILE: src/renderer/src/commands/index.js
// VERSION: 2.1.10-beta
// START_MODULE_CONTRACT
//   PURPOSE: Register renderer commands and route each command to its typed store, event-bus, or Tauri integration.
//   SCOPE: Static command definitions, platform-gated commands, and user-visible command outcomes; backend implementation is out of scope.
//   DEPENDS: renderer bus/stores, Tauri core, M-016 updater plugin, notification service.
//   LINKS: docs/knowledge-graph.xml M-009,M-013-A,M-016; docs/verification-plan.xml V-M-016.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RootCommand - Command-palette root and subcommand coordinator.
//   file.check-update - Checks the signed feed and applies an available update entirely in app.
//   edit.copy-as-html - Copies selection (or whole document) as rich text/html for email paste (C-3).
//   edit.copy-as-plain-text - Copies selection (or whole document) as markup-free plain text (C-12).
//   FileEncodingCommand - GRACE 4 synchronized symbol
//   LineEndingCommand - GRACE 4 synchronized symbol
//   QuickOpenCommand - GRACE 4 synchronized symbol
//   HeadingSearchCommand - C-19 barrel export (runtime palette command)
//   SpellcheckerLanguageCommand - GRACE 4 synchronized symbol
//   TrailingNewlineCommand - GRACE 4 synchronized symbol
//   default - GRACE 4 synchronized symbol
//   getCommandsWithDescriptions - GRACE 4 synchronized symbol
//   applyCapabilityGate - T-M5 build-mode gate: prunes disabled commands from the registry at boot.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-16 v2.1.10-beta: add edit.copy-as-html (C-3) — rich text/html clipboard via editor.vue copyAsHtmlRich handler.
//   - 2026-09-17 v2.1.11-beta: add edit.copy-as-plain-text (C-12) — markup-free plain-text clipboard via editor.vue copyAsPlainText handler.
//   - 2026-09-23 C-18: applyCapabilityGate no longer prunes file.export-file-pdf — PDF export is native (WKWebView print panel); exportPandoc stays informational.
//   - 2026-09-23 C-19: barrel-export HeadingSearchCommand (edit.go-to-heading, Cmd+T palette symbol search over the active document).
//   - 2026-08-07 v2.1.2-beta: remove the Terminal/Homebrew update branch and use the signed Tauri updater for every non-App-Store install.
// END_CHANGE_SUMMARY
//
// List of all static commands that are loaded into command center.
// step-8f: @electron/remote.getCurrentWindow removed. window.minimize
// and window.toggle-full-screen now route through mt::window-* IPCs
// (windowManager._listenForIpcMain).
import bus from '../bus'
import { delay, isOsx } from '@/util'
import { isUpdatable } from './utils'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'
import { usePreferencesStore } from '../store/preferences'

export { default as FileEncodingCommand } from './fileEncoding'
export { default as LineEndingCommand } from './lineEnding'
export { default as QuickOpenCommand } from './quickOpen'
export { default as HeadingSearchCommand } from './headingSearch'
export { default as SpellcheckerLanguageCommand } from './spellcheckerLanguage'
export { default as TrailingNewlineCommand } from './trailingNewline'

export class RootCommand {
  constructor(subcommands = []) {
    this.id = '#'
    this.description = '#'
    this.subcommands = subcommands
    this.subcommandSelectedIndex = -1
  }

  async run() {}
  async unload() {}

  // Execute the command.
  async execute() {
    throw new Error('Root command.')
  }
}

const focusEditorAndExecute = (fn) => {
  setTimeout(() => bus.emit('editor-focus'), 10)
  setTimeout(() => fn(), 150)
}

// C-15 T-M5: capability gate. applyCapabilityGate() removes commands whose
// backends are absent in app-store builds; it is invoked from
// bootstrap-ipc right after FETCH_BUILD_MODE and mutates the module-level
// `commands` array in place, so palette, menus and keybinding lookups all
// see the pruned set. Fail-open: without the call (shims/tests) everything
// stays registered.
export function applyCapabilityGate(caps) {
  const denied = []
  if (caps && caps.screenshot === false) denied.push('edit.screenshot')
  if (caps && caps.setDefaultHandler === false) denied.push('file.default-handler')
  if (!denied.length) return
  const drop = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i]
      if (denied.includes(item.id)) {
        list.splice(i, 1)
        continue
      }
      if (Array.isArray(item.subcommands)) drop(item.subcommands)
    }
  }
  drop(commands)
}

const commands = [
  // --------------------------------------------------------------------------
  // File

  {
    id: 'file.new-tab',
    execute: async () => {
      bus.emit('mt::new-untitled-tab', { selected: true, markdown: '' })
    }
  },
  {
    id: 'file.new-window',
    execute: async () => {
      window.electron.ipcRenderer.send('mt::cmd-new-editor-window')
    }
  },
  {
    id: 'file.open-file',
    execute: async () => {
      window.electron.ipcRenderer.send('mt::cmd-open-file')
    }
  },
  {
    id: 'file.open-folder',
    execute: async () => {
      const { useProjectStore } = await import('../store/project')
      const projectStore = useProjectStore()
      projectStore.ASK_FOR_OPEN_PROJECT()
    }
  },
  {
    id: 'file.save',
    execute: async () => {
      bus.emit('mt::editor-ask-file-save')
    }
  },
  {
    id: 'file.save-as',
    execute: async () => {
      bus.emit('mt::editor-ask-file-save-as')
    }
  },
  {
    id: 'file.save-all',
    execute: async () => {
      bus.emit('mt::editor-ask-file-save-all')
    }
  },
  {
    id: 'file.line-ending-lf',
    execute: async () => {
      bus.emit('mt::set-line-ending', 'lf')
    }
  },
  {
    id: 'file.line-ending-crlf',
    execute: async () => {
      bus.emit('mt::set-line-ending', 'crlf')
    }
  },
  {
    id: 'file.print',
    execute: async () => {
      await delay(50)
      bus.emit('showExportDialog', 'print')
    }
  },
  {
    id: 'file.share',
    execute: async () => {
      const { useEditorStore } = await import('../store/editor')
      const editor = useEditorStore()
      const path = editor.currentFile?.pathname
      if (!path) return
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mt_share_file', { path })
    }
  },
  {
    id: 'file.close-tab',
    execute: async () => {
      bus.emit('mt::editor-close-tab', null)
    }
  },
  {
    // Direct Window API. Lifecycle handler in m001_save_close
    // intercepts CloseRequested for the dirty-tab dialog before
    // destroy.
    id: 'file.close-window',
    execute: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    }
  },

  {
    id: 'file.toggle-auto-save',
    execute: async () => {
      window.electron.ipcRenderer.send('mt::cmd-toggle-autosave')
    }
  },
  {
    id: 'file.move-file',
    execute: async () => {
      bus.emit('mt::editor-move-file', null)
    }
  },
  {
    id: 'file.rename-file',
    execute: async () => {
      await delay(50)
      bus.emit('mt::editor-rename-file', null)
    }
  },
  {
    id: 'file.import-file',
    execute: async () => {
      window.electron.ipcRenderer.send('mt::cmd-import-file')
    }
  },
  {
    id: 'file.export-file',
    subcommands: [
      {
        id: 'file.export-file-html',
        description: 'Export as HTML',
        execute: async () => {
          await delay(50)
          bus.emit('showExportDialog', 'styledHtml')
        }
      },
      {
        id: 'file.export-file-pdf',
        description: 'Export as PDF',
        execute: async () => {
          await delay(50)
          bus.emit('showExportDialog', 'pdf')
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // Edit

  {
    id: 'edit.select-all',
    execute: async () => {
      bus.emit('selectAll')
    }
  },
  {
    id: 'edit.undo',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('undo', 'undo'))
    }
  },
  {
    id: 'edit.redo',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('redo', 'redo'))
    }
  },
  {
    id: 'edit.duplicate',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('duplicate', 'duplicate'))
    }
  },
  {
    id: 'edit.create-paragraph',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('createParagraph', 'createParagraph'))
    }
  },
  {
    id: 'edit.delete-paragraph',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('deleteParagraph', 'deleteParagraph'))
    }
  },
  {
    id: 'edit.find',
    execute: async () => {
      await delay(150)
      bus.emit('find', 'find')
    }
  },
  {
    id: 'edit.find-next',
    shortcut: [isOsx ? 'Cmd' : 'Ctrl', 'G'],
    execute: async () => {
      bus.emit('findNext')
    }
  },
  {
    id: 'edit.find-previous',
    shortcut: [isOsx ? 'Cmd' : 'Ctrl', 'Shift', 'G'],
    execute: async () => {
      bus.emit('findPrev')
    }
  },
  {
    id: 'edit.replace',
    execute: async () => {
      await delay(150)
      bus.emit('replace', 'replace')
    }
  },
  {
    id: 'edit.find-in-folder',
    shortcut: [isOsx ? 'Cmd' : 'Ctrl', 'Shift', 'F'],
    execute: async () => {
      bus.emit('projectSearch')
    }
  },
  {
    // C-19: heading symbol search over the active document (VS Code's
    // Cmd+T workspace-symbol binding). The palette command object is
    // constructed on demand — importing the editor store statically here
    // would create a require cycle (store/editor imports this registry).
    id: 'edit.go-to-heading',
    shortcut: [isOsx ? 'Cmd' : 'Ctrl', 'T'],
    execute: async () => {
      const { useEditorStore } = await import('../store/editor')
      const { default: HeadingSearchCommand } = await import('./headingSearch')
      bus.emit('show-command-palette', new HeadingSearchCommand({ editor: useEditorStore() }))
    }
  },
  {
    // C-17: canonicalize the document (whitespace, blank lines, setext→ATX,
    // heading cascade); one undo restores the original. Cmd/Ctrl+Shift+F is
    // taken by find-in-folder, so this mirrors the VS Code Shift+Alt+F.
    id: 'edit.format-document',
    shortcut: ['Shift', 'Alt', 'F'],
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('formatDocument'))
    }
  },
  {
    // Rich clipboard write (text/html + text/plain) handled by
    // editor.vue handleCopyAsHtml — see C-3. Native write path needs
    // no webview user gesture, unlike muya's execCommand transport.
    id: 'edit.copy-as-html',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('copyAsHtmlRich'))
    }
  },

  {
    // editor.vue handleCopyAsPlainText — see C-12. Renders through the
    // same marked+DOMPurify pipeline as C-3 and writes markup-free
    // plain text.
    id: 'edit.copy-as-plain-text',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('copyAsPlainText'))
    }
  },

  // --------------------------------------------------------------------------
  // Paragraph

  {
    id: 'paragraph.heading-1',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'heading 1'))
    }
  },
  {
    id: 'paragraph.heading-2',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'heading 2'))
    }
  },
  {
    id: 'paragraph.heading-3',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'heading 3'))
    }
  },
  {
    id: 'paragraph.heading-4',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'heading 4'))
    }
  },
  {
    id: 'paragraph.heading-5',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'heading 5'))
    }
  },
  {
    id: 'paragraph.heading-6',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'heading 6'))
    }
  },
  {
    id: 'paragraph.upgrade-heading',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'upgrade heading'))
    }
  },
  {
    id: 'paragraph.degrade-heading',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'degrade heading'))
    }
  },
  {
    id: 'paragraph.table',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'table'))
    }
  },
  {
    id: 'paragraph.code-fence',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'pre'))
    }
  },
  {
    id: 'paragraph.quote-block',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'blockquote'))
    }
  },
  {
    id: 'paragraph.math-formula',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'mathblock'))
    }
  },
  {
    id: 'paragraph.html-block',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'html'))
    }
  },
  {
    id: 'paragraph.order-list',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'ol-bullet'))
    }
  },
  {
    id: 'paragraph.bullet-list',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'ul-bullet'))
    }
  },
  {
    id: 'paragraph.task-list',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'ul-task'))
    }
  },
  {
    id: 'paragraph.loose-list-item',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'loose-list-item'))
    }
  },
  {
    id: 'paragraph.paragraph',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'paragraph'))
    }
  },
  {
    id: 'paragraph.reset-paragraph',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'reset-to-paragraph'))
    }
  },
  {
    id: 'paragraph.horizontal-line',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'hr'))
    }
  },
  {
    id: 'paragraph.front-matter',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('paragraph', 'front-matter'))
    }
  },

  // --------------------------------------------------------------------------
  // Format

  // NOTE: Focus editor to restore selection and try to apply the commmand.

  {
    id: 'format.strong',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'strong'))
    }
  },
  {
    id: 'format.emphasis',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'em'))
    }
  },
  {
    id: 'format.underline',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'u'))
    }
  },
  {
    id: 'format.highlight',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'mark'))
    }
  },
  {
    id: 'format.superscript',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'sup'))
    }
  },
  {
    id: 'format.subscript',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'sub'))
    }
  },
  {
    id: 'format.inline-code',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'inline_code'))
    }
  },
  {
    id: 'format.inline-math',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'inline_math'))
    }
  },
  {
    id: 'format.strike',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'del'))
    }
  },
  {
    id: 'format.hyperlink',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'link'))
    }
  },
  {
    id: 'format.image',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'image'))
    }
  },
  {
    id: 'format.clear-format',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('format', 'clear'))
    }
  },

  // --------------------------------------------------------------------------
  // Window

  // Window-management commands call @tauri-apps/api/window directly —
  // no backend wrapper required. Single source of truth (Tauri Window
  // API) for state queries + mutations.
  {
    id: 'window.minimize',
    execute: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().minimize()
    }
  },
  {
    id: 'window.toggle-always-on-top',
    execute: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const current = await win.isAlwaysOnTop()
      await win.setAlwaysOnTop(!current)
    }
  },
  {
    id: 'window.toggle-full-screen',
    execute: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const current = await win.isFullscreen()
      await win.setFullscreen(!current)
    }
  },

  {
    id: 'file.zoom',
    shortcut: [isOsx ? 'Cmd' : 'Ctrl', 'Scroll'],
    subcommands: [
      {
        id: 'file.zoom-0',
        description: '62.5%',
        value: 0.625
      },
      {
        id: 'file.zoom-1',
        description: '75%',
        value: 0.75
      },
      {
        id: 'file.zoom-2',
        description: '87.5%',
        value: 0.875
      },
      {
        id: 'file.zoom-3',
        description: '100%',
        value: 1.0
      },
      {
        id: 'file.zoom-4',
        description: '112.5%',
        value: 1.125
      },
      {
        id: 'file.zoom-5',
        description: '125%',
        value: 1.25
      },
      {
        id: 'file.zoom-6',
        description: '137.5%',
        value: 1.375
      },
      {
        id: 'file.zoom-7',
        description: '150%',
        value: 1.5
      },
      {
        id: 'file.zoom-8',
        description: '162.5%',
        value: 1.625
      },
      {
        id: 'file.zoom-9',
        description: '175%',
        value: 1.75
      },
      {
        id: 'file.zoom-10',
        description: '187.5%',
        value: 1.875
      },
      {
        id: 'file.zoom-11',
        description: '200%',
        value: 2.0
      }
    ],
    executeSubcommand: async (_, value) => {
      bus.emit('mt::window-zoom', value)
    }
  },

  // --------------------------------------------------------------------------
  // Window

  {
    id: 'window.change-theme',
    subcommands: [
      { id: 'window.change-theme-light', description: 'Cadmium Light', value: 'light' },
      { id: 'window.change-theme-graphite', description: 'Graphite', value: 'graphite' },
      { id: 'window.change-theme-ulysses', description: 'Ulysses', value: 'ulysses' },
      { id: 'window.change-theme-ayu-light', description: 'Ayu Light', value: 'ayu-light' },
      { id: 'window.change-theme-catppuccin-latte', description: 'Catppuccin Latte', value: 'catppuccin-latte' },
      { id: 'window.change-theme-everforest-light', description: 'Everforest Light', value: 'everforest-light' },
      { id: 'window.change-theme-gruvbox-light', description: 'Gruvbox Light', value: 'gruvbox-light' },
      { id: 'window.change-theme-rose-pine-dawn', description: 'Rosé Pine Dawn', value: 'rose-pine-dawn' },
      { id: 'window.change-theme-solarized-light', description: 'Solarized Light', value: 'solarized-light' },
      { id: 'window.change-theme-tokyo-night-light', description: 'Tokyo Night Light', value: 'tokyo-night-light' },
      { id: 'window.change-theme-dark', description: 'Dark', value: 'dark' },
      { id: 'window.change-theme-material-dark', description: 'Material Dark', value: 'material-dark' },
      { id: 'window.change-theme-one-dark', description: 'One Dark', value: 'one-dark' },
      { id: 'window.change-theme-ayu-dark', description: 'Ayu Dark', value: 'ayu-dark' },
      { id: 'window.change-theme-ayu-mirage', description: 'Ayu Mirage', value: 'ayu-mirage' },
      { id: 'window.change-theme-catppuccin-mocha', description: 'Catppuccin Mocha', value: 'catppuccin-mocha' },
      { id: 'window.change-theme-cyberdream', description: 'Cyberdream', value: 'cyberdream' },
      { id: 'window.change-theme-dracula', description: 'Dracula', value: 'dracula' },
      { id: 'window.change-theme-everforest-dark', description: 'Everforest Dark', value: 'everforest-dark' },
      { id: 'window.change-theme-gruvbox-dark', description: 'Gruvbox Dark', value: 'gruvbox-dark' },
      { id: 'window.change-theme-horizon-dark', description: 'Horizon Dark', value: 'horizon-dark' },
      { id: 'window.change-theme-kanagawa', description: 'Kanagawa', value: 'kanagawa' },
      { id: 'window.change-theme-monokai-pro', description: 'Monokai Pro', value: 'monokai-pro' },
      { id: 'window.change-theme-nightfox', description: 'Nightfox', value: 'nightfox' },
      { id: 'window.change-theme-nord', description: 'Nord', value: 'nord' },
      { id: 'window.change-theme-oxocarbon-dark', description: 'Oxocarbon Dark', value: 'oxocarbon-dark' },
      { id: 'window.change-theme-palenight', description: 'Palenight', value: 'palenight' },
      { id: 'window.change-theme-rose-pine', description: 'Rosé Pine', value: 'rose-pine' },
      { id: 'window.change-theme-rose-pine-moon', description: 'Rosé Pine Moon', value: 'rose-pine-moon' },
      { id: 'window.change-theme-solarized-dark', description: 'Solarized Dark', value: 'solarized-dark' },
      { id: 'window.change-theme-synthwave-84', description: "Synthwave '84", value: 'synthwave-84' },
      { id: 'window.change-theme-tokyo-night', description: 'Tokyo Night', value: 'tokyo-night' },
      { id: 'window.change-theme-tokyo-night-storm', description: 'Tokyo Night Storm', value: 'tokyo-night-storm' }
    ],
    executeSubcommand: async (_, theme) => {
      usePreferencesStore().SET_SINGLE_PREFERENCE({ type: 'theme', value: theme })
    }
  },

  // --------------------------------------------------------------------------
  // View

  {
    id: 'view.source-code-mode',
    execute: async () => {
      bus.emit('view:toggle-view-entry', 'sourceCode')
    }
  },
  {
    id: 'view.diff-mode',
    shortcut: [isOsx ? 'Cmd' : 'Ctrl', 'D'],
    execute: async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editor = useEditorStore()
      const tab = editor.currentFile
      if (tab && tab.id) {
        tab.diffMode = !tab.diffMode
        console.error(`[editor][diff][BLOCK_DIFF_TOGGLED state=${tab.diffMode ? 'on' : 'off'}]`)
      }
    }
  },
  {
    id: 'view.typewriter-mode',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('view:toggle-view-entry', 'typewriter'))
    }
  },
  {
    id: 'view.focus-mode',
    execute: async () => {
      focusEditorAndExecute(() => bus.emit('view:toggle-view-entry', 'focus'))
    }
  },
  {
    id: 'view.toggle-sidebar',
    execute: async () => {
      bus.emit('view:toggle-layout-entry', 'showSideBar')
    }
  },
  {
    id: 'view.toggle-tabbar',
    execute: async () => {
      bus.emit('view:toggle-layout-entry', 'showTabBar')
    }
  },
  {
    // C-17: markdownlint-subset problems overlay (click-to-jump list).
    id: 'view.problems',
    execute: async () => {
      bus.emit('problems')
    }
  },
  {
    // C-17: enable/disable validation; off clears the recomputation gate.
    id: 'view.toggle-markdown-lint',
    execute: async () => {
      const preferencesStore = usePreferencesStore()
      await preferencesStore.SET_SINGLE_PREFERENCE({
        type: 'markdownLint',
        value: !preferencesStore.markdownLint
      })
    }
  },

  {
    id: 'view.text-direction',
    subcommands: [
      {
        id: 'view.text-direction-ltr',
        description: 'Left to Right',
        value: 'ltr'
      },
      {
        id: 'view.text-direction-rtl',
        description: 'Right to Left',
        value: 'rtl'
      }
    ],
    executeSubcommand: async (_, value) => {
      // Same canonical preferenceStore broadcast path as theme switch.
      usePreferencesStore().SET_SINGLE_PREFERENCE({ type: 'textDirection', value })
    }
  },

  // --------------------------------------------------------------------------
  // Mark

  {
    id: 'file.preferences',
    execute: async () => {
      window.electron.ipcRenderer.send('mt::open-setting-window')
    }
  },
  {
    // file.quit invokes mt_app_quit which calls app.exit(0). The
    // wired close-handler in m001_save_close.wire_close_handler still
    // fires CloseRequested for every window first, so the dirty-tab
    // dialog runs as expected.
    id: 'file.quit',
    execute: async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mt_app_quit')
    }
  },
  {
    id: 'about',
    execute: async () => {
      bus.emit('aboutDialog')
    }
  },
  {
    id: 'docs.user-guide',
    execute: async () => {
      window.electron.shell.openExternal(
        'https://github.com/xronocode/mark'
      )
    }
  },
  {
    id: 'docs.markdown-syntax',
    execute: async () => {
      window.electron.shell.openExternal(
        'https://github.com/xronocode/mark/blob/main/docs/MARKDOWN_SYNTAX.md'
      )
    }
  },

  // --------------------------------------------------------------------------
  // Misc

  {
    id: 'tabs.cycleForward',
    execute: async () => {
      bus.emit('mt::tabs-cycle-right')
    }
  },
  {
    id: 'tabs.cycleBackward',
    execute: async () => {
      bus.emit('mt::tabs-cycle-left')
    }
  }
]

// --------------------------------------------------------------------------
// etc

if (isUpdatable()) {
  commands.push({
    id: 'file.check-update',
    execute: async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const notice = (await import('../services/notification')).default
      try {
        const status = await invoke('mt_updater_check')
        if (!status.available) {
          if (status.statusNote) {
            notice.notify({ title: status.statusNote, type: 'warning' })
          } else {
            notice.notify({
              title: `Mark ${status.currentVersion} is up to date`,
              type: 'info'
            })
          }
          return
        }
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (update) {
          notice.notify({
            title: `Updating to Mark ${status.latestVersion}…`,
            type: 'info'
          })
          await update.downloadAndInstall()
          const { relaunch } = await import('@tauri-apps/plugin-process')
          await relaunch()
        } else {
          notice.notify({
            title: `Mark ${status.currentVersion} is up to date`,
            type: 'info'
          })
        }
      } catch (e) {
        notice.notify({ title: 'Update failed', message: String(e), type: 'warning' })
      }
    }
  })
}

if (isOsx) {
  commands.push({
    id: 'edit.screenshot',
    execute: async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const bytes = await invoke('mt_screenshot_capture', { options: { mode: 'interactive' } })
        if (bytes && bytes.length) {
          bus.emit('screenshot-captured', bytes)
        }
      } catch (e) {
        const notice = (await import('../services/notification')).default
        notice.notify({ title: 'Screenshot failed', message: String(e), type: 'warning' })
      }
    }
  })
}

// Function to get commands with updated descriptions
export const getCommandsWithDescriptions = async () => {
  // Update descriptions for all commands
  const updateDescriptions = (commandList) => {
    for (const item of commandList) {
      const { id, subcommands } = item
      // Always update description for commands with ID, regardless of existing description
      if (id) {
        item.description = getCommandDescriptionById(id)
      }

      // Also update other subcommands descriptions
      if (subcommands && Array.isArray(subcommands)) {
        updateDescriptions(subcommands)
      }
    }
  }

  updateDescriptions(commands)
  return commands
}

// Complete all command descriptions for initial load.
for (const item of commands) {
  const { id, description } = item
  if (id && !description) {
    item.description = getCommandDescriptionById(id)
  }
}

export default commands
