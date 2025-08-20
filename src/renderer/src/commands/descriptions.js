import { t } from '../../i18n'

const getCommandDescriptions = () => {
  
  return Object.freeze({
    // ============================================
    // # Key binding descriptions
    // #

    'mt.hide': t('commands.mt.hide'),
    'mt.hide-others': t('commands.mt.hideOthers'),
    'file.new-window': t('commands.file.newWindow'),
    'file.new-tab': t('commands.file.newTab'),
    'file.open-file': t('commands.file.openFile'),
    'file.open-folder': t('commands.file.openFolder'),
    'file.save': t('commands.file.save'),
    'file.save-as': t('commands.file.saveAs'),
    'file.move-file': t('commands.file.moveFile'),
    'file.rename-file': t('commands.file.renameFile'),
    'file.quick-open': t('commands.file.quickOpen'),
    'file.print': t('commands.file.print'),
    'file.preferences': t('commands.file.preferences'),
    'file.close-tab': t('commands.file.closeTab'),
    'file.close-window': t('commands.file.closeWindow'),
    'file.quit': t('commands.file.quit'),
    'edit.undo': t('commands.edit.undo'),
    'edit.redo': t('commands.edit.redo'),
    'edit.cut': t('commands.edit.cut'),
    'edit.copy': t('commands.edit.copy'),
    'edit.paste': t('commands.edit.paste'),
    'edit.copy-as-markdown': t('commands.edit.copyAsMarkdown'),
    'edit.copy-as-html': t('commands.edit.copyAsHtml'),
    'edit.paste-as-plaintext': t('commands.edit.pasteAsPlaintext'),
    'edit.select-all': t('commands.edit.selectAll'),
    'edit.duplicate': t('commands.edit.duplicate'),
    'edit.create-paragraph': t('commands.edit.createParagraph'),
    'edit.delete-paragraph': t('commands.edit.deleteParagraph'),
    'edit.find': t('commands.edit.find'),
    'edit.find-next': t('commands.edit.findNext'),
    'edit.find-previous': t('commands.edit.findPrevious'),
    'edit.replace': t('commands.edit.replace'),
    'edit.find-in-folder': t('commands.edit.findInFolder'),
    'edit.screenshot': t('commands.edit.screenshot'),
    'paragraph.heading-1': t('commands.paragraph.heading1'),
    'paragraph.heading-2': t('commands.paragraph.heading2'),
    'paragraph.heading-3': t('commands.paragraph.heading3'),
    'paragraph.heading-4': t('commands.paragraph.heading4'),
    'paragraph.heading-5': t('commands.paragraph.heading5'),
    'paragraph.heading-6': t('commands.paragraph.heading6'),
    'paragraph.upgrade-heading': t('commands.paragraph.upgradeHeading'),
    'paragraph.degrade-heading': t('commands.paragraph.degradeHeading'),
    'paragraph.table': t('commands.paragraph.table'),
    'paragraph.code-fence': t('commands.paragraph.codeFence'),
    'paragraph.quote-block': t('commands.paragraph.quoteBlock'),
    'paragraph.math-formula': t('commands.paragraph.mathFormula'),
    'paragraph.html-block': t('commands.paragraph.htmlBlock'),
    'paragraph.order-list': t('commands.paragraph.orderList'),
    'paragraph.bullet-list': t('commands.paragraph.bulletList'),
    'paragraph.task-list': t('commands.paragraph.taskList'),
    'paragraph.loose-list-item': t('commands.paragraph.looseListItem'),
    'paragraph.paragraph': t('commands.paragraph.paragraph'),
    'paragraph.horizontal-line': t('commands.paragraph.horizontalLine'),
    'paragraph.front-matter': t('commands.paragraph.frontMatter'),
    'format.strong': t('commands.format.strong'),
    'format.emphasis': t('commands.format.emphasis'),
    'format.underline': t('commands.format.underline'),
    'format.superscript': t('commands.format.superscript'),
    'format.subscript': t('commands.format.subscript'),
    'format.highlight': t('commands.format.highlight'),
    'format.inline-code': t('commands.format.inlineCode'),
    'format.inline-math': t('commands.format.inlineMath'),
    'format.strike': t('commands.format.strike'),
    'format.hyperlink': t('commands.format.hyperlink'),
    'format.image': t('commands.format.image'),
    'format.clear-format': t('commands.format.clearFormat'),
    'window.minimize': t('commands.window.minimize'),
    'window.toggle-always-on-top': t('commands.window.toggleAlwaysOnTop'),
    'window.zoom-in': t('commands.window.zoomIn'),
    'window.zoom-out': t('commands.window.zoomOut'),
    'window.toggle-full-screen': t('commands.window.toggleFullScreen'),
    'view.command-palette': t('commands.view.commandPalette'),
    'view.source-code-mode': t('commands.view.sourceCodeMode'),
    'view.typewriter-mode': t('commands.view.typewriterMode'),
    'view.focus-mode': t('commands.view.focusMode'),
    'view.toggle-sidebar': t('commands.view.toggleSidebar'),
    'view.toggle-toc': t('commands.view.toggleToc'),
    'view.toggle-tabbar': t('commands.view.toggleTabbar'),
    'view.toggle-dev-tools': t('commands.view.toggleDevTools'),
    'view.dev-reload': t('commands.view.devReload'),
    'tabs.cycle-forward': t('commands.tabs.cycleForward'),
    'tabs.cycle-backward': t('commands.tabs.cycleBackward'),
    'tabs.switch-to-left': t('commands.tabs.switchToLeft'),
    'tabs.switch-to-right': t('commands.tabs.switchToRight'),
    'tabs.switch-to-first': t('commands.tabs.switchToFirst'),
    'tabs.switch-to-second': t('commands.tabs.switchToSecond'),
    'tabs.switch-to-third': t('commands.tabs.switchToThird'),
    'tabs.switch-to-fourth': t('commands.tabs.switchToFourth'),
    'tabs.switch-to-fifth': t('commands.tabs.switchToFifth'),
    'tabs.switch-to-sixth': t('commands.tabs.switchToSixth'),
    'tabs.switch-to-seventh': t('commands.tabs.switchToSeventh'),
    'tabs.switch-to-eighth': t('commands.tabs.switchToEighth'),
    'tabs.switch-to-ninth': t('commands.tabs.switchToNinth'),
    'tabs.switch-to-tenth': t('commands.tabs.switchToTenth'),

    // ============================================
    // # Menu descriptions but not available as command
    // #

    'view.reload-images': t('commands.view.reloadImages'),

    // ============================================
    // # Additional command descriptions
    // #

    'file.toggle-auto-save': t('commands.file.toggleAutoSave'),
    'file.import-file': t('commands.file.importFile'),
    'file.export-file': t('commands.file.exportFile'),
    'file.export-file.pdf': t('commands.file.exportFilePdf'),
    'file.zoom': t('commands.file.zoom'),
    'file.check-update': t('commands.file.checkUpdate'),
    'paragraph.reset-paragraph': t('commands.paragraph.resetParagraph'),
    'window.change-theme': t('commands.window.changeTheme'),
    'view.text-direction': t('commands.view.textDirection'),
    'docs.user-guide': t('commands.docs.userGuide'),
    'docs.markdown-syntax': t('commands.docs.markdownSyntax')
  })
}

export default id => {
  const commandDescriptions = getCommandDescriptions()
  return commandDescriptions[id]
}
