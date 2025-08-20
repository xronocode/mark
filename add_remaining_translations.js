const fs = require('fs');
const path = require('path');

// 读取比对报告
const reportPath = path.join(__dirname, 'translation_comparison_report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// 翻译文件路径
const enPath = path.join(__dirname, 'src/shared/i18n/locales/en.json');
const zhPath = path.join(__dirname, 'src/shared/i18n/locales/zh-CN.json');

// 读取现有翻译文件
const enTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const zhTranslations = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

// 详细的翻译映射
const detailedTranslations = {
  // Editor file representation
  'preferences.editor.fileRepresentation.trailingNewlines.doNothing': {
    en: 'Do nothing',
    zh: '不做任何操作'
  },
  'preferences.editor.fileRepresentation.trailingNewlines.ensureOne': {
    en: 'Ensure one',
    zh: '确保有一个'
  },
  'preferences.editor.fileRepresentation.trailingNewlines.preserve': {
    en: 'Preserve',
    zh: '保持原样'
  },
  'preferences.editor.fileRepresentation.trailingNewlines.trimAll': {
    en: 'Trim all',
    zh: '删除所有'
  },
  
  // Text direction
  'preferences.editor.misc.textDirection.ltr': {
    en: 'Left to right',
    zh: '从左到右'
  },
  'preferences.editor.misc.textDirection.rtl': {
    en: 'Right to left',
    zh: '从右到左'
  },
  
  // File sort options
  'preferences.general.sidebar.fileSortBy.creationTime': {
    en: 'Creation time',
    zh: '创建时间'
  },
  'preferences.general.sidebar.fileSortBy.modificationTime': {
    en: 'Modification time',
    zh: '修改时间'
  },
  'preferences.general.sidebar.fileSortBy.title': {
    en: 'Title',
    zh: '标题'
  },
  
  // Title bar style
  'preferences.general.window.titleBarStyle.custom': {
    en: 'Custom',
    zh: '自定义'
  },
  'preferences.general.window.titleBarStyle.native': {
    en: 'Native',
    zh: '原生'
  },
  
  // Image uploader
  'preferences.image.uploader.tokenTooltip': {
    en: 'Access token for authentication',
    zh: '用于身份验证的访问令牌'
  },
  
  // Keybindings
  'preferences.keybindings.debugOptions': {
    en: 'Debug Options',
    zh: '调试选项'
  },
  'preferences.keybindings.dumpKeyboardInfo': {
    en: 'Dump Keyboard Info',
    zh: '导出键盘信息'
  },
  'preferences.keybindings.failedToSave': {
    en: 'Failed to save keybindings',
    zh: '保存快捷键失败'
  },
  'preferences.keybindings.keyInputDialog.instructions': {
    en: 'Press the key combination you want to assign',
    zh: '按下您想要分配的组合键'
  },
  'preferences.keybindings.keyInputDialog.invalidKeybinding': {
    en: 'Invalid key combination',
    zh: '无效的组合键'
  },
  'preferences.keybindings.keyInputDialog.placeholder': {
    en: 'Press keys...',
    zh: '按下按键...'
  },
  'preferences.keybindings.online': {
    en: 'Online',
    zh: '在线'
  },
  'preferences.keybindings.saveError': {
    en: 'Error saving keybindings',
    zh: '保存快捷键时出错'
  },
  'preferences.keybindings.shortcutInUse': {
    en: 'Shortcut in use',
    zh: '快捷键已被使用'
  },
  'preferences.keybindings.shortcutInUseMessage': {
    en: 'This shortcut is already assigned to another command',
    zh: '此快捷键已分配给其他命令'
  },
  'preferences.keybindings.table.description': {
    en: 'Description',
    zh: '描述'
  },
  'preferences.keybindings.table.edit': {
    en: 'Edit',
    zh: '编辑'
  },
  'preferences.keybindings.table.keyCombination': {
    en: 'Key Combination',
    zh: '组合键'
  },
  'preferences.keybindings.table.options': {
    en: 'Options',
    zh: '选项'
  },
  'preferences.keybindings.table.reset': {
    en: 'Reset',
    zh: '重置'
  },
  'preferences.keybindings.table.unbind': {
    en: 'Unbind',
    zh: '解绑'
  },
  
  // Markdown compatibility
  'preferences.markdown.compatibility.enableGitlab': {
    en: 'Enable GitLab compatibility',
    zh: '启用 GitLab 兼容性'
  },
  'preferences.markdown.compatibility.enableHtml': {
    en: 'Enable HTML support',
    zh: '启用 HTML 支持'
  },
  'preferences.markdown.compatibility.title': {
    en: 'Compatibility',
    zh: '兼容性'
  },
  
  // Sequence diagrams
  'preferences.markdown.diagrams.sequenceTheme': {
    en: 'Sequence diagram theme',
    zh: '序列图主题'
  },
  'preferences.markdown.diagrams.sequenceTheme.handDrawn': {
    en: 'Hand drawn',
    zh: '手绘风格'
  },
  'preferences.markdown.diagrams.sequenceTheme.simple': {
    en: 'Simple',
    zh: '简洁'
  },
  
  // Extensions
  'preferences.markdown.extensions.footnoteNotes': {
    en: 'Footnote notes',
    zh: '脚注'
  },
  'preferences.markdown.extensions.frontmatterType': {
    en: 'Front matter type',
    zh: '前置元数据类型'
  },
  'preferences.markdown.extensions.frontmatterType.jsonBrace': {
    en: 'JSON with braces',
    zh: 'JSON 大括号格式'
  },
  'preferences.markdown.extensions.frontmatterType.jsonSemicolon': {
    en: 'JSON with semicolon',
    zh: 'JSON 分号格式'
  },
  
  // Lists
  'preferences.markdown.lists.bulletListMarker': {
    en: 'Bullet list marker',
    zh: '无序列表标记'
  },
  'preferences.markdown.lists.listIndentation': {
    en: 'List indentation',
    zh: '列表缩进'
  },
  'preferences.markdown.lists.listIndentation.dfm': {
    en: 'DFM style',
    zh: 'DFM 风格'
  },
  'preferences.markdown.lists.listIndentation.fourSpaces': {
    en: 'Four spaces',
    zh: '四个空格'
  },
  'preferences.markdown.lists.listIndentation.oneSpace': {
    en: 'One space',
    zh: '一个空格'
  },
  'preferences.markdown.lists.listIndentation.tab': {
    en: 'Tab',
    zh: '制表符'
  },
  'preferences.markdown.lists.listIndentation.threeSpaces': {
    en: 'Three spaces',
    zh: '三个空格'
  },
  'preferences.markdown.lists.listIndentation.twoSpaces': {
    en: 'Two spaces',
    zh: '两个空格'
  },
  'preferences.markdown.lists.orderListDelimiter': {
    en: 'Ordered list delimiter',
    zh: '有序列表分隔符'
  },
  'preferences.markdown.lists.preferLooseListItem': {
    en: 'Prefer loose list items',
    zh: '偏好松散列表项'
  },
  'preferences.markdown.lists.title': {
    en: 'Lists',
    zh: '列表'
  },
  
  // Misc
  'preferences.markdown.misc.preferHeadingStyle': {
    en: 'Preferred heading style',
    zh: '偏好的标题样式'
  },
  'preferences.markdown.misc.title': {
    en: 'Miscellaneous',
    zh: '其他'
  },
  
  // Font selection
  'preferences.selectFont': {
    en: 'Select Font',
    zh: '选择字体'
  },
  
  // Spellchecker
  'preferences.spellchecker.autoDetectDescription': {
    en: 'Automatically detect document language',
    zh: '自动检测文档语言'
  },
  'preferences.spellchecker.autoDetectLanguage': {
    en: 'Auto-detect language',
    zh: '自动检测语言'
  },
  'preferences.spellchecker.customDictionary.delete': {
    en: 'Delete',
    zh: '删除'
  },
  'preferences.spellchecker.customDictionary.description': {
    en: 'Add custom words to your personal dictionary',
    zh: '将自定义单词添加到您的个人词典'
  },
  'preferences.spellchecker.customDictionary.noWordsAvailable': {
    en: 'No words available',
    zh: '没有可用的单词'
  },
  'preferences.spellchecker.customDictionary.options': {
    en: 'Options',
    zh: '选项'
  },
  'preferences.spellchecker.customDictionary.title': {
    en: 'Custom Dictionary',
    zh: '自定义词典'
  },
  'preferences.spellchecker.customDictionary.word': {
    en: 'Word',
    zh: '单词'
  },
  'preferences.spellchecker.defaultLanguage': {
    en: 'Default language',
    zh: '默认语言'
  },
  'preferences.spellchecker.enableSpellChecking': {
    en: 'Enable spell checking',
    zh: '启用拼写检查'
  },
  'preferences.spellchecker.hideMarksForErrors': {
    en: 'Hide marks for spelling errors',
    zh: '隐藏拼写错误标记'
  },
  'preferences.spellchecker.title': {
    en: 'Spell Checker',
    zh: '拼写检查器'
  },
  
  // Theme
  'preferences.theme.autoSwitch': {
    en: 'Auto switch theme',
    zh: '自动切换主题'
  },
  'preferences.theme.autoSwitchOptions.never': {
    en: 'Never',
    zh: '从不'
  },
  'preferences.theme.importCustomThemes': {
    en: 'Import custom themes',
    zh: '导入自定义主题'
  },
  'preferences.theme.importTheme': {
    en: 'Import Theme',
    zh: '导入主题'
  },
  'preferences.theme.openFolder': {
    en: 'Open Folder',
    zh: '打开文件夹'
  },
  'preferences.theme.openThemesFolder': {
    en: 'Open themes folder',
    zh: '打开主题文件夹'
  },
  
  // Search
  'search.invalidRegex': {
    en: 'Invalid regular expression',
    zh: '无效的正则表达式'
  },
  'search.regexMatchEmpty': {
    en: 'Regular expression matches empty string',
    zh: '正则表达式匹配空字符串'
  },
  'search.searchResultCount': {
    en: 'Search results',
    zh: '搜索结果'
  },
  
  // Spellchecker errors
  'spellchecker.failedToRemoveWord': {
    en: 'Failed to remove word from dictionary',
    zh: '从词典中删除单词失败'
  },
  'spellchecker.failedToSwitchLanguage': {
    en: 'Failed to switch spellchecker language',
    zh: '切换拼写检查器语言失败'
  },
  'spellchecker.unexpectedError': {
    en: 'Unexpected spellchecker error',
    zh: '拼写检查器意外错误'
  },
  
  // Store errors
  'store.editor.tabNotFound': {
    en: 'Tab not found',
    zh: '未找到标签页'
  },
  'store.editor.tocItemNotFound': {
    en: 'Table of contents item not found',
    zh: '未找到目录项'
  }
};

// 设置嵌套值的辅助函数
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

// 添加缺失的翻译
let addedCount = 0;

// 处理英文翻译
report.missingKeys.english.forEach(key => {
  if (detailedTranslations[key]) {
    setNestedValue(enTranslations, key, detailedTranslations[key].en);
    addedCount++;
    console.log(`Added EN: ${key} = "${detailedTranslations[key].en}"`);
  }
});

// 处理中文翻译
report.missingKeys.chinese.forEach(key => {
  if (detailedTranslations[key]) {
    setNestedValue(zhTranslations, key, detailedTranslations[key].zh);
    addedCount++;
    console.log(`Added ZH: ${key} = "${detailedTranslations[key].zh}"`);
  }
});

// 保存更新后的翻译文件
fs.writeFileSync(enPath, JSON.stringify(enTranslations, null, 2), 'utf8');
fs.writeFileSync(zhPath, JSON.stringify(zhTranslations, null, 2), 'utf8');

console.log(`\n✅ Successfully added ${addedCount} missing translation keys`);
console.log('📝 Please run the comparison script again to verify the results.');