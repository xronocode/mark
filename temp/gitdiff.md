diff --git a/src/muya/lib/ui/quickInsert/index.js b/src/muya/lib/ui/quickInsert/index.js
index 8a76d8e4..e76c2964 100644
--- a/src/muya/lib/ui/quickInsert/index.js
+++ b/src/muya/lib/ui/quickInsert/index.js
@@ -138,6 +138,12 @@ class QuickInsert extends BaseScrollFloat {
 
   selectItem (item) {
     const { contentState } = this.muya
+    // 检查 block 是否存在，避免 null 引用错误
+    if (!this.block) {
+      console.warn('QuickInsert: block is null, cannot select item')
+      this.hide()
+      return
+    }
     this.block.text = ''
     const { key } = this.block
     const offset = 0
diff --git a/src/renderer/src/commands/descriptions.js b/src/renderer/src/commands/descriptions.js
index 712a409c..4c2a0895 100644
--- a/src/renderer/src/commands/descriptions.js
+++ b/src/renderer/src/commands/descriptions.js
@@ -1,5 +1,3 @@
-import { t } from '../../i18n'
-
 const getCommandDescriptions = () => {
   
   return Object.freeze({
@@ -7,126 +5,115 @@ const getCommandDescriptions = () => {
     // # Key binding descriptions
     // #
 
-    'mt.hide': t('commands.mt.hide'),
-    'mt.hide-others': t('commands.mt.hideOthers'),
-    'file.new-window': t('commands.file.newWindow'),
-    'file.new-tab': t('commands.file.newTab'),
-    'file.open-file': t('commands.file.openFile'),
-    'file.open-folder': t('commands.file.openFolder'),
-    'file.save': t('commands.file.save'),
-    'file.save-as': t('commands.file.saveAs'),
-    'file.move-file': t('commands.file.moveFile'),
-    'file.rename-file': t('commands.file.renameFile'),
-    'file.quick-open': t('commands.file.quickOpen'),
-    'file.print': t('commands.file.print'),
-    'file.preferences': t('commands.file.preferences'),
-    'file.close-tab': t('commands.file.closeTab'),
-    'file.close-window': t('commands.file.closeWindow'),
-    'file.quit': t('commands.file.quit'),
-    'edit.undo': t('commands.edit.undo'),
-    'edit.redo': t('commands.edit.redo'),
-    'edit.cut': t('commands.edit.cut'),
-    'edit.copy': t('commands.edit.copy'),
-    'edit.paste': t('commands.edit.paste'),
-    'edit.copy-as-markdown': t('commands.edit.copyAsMarkdown'),
-    'edit.copy-as-html': t('commands.edit.copyAsHtml'),
-    'edit.paste-as-plaintext': t('commands.edit.pasteAsPlaintext'),
-    'edit.select-all': t('commands.edit.selectAll'),
-    'edit.duplicate': t('commands.edit.duplicate'),
-    'edit.create-paragraph': t('commands.edit.createParagraph'),
-    'edit.delete-paragraph': t('commands.edit.deleteParagraph'),
-    'edit.find': t('commands.edit.find'),
-    'edit.find-next': t('commands.edit.findNext'),
-    'edit.find-previous': t('commands.edit.findPrevious'),
-    'edit.replace': t('commands.edit.replace'),
-    'edit.find-in-folder': t('commands.edit.findInFolder'),
-    'edit.screenshot': t('commands.edit.screenshot'),
-    'paragraph.heading-1': t('commands.paragraph.heading1'),
-    'paragraph.heading-2': t('commands.paragraph.heading2'),
-    'paragraph.heading-3': t('commands.paragraph.heading3'),
-    'paragraph.heading-4': t('commands.paragraph.heading4'),
-    'paragraph.heading-5': t('commands.paragraph.heading5'),
-    'paragraph.heading-6': t('commands.paragraph.heading6'),
-    'paragraph.upgrade-heading': t('commands.paragraph.upgradeHeading'),
-    'paragraph.degrade-heading': t('commands.paragraph.degradeHeading'),
-    'paragraph.table': t('commands.paragraph.table'),
-    'paragraph.code-fence': t('commands.paragraph.codeFence'),
-    'paragraph.quote-block': t('commands.paragraph.quoteBlock'),
-    'paragraph.math-formula': t('commands.paragraph.mathFormula'),
-    'paragraph.html-block': t('commands.paragraph.htmlBlock'),
-    'paragraph.order-list': t('commands.paragraph.orderList'),
-    'paragraph.bullet-list': t('commands.paragraph.bulletList'),
-    'paragraph.task-list': t('commands.paragraph.taskList'),
-    'paragraph.loose-list-item': t('commands.paragraph.looseListItem'),
-    'paragraph.paragraph': t('commands.paragraph.paragraph'),
-    'paragraph.horizontal-line': t('commands.paragraph.horizontalLine'),
-    'paragraph.front-matter': t('commands.paragraph.frontMatter'),
-    'format.strong': t('commands.format.strong'),
-    'format.emphasis': t('commands.format.emphasis'),
-    'format.underline': t('commands.format.underline'),
-    'format.superscript': t('commands.format.superscript'),
-    'format.subscript': t('commands.format.subscript'),
-    'format.highlight': t('commands.format.highlight'),
-    'format.inline-code': t('commands.format.inlineCode'),
-    'format.inline-math': t('commands.format.inlineMath'),
-    'format.strike': t('commands.format.strike'),
-    'format.hyperlink': t('commands.format.hyperlink'),
-    'format.image': t('commands.format.image'),
-    'format.clear-format': t('commands.format.clearFormat'),
-    'window.minimize': t('commands.window.minimize'),
-    'window.toggle-always-on-top': t('commands.window.toggleAlwaysOnTop'),
-    'window.zoomIn': t('window.zoomIn'),
-    'window.zoomOut': t('window.zoomOut'),
-    'window.toggle-full-screen': t('commands.window.toggleFullScreen'),
-    'view.command-palette': t('commands.view.commandPalette'),
-    'view.source-code-mode': t('commands.view.sourceCodeMode'),
-    'view.typewriter-mode': t('commands.view.typewriterMode'),
-    'view.focus-mode': t('commands.view.focusMode'),
-    'view.toggle-sidebar': t('commands.view.toggleSidebar'),
-    'view.toggle-toc': t('commands.view.toggleToc'),
-    'view.toggle-tabbar': t('commands.view.toggleTabbar'),
-    'view.toggle-dev-tools': t('commands.view.toggleDevTools'),
-    'view.dev-reload': t('commands.view.devReload'),
-    'tabs.cycle-forward': t('commands.tabs.cycleForward'),
-    'tabs.cycle-backward': t('commands.tabs.cycleBackward'),
-    'tabs.switchToleft': t('commands.tabs.switchToLeft'),
-    'tabs.switchToright': t('commands.tabs.switchToRight'),
-    'tabs.switchTofirst': t('commands.tabs.switchToFirst'),
-    'tabs.switchTosecond': t('commands.tabs.switchToSecond'),
-    'tabs.switchTothird': t('commands.tabs.switchToThird'),
-    'tabs.switchTofourth': t('commands.tabs.switchToFourth'),
-    'tabs.switchTofifth': t('commands.tabs.switchToFifth'),
-    'tabs.switchTosixth': t('commands.tabs.switchToSixth'),
-    'tabs.switchToseventh': t('commands.tabs.switchToSeventh'),
-    'tabs.switchToeighth': t('commands.tabs.switchToEighth'),
-    'tabs.switchToninth': t('commands.tabs.switchToNinth'),
-    'tabs.switchTotenth': t('commands.tabs.switchToTenth'),
+    'mt.hide': 'Hide MarkText',
+    'mt.hide-others': 'Hide Others',
+    'file.new-window': 'File: New Window',
+    'file.new-tab': 'File: New Tab',
+    'file.open-file': 'File: Open File',
+    'file.open-folder': 'File: Open Folder',
+    'file.save': 'File: Save',
+    'file.save-as': 'File: Save As',
+    'file.move-file': 'File: Move File',
+    'file.rename-file': 'File: Rename File',
+    'file.quick-open': 'File: Quick Open',
+    'file.print': 'File: Print',
+    'file.preferences': 'File: Preferences',
+    'file.close-tab': 'File: Close Tab',
+    'file.close-window': 'File: Close Window',
+    'file.quit': 'File: Quit',
+    'edit.undo': 'Edit: Undo',
+    'edit.redo': 'Edit: Redo',
+    'edit.cut': 'Edit: Cut',
+    'edit.copy': 'Edit: Copy',
+    'edit.paste': 'Edit: Paste',
+    'edit.copy-as-markdown': 'Edit: Copy as Markdown',
+    'edit.copy-as-html': 'Edit: Copy as HTML',
+    'edit.paste-as-plaintext': 'Edit: Paste as Plaintext',
+    'edit.select-all': 'Edit: Select All',
+    'edit.duplicate': 'Edit: Duplicate',
+    'edit.create-paragraph': 'Edit: Create Paragraph',
+    'edit.delete-paragraph': 'Edit: Delete Paragraph',
+    'edit.find': 'Edit: Find',
+    'edit.find-next': 'Edit: Find Next',
+    'edit.find-previous': 'Edit: Find Previous',
+    'edit.replace': 'Edit: Replace',
+    'edit.find-in-folder': 'Edit: Find in Folder',
+    'edit.screenshot': 'Edit: Screenshot',
+    'paragraph.heading-1': 'Paragraph: Heading 1',
+    'paragraph.heading-2': 'Paragraph: Heading 2',
+    'paragraph.heading-3': 'Paragraph: Heading 3',
+    'paragraph.heading-4': 'Paragraph: Heading 4',
+    'paragraph.heading-5': 'Paragraph: Heading 5',
+    'paragraph.heading-6': 'Paragraph: Heading 6',
+    'paragraph.upgrade-heading': 'Paragraph: Upgrade Heading',
+    'paragraph.degrade-heading': 'Paragraph: Degrade Heading',
+    'paragraph.table': 'Paragraph: Table',
+    'paragraph.code-fence': 'Paragraph: Code Fence',
+    'paragraph.quote-block': 'Paragraph: Quote Block',
+    'paragraph.math-block': 'Paragraph: Math Block',
+    'paragraph.html-block': 'Paragraph: HTML Block',
+    'paragraph.order-list': 'Paragraph: Ordered List',
+    'paragraph.bullet-list': 'Paragraph: Bullet List',
+    'paragraph.task-list': 'Paragraph: Task List',
+    'paragraph.loose-list-item': 'Paragraph: Loose List Item',
+    'paragraph.paragraph': 'Paragraph: Paragraph',
+    'paragraph.horizontal-rule': 'Paragraph: Horizontal Rule',
+    'paragraph.front-matter': 'Paragraph: Front Matter',
+    'format.strong': 'Format: Strong',
+    'format.emphasis': 'Format: Emphasis',
+    'format.underline': 'Format: Underline',
+    'format.highlight': 'Format: Highlight',
+    'format.inline-code': 'Format: Inline Code',
+    'format.inline-math': 'Format: Inline Math',
+    'format.strike': 'Format: Strike',
+    'format.hyperlink': 'Format: Hyperlink',
+    'format.image': 'Format: Image',
+    'format.clear-format': 'Format: Clear Format',
+    'window.minimize': 'Window: Minimize',
+    'window.close': 'Window: Close',
+    'window.toggle-always-on-top': 'Window: Toggle Always on Top',
+    'window.toggle-full-screen': 'Window: Toggle Full Screen',
+    'view.toggle-sidebar': 'View: Toggle Sidebar',
+    'view.toggle-tabbar': 'View: Toggle Tab Bar',
+    'view.toggle-source-code-mode': 'View: Toggle Source Code Mode',
+    'view.toggle-typewriter-mode': 'View: Toggle Typewriter Mode',
+    'view.toggle-focus-mode': 'View: Toggle Focus Mode',
+    'view.toggle-toc': 'View: Toggle Table of Contents',
+    'view.command-palette': 'View: Command Palette',
+    'view.dev-reload': 'View: Reload',
+    'view.dev-toggle-developer-tools': 'View: Toggle Developer Tools',
+    'view.actual-size': 'View: Actual Size',
+    'view.zoomIn': 'View: Zoom In',
+    'view.zoomOut': 'View: Zoom Out',
 
     // ============================================
     // # Menu descriptions but not available as command
     // #
 
-    'view.reload-images': t('commands.view.reloadImages'),
+    'view.reload-images': 'View: Reload Images',
 
     // ============================================
     // # Additional command descriptions
     // #
 
-    'file.toggle-auto-save': t('commands.file.toggleAutoSave'),
-    'file.import-file': t('commands.file.importFile'),
-    'file.export-file': t('commands.file.exportFile'),
-    'file.export-file.pdf': t('commands.file.exportFilePdf'),
-    'file.zoom': t('commands.file.zoom'),
-    'file.check-update': t('commands.file.checkUpdate'),
-    'paragraph.reset-paragraph': t('commands.paragraph.resetParagraph'),
-    'window.change-theme': t('commands.window.changeTheme'),
-    'view.text-direction': t('commands.view.textDirection'),
-    'docs.user-guide': t('commands.docs.userGuide'),
-    'docs.markdown-syntax': t('commands.docs.markdownSyntax')
+    'file.toggle-auto-save': 'File: Toggle Auto Save',
+    'file.import-file': 'File: Import File',
+    'file.export-file': 'File: Export File',
+    'file.export-file.pdf': 'File: Export as PDF',
+    'file.zoom': 'File: Zoom',
+    'file.check-update': 'File: Check for Updates',
+    'paragraph.reset-paragraph': 'Paragraph: Reset Paragraph',
+    'window.change-theme': 'Window: Change Theme',
+    'view.text-direction': 'View: Text Direction',
+    'docs.user-guide': 'Docs: User Guide',
+    'docs.markdown-syntax': 'Docs: Markdown Syntax'
   })
 }
 
 export default id => {
+  // Get command descriptions with fixed English text
   const commandDescriptions = getCommandDescriptions()
-  return commandDescriptions[id]
+  const description = commandDescriptions[id]
+  // If description doesn't exist, return the key for debugging
+  return description || id
 }
diff --git a/src/renderer/src/commands/fileEncoding.js b/src/renderer/src/commands/fileEncoding.js
index 7724525c..1c3ba693 100644
--- a/src/renderer/src/commands/fileEncoding.js
+++ b/src/renderer/src/commands/fileEncoding.js
@@ -1,12 +1,12 @@
 import { ENCODING_NAME_MAP, getEncodingName } from 'common/encoding'
 import { delay } from '@/util'
 import bus from '../bus'
-import { t } from '../../i18n'
+// Removed i18n import - using hardcoded English descriptions
 
 class FileEncodingCommand {
   constructor(editorState) {
     this.id = 'file.change-encoding'
-    this.description = t('commands.file.changeEncoding')
+    this.description = 'Change Encoding'
     this.placeholder = 'Select an option'
 
     this.subcommands = []
diff --git a/src/renderer/src/commands/index.js b/src/renderer/src/commands/index.js
index 7050a05f..120727cc 100644
--- a/src/renderer/src/commands/index.js
+++ b/src/renderer/src/commands/index.js
@@ -4,7 +4,7 @@ import bus from '../bus'
 import { delay, isOsx } from '@/util'
 import { isUpdatable } from './utils'
 import getCommandDescriptionById from './descriptions'
-import { t } from '../../i18n'
+// Removed i18n import - using hardcoded English descriptions
 
 export { default as FileEncodingCommand } from './fileEncoding'
 export { default as LineEndingCommand } from './lineEnding'
@@ -124,7 +124,7 @@ const commands = [
     subcommands: [
       {
         id: 'file.export-file-html',
-        description: t('commands.file.exportSubHtml'),
+        description: 'Export as HTML',
         execute: async () => {
           await delay(50)
           bus.emit('showExportDialog', 'styledHtml')
@@ -132,7 +132,7 @@ const commands = [
       },
       {
         id: 'file.export-file-pdf',
-        description: t('commands.file.exportSubPdf'),
+        description: 'Export as PDF',
         execute: async () => {
           await delay(50)
           bus.emit('showExportDialog', 'pdf')
@@ -449,62 +449,62 @@ const commands = [
     subcommands: [
       {
         id: 'file.zoom-0',
-        description: t('commands.file.zoom.0625'),
+        description: '62.5%',
         value: 0.625
       },
       {
         id: 'file.zoom-1',
-        description: t('commands.file.zoom.075'),
+        description: '75%',
         value: 0.75
       },
       {
         id: 'file.zoom-2',
-        description: t('commands.file.zoom.0875'),
+        description: '87.5%',
         value: 0.875
       },
       {
         id: 'file.zoom-3',
-        description: t('commands.file.zoom.10'),
+        description: '100%',
         value: 1.0
       },
       {
         id: 'file.zoom-4',
-        description: t('commands.file.zoom.1125'),
+        description: '112.5%',
         value: 1.125
       },
       {
         id: 'file.zoom-5',
-        description: t('commands.file.zoom.125'),
+        description: '125%',
         value: 1.25
       },
       {
         id: 'file.zoom-6',
-        description: t('commands.file.zoom.1375'),
+        description: '137.5%',
         value: 1.375
       },
       {
         id: 'file.zoom-7',
-        description: t('commands.file.zoom.15'),
+        description: '150%',
         value: 1.5
       },
       {
         id: 'file.zoom-8',
-        description: t('commands.file.zoom.1625'),
+        description: '162.5%',
         value: 1.625
       },
       {
         id: 'file.zoom-9',
-        description: t('commands.file.zoom.175'),
+        description: '175%',
         value: 1.75
       },
       {
         id: 'file.zoom-10',
-        description: t('commands.file.zoom.1875'),
+        description: '187.5%',
         value: 1.875
       },
       {
         id: 'file.zoom-11',
-        description: t('commands.file.zoom.20'),
+        description: '200%',
         value: 2.0
       }
     ],
@@ -521,32 +521,32 @@ const commands = [
     subcommands: [
       {
         id: 'window.change-theme-light',
-        description: t('commands.window.changeTheme.cadmiumLight'),
+        description: 'Cadmium Light',
         value: 'light'
       },
       {
         id: 'window.change-theme-dark',
-        description: t('commands.window.changeTheme.dark'),
+        description: 'Dark',
         value: 'dark'
       },
       {
         id: 'window.change-theme-graphite',
-        description: t('commands.window.changeTheme.graphite'),
+        description: 'Graphite',
         value: 'graphite'
       },
       {
         id: 'window.change-theme-material-dark',
-        description: t('commands.window.changeTheme.materialDark'),
+        description: 'Material Dark',
         value: 'material-dark'
       },
       {
         id: 'window.change-theme-one-dark',
-        description: t('commands.window.changeTheme.oneDark'),
+        description: 'One Dark',
         value: 'one-dark'
       },
       {
         id: 'window.change-theme-ulysses',
-        description: t('commands.window.changeTheme.ulysses'),
+        description: 'Ulysses',
         value: 'ulysses'
       }
     ],
@@ -594,12 +594,12 @@ const commands = [
     subcommands: [
       {
         id: 'view.text-direction-ltr',
-        description: t('commands.view.textDirection.leftToRight'),
+        description: 'Left to Right',
         value: 'ltr'
       },
       {
         id: 'view.text-direction-rtl',
-        description: t('commands.view.textDirection.rightToLeft'),
+        description: 'Right to Left',
         value: 'rtl'
       }
     ],
@@ -678,7 +678,30 @@ if (isOsx) {
   })
 }
 
-// Complete all command descriptions.
+// Function to get commands with updated descriptions
+export const getCommandsWithDescriptions = () => {
+  // Create a deep copy of commands to avoid modifying the original
+  const commandsCopy = JSON.parse(JSON.stringify(commands))
+  
+  // Update descriptions for all commands
+  const updateDescriptions = (commandList) => {
+    for (const item of commandList) {
+      const { id, description, subcommands } = item
+      if (id && !description) {
+        item.description = getCommandDescriptionById(id)
+      }
+      // Also update subcommands descriptions
+      if (subcommands && Array.isArray(subcommands)) {
+        updateDescriptions(subcommands)
+      }
+    }
+  }
+  
+  updateDescriptions(commandsCopy)
+  return commandsCopy
+}
+
+// Complete all command descriptions for initial load.
 for (const item of commands) {
   const { id, description } = item
   if (id && !description) {
diff --git a/src/renderer/src/commands/lineEnding.js b/src/renderer/src/commands/lineEnding.js
index 85bfa495..14e600c1 100644
--- a/src/renderer/src/commands/lineEnding.js
+++ b/src/renderer/src/commands/lineEnding.js
@@ -1,6 +1,6 @@
 import { delay } from '@/util'
 import bus from '../bus'
-import { t } from '../../i18n'
+// Removed i18n import - using hardcoded English descriptions
 
 const crlfDescription = 'Carriage return and line feed (CRLF)'
 const lfDescription = 'Line feed (LF)'
@@ -8,7 +8,7 @@ const lfDescription = 'Line feed (LF)'
 class LineEndingCommand {
   constructor(editorState) {
     this.id = 'file.line-ending'
-    this.description = t('commands.file.changeLineEnding')
+    this.description = 'Change Line Ending'
     this.placeholder = 'Select an option'
 
     this.subcommands = [
diff --git a/src/renderer/src/commands/quickOpen.js b/src/renderer/src/commands/quickOpen.js
index af776d8b..9915cacb 100644
--- a/src/renderer/src/commands/quickOpen.js
+++ b/src/renderer/src/commands/quickOpen.js
@@ -1,7 +1,7 @@
 import bus from '../bus'
 import { delay } from '@/util'
 import FileSearcher from '@/node/fileSearcher'
-import { t } from '../../i18n'
+// Removed i18n import - using hardcoded English descriptions
 
 const SPECIAL_CHARS = /[\[\]\\^$.\|\?\*\+\(\)\/]{1}/g // eslint-disable-line no-useless-escape
 
@@ -9,7 +9,7 @@ const SPECIAL_CHARS = /[\[\]\\^$.\|\?\*\+\(\)\/]{1}/g // eslint-disable-line no-
 class QuickOpenCommand {
   constructor(rootState) {
     this.id = 'file.quick-open'
-    this.description = t('commands.file.quickOpen')
+    this.description = 'Quick Open'
     this.placeholder = 'Search file to open'
     this.shortcut = null
 
diff --git a/src/renderer/src/commands/spellcheckerLanguage.js b/src/renderer/src/commands/spellcheckerLanguage.js
index b1fbb202..bd31b0fc 100644
--- a/src/renderer/src/commands/spellcheckerLanguage.js
+++ b/src/renderer/src/commands/spellcheckerLanguage.js
@@ -3,13 +3,13 @@ import notice from '@/services/notification'
 import { delay } from '@/util'
 import { SpellChecker } from '@/spellchecker'
 import { getLanguageName } from '@/spellchecker/languageMap'
-import { t } from '../../i18n'
+// Removed i18n import - using hardcoded English descriptions
 
 // Command to switch the spellchecker language
 class SpellcheckerLanguageCommand {
   constructor(spellchecker) {
     this.id = 'spellchecker.switch-language'
-    this.description = t('commands.spellchecker.switchLanguage')
+    this.description = 'Switch Spellchecker Language'
     this.placeholder = 'Select a language to switch to'
     this.shortcut = null
 
diff --git a/src/renderer/src/commands/trailingNewline.js b/src/renderer/src/commands/trailingNewline.js
index 6e14cf97..a39d3979 100644
--- a/src/renderer/src/commands/trailingNewline.js
+++ b/src/renderer/src/commands/trailingNewline.js
@@ -1,13 +1,13 @@
 import { delay } from '@/util'
 import bus from '../bus'
-import { t } from '../../i18n'
+// Removed i18n import - using hardcoded English descriptions
 
 const descriptions = ['Trim all trailing newlines', 'Ensure single newline', 'Disabled']
 
 class TrailingNewlineCommand {
   constructor(editorState) {
     this.id = 'file.trailing-newline'
-    this.description = t('commands.file.trailingNewline')
+    this.description = 'Trailing Newline'
     this.placeholder = 'Select an option'
 
     this.subcommands = []
diff --git a/src/renderer/src/components/commandPalette/index.vue b/src/renderer/src/components/commandPalette/index.vue
index 7de42da6..c3ac6083 100644
--- a/src/renderer/src/components/commandPalette/index.vue
+++ b/src/renderer/src/components/commandPalette/index.vue
@@ -56,13 +56,11 @@ import { useCommandCenterStore } from '@/store/commandCenter'
 import log from 'electron-log'
 import bus from '../../bus'
 import loading from '../loading'
-import { t } from '../../i18n'
-
 const searchInput = ref(null)
 let commandItems = []
 
 const currentCommand = ref(null)
-const defaultPlaceholderText = t('commandPalette.placeholder')
+const defaultPlaceholderText = 'Search commands'
 
 const showCommandPalette = ref(false)
 const placeholderText = ref(defaultPlaceholderText)
@@ -242,7 +240,7 @@ const updateCommands = () => {
 const executeCommand = (commandId) => {
   const command = availableCommands.value.find((c) => c.id === commandId)
   if (!command) {
-    log.error(t('commandPalette.commandNotFound', { commandId }))
+    log.error(`Command not found: ${commandId}`)
     return
   }
 
@@ -372,9 +370,9 @@ ul.commands li span {
 ul.commands li span.shortcut {
   font-size: 12px;
   line-height: 20px;
-  & > kbd {
-    margin-left: 2px;
-  }
+}
+ul.commands li span.shortcut > kbd {
+  margin-left: 2px;
 }
 
 .fade-enter-active,
diff --git a/src/renderer/src/components/exportSettings/exportOptions.js b/src/renderer/src/components/exportSettings/exportOptions.js
index bd1fdd43..87a69d7e 100644
--- a/src/renderer/src/components/exportSettings/exportOptions.js
+++ b/src/renderer/src/components/exportSettings/exportOptions.js
@@ -1,6 +1,6 @@
 import { t } from '@/i18n'
 
-export const pageSizeList = [
+export const getPageSizeList = () => [
   {
     label: t('exportSettings.options.pageSizes.a3'),
     value: 'A3'
@@ -25,7 +25,7 @@ export const pageSizeList = [
   }
 ]
 
-export const headerFooterTypes = [
+export const getHeaderFooterTypes = () => [
   {
     label: t('exportSettings.options.headerFooterTypes.none'),
     value: 0
@@ -38,7 +38,7 @@ export const headerFooterTypes = [
   }
 ]
 
-export const headerFooterStyles = [
+export const getHeaderFooterStyles = () => [
   {
     label: t('exportSettings.options.headerFooterStyles.default'),
     value: 0
@@ -51,7 +51,7 @@ export const headerFooterStyles = [
   }
 ]
 
-export const exportThemeList = [{
+export const getExportThemeList = () => [{
   label: t('exportSettings.options.themes.academic'),
   value: 'academic'
 }, {
@@ -61,3 +61,9 @@ export const exportThemeList = [{
   label: t('exportSettings.options.themes.liber'),
   value: 'liber'
 }]
+
+// 为了向后兼容，保留原有的导出
+export const pageSizeList = getPageSizeList()
+export const headerFooterTypes = getHeaderFooterTypes()
+export const headerFooterStyles = getHeaderFooterStyles()
+export const exportThemeList = getExportThemeList()
diff --git a/src/renderer/src/components/exportSettings/index.vue b/src/renderer/src/components/exportSettings/index.vue
index 593dcee8..1334c1e6 100644
--- a/src/renderer/src/components/exportSettings/index.vue
+++ b/src/renderer/src/components/exportSettings/index.vue
@@ -264,7 +264,7 @@ import CurSelect from '@/prefComponents/common/select'
 import FontTextBox from '@/prefComponents/common/fontTextBox'
 import Range from '@/prefComponents/common/range'
 import TextBox from '@/prefComponents/common/textBox'
-import { pageSizeList, headerFooterTypes, exportThemeList } from './exportOptions'
+import { getPageSizeList, getHeaderFooterTypes, getExportThemeList } from './exportOptions'
 import { t } from '../../i18n'
 
 const exportType = ref('')
@@ -288,7 +288,9 @@ const lineHeight = ref(1.5)
 const autoNumberingHeadings = ref(false)
 const showFrontMatter = ref(false)
 const theme = ref('default')
-const themeList = ref(exportThemeList)
+const themeList = ref(getExportThemeList())
+const pageSizeList = ref(getPageSizeList())
+const headerFooterTypes = ref(getHeaderFooterTypes())
 const headerType = ref(0)
 const headerTextLeft = ref('')
 const headerTextCenter = ref('')
@@ -305,12 +307,20 @@ const tocIncludeTopHeading = ref(true)
 
 onMounted(() => {
   bus.on('showExportDialog', showDialog)
+  bus.on('language-changed', updateTranslations)
 })
 
 onBeforeUnmount(() => {
   bus.off('showExportDialog', showDialog)
+  bus.off('language-changed', updateTranslations)
 })
 
+const updateTranslations = () => {
+  themeList.value = getExportThemeList()
+  pageSizeList.value = getPageSizeList()
+  headerFooterTypes.value = getHeaderFooterTypes()
+}
+
 const showDialog = (type) => {
   exportType.value = type
   isPrintable.value = type !== 'styledHtml'
diff --git a/src/renderer/src/store/commandCenter.js b/src/renderer/src/store/commandCenter.js
index 487192f3..0d3b2eeb 100644
--- a/src/renderer/src/store/commandCenter.js
+++ b/src/renderer/src/store/commandCenter.js
@@ -1,7 +1,7 @@
 import { defineStore } from 'pinia'
 import log from 'electron-log'
 import bus from '../bus'
-import staticCommands, { RootCommand } from '../commands'
+import staticCommands, { RootCommand, getCommandsWithDescriptions } from '../commands'
 
 export const useCommandCenterStore = defineStore('commandCenter', {
   state: () => ({
@@ -41,6 +41,8 @@ export const useCommandCenterStore = defineStore('commandCenter', {
       window.electron.ipcRenderer.on('mt::execute-command-by-id', (e, commandId) => {
         executeCommand(this, commandId)
       })
+
+      // Language change listener removed - using hardcoded English descriptions
     }
   }
 })
