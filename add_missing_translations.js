const fs = require('fs');
const path = require('path');

// 读取比对报告
const report = JSON.parse(fs.readFileSync('translation_comparison_report.json', 'utf8'));

// 读取现有的翻译文件
const enTranslations = JSON.parse(fs.readFileSync('src/shared/i18n/locales/en.json', 'utf8'));
const zhTranslations = JSON.parse(fs.readFileSync('src/shared/i18n/locales/zh-CN.json', 'utf8'));

// 定义缺失键的翻译内容
const missingTranslations = {
  english: {
    "about.copyright": "Copyright",
    "about.copyrightContributors": "Copyright Contributors",
    "commandPalette.commandNotFound": "Command not found",
    "commands.utils.noUpdateResourceFile": "No update resource file",
    "commands.utils.todoUpdateCheck": "Check for updates",
    "common.ok": "OK",
    "dialog.cancel": "Cancel",
    "dialog.changesWillBeLost": "Changes will be lost",
    "dialog.close": "Close",
    "dialog.dontSave": "Don't Save",
    "dialog.file": "File",
    "dialog.fileExists": "File exists",
    "dialog.files": "Files",
    "dialog.importWarning": "Import warning",
    "dialog.installPandoc": "Install Pandoc",
    "dialog.keepOpen": "Keep open",
    "dialog.replace": "Replace",
    "dialog.save": "Save",
    "dialog.saveChanges": "Save changes",
    "dialog.saveFailure": "Save failure",
    "editor.notifications.notificationNotFound": "Notification not found",
    "editor.sourceCode.cursorNullComment": "Cursor null comment",
    "editor.sourceCode.imageStructureDeletedComment": "Image structure deleted comment",
    "error.configSchemaViolation": "Configuration schema violation",
    "error.copyError": "Copy error",
    "error.initializationFailed": "Initialization failed",
    "error.otherInstanceDetected": "Another instance of MarkText is already running",
    "error.report": "Report",
    "error.startupError": "Startup error",
    "error.terminatedDueToError": "Terminated due to error",
    "error.unexpectedErrorWithMessage": "Unexpected error with message",
    "error.unexpectedMainProcess": "Unexpected main process error",
    "error.unexpectedRendererProcess": "Unexpected renderer process error",
    "menu.help.about": "About",
    "menu.help.checkUpdates": "Check for Updates",
    "notifications.defaultMessage": "Default message",
    "notifications.defaultTitle": "Notification",
    "preferences.editor.fileRepresentation.trailingNewlines": "Trailing newlines",
    "preferences.editor.misc.textDirection": "Text direction",
    "preferences.general.sidebar.fileSortBy": "Sort files by",
    "preferences.general.window.titleBarStyle": "Title bar style",
    "preferences.image.uploader.branch": "Branch",
    "preferences.image.uploader.inputToken": "Input token",
    "preferences.image.uploader.legalNotices.and": "and",
    "preferences.image.uploader.legalNotices.byUsing": "By using this service, you agree to the",
    "preferences.image.uploader.legalNotices.gdprWarning": "GDPR warning",
    "preferences.image.uploader.legalNotices.privacyStatement": "Privacy Statement",
    "preferences.image.uploader.legalNotices.termsOfService": "Terms of Service",
    "preferences.image.uploader.noUploaderSelected": "No uploader selected",
    "preferences.image.uploader.owner": "Owner",
    "preferences.image.uploader.pleaseInstall": "Please install",
    "preferences.image.uploader.repo": "Repository",
    "preferences.image.uploader.scriptPath": "Script path",
    "preferences.image.uploader.services.cliScript": "CLI Script",
    "preferences.image.uploader.services.github": "GitHub",
    "preferences.image.uploader.services.none": "None",
    "preferences.image.uploader.services.picgo": "PicGo",
    "preferences.image.uploader.token": "Token",
    "preferences.keybindings.description": "Description",
    "preferences.keybindings.key": "Key",
    "preferences.keybindings.restoreDefaults": "Restore defaults",
    "preferences.markdown.misc.preferHeadingStyle.atx": "ATX",
    "preferences.markdown.misc.preferHeadingStyle.setext": "Setext",
    "preferences.spellchecker.hunspellDictionaries": "Hunspell dictionaries",
    "preferences.spellchecker.isHunspellEnabled": "Enable Hunspell",
    "preferences.spellchecker.language": "Language",
    "preferences.spellchecker.noSuggestion": "No suggestion",
    "preferences.theme.autoSwitchOptions.startup": "At startup",
    "preferences.theme.autoSwitchOptions.systemTheme": "Follow system theme",
    "recent.noTabsOpen": "No tabs open",
    "search.caseSensitive": "Case sensitive",
    "search.findInFolder": "Find in folder",
    "search.includeCodeBlocks": "Include code blocks",
    "search.noResult": "No result",
    "search.regexMode": "Regex mode",
    "search.replaceAll": "Replace all",
    "search.wholeWord": "Whole word",
    "store.editor.anchorLinkCopied": "Anchor link copied",
    "store.help.lineEndingAssertionError": "Line ending assertion error",
    "tweet.tweet": "Tweet"
  },
  chinese: {
    "about.copyright": "版权",
    "about.copyrightContributors": "版权贡献者",
    "commandPalette.commandNotFound": "未找到命令",
    "commands.utils.noUpdateResourceFile": "无更新资源文件",
    "commands.utils.todoUpdateCheck": "检查更新",
    "common.ok": "确定",
    "dialog.cancel": "取消",
    "dialog.changesWillBeLost": "更改将丢失",
    "dialog.close": "关闭",
    "dialog.dontSave": "不保存",
    "dialog.file": "文件",
    "dialog.fileExists": "文件已存在",
    "dialog.files": "文件",
    "dialog.importWarning": "导入警告",
    "dialog.installPandoc": "安装 Pandoc",
    "dialog.keepOpen": "保持打开",
    "dialog.replace": "替换",
    "dialog.save": "保存",
    "dialog.saveChanges": "保存更改",
    "dialog.saveFailure": "保存失败",
    "editor.notifications.notificationNotFound": "未找到通知",
    "editor.sourceCode.cursorNullComment": "光标空注释",
    "editor.sourceCode.imageStructureDeletedComment": "图片结构已删除注释",
    "error.configSchemaViolation": "配置架构违规",
    "error.copyError": "复制错误",
    "error.initializationFailed": "初始化失败",
    "error.otherInstanceDetected": "检测到 MarkText 的另一个实例正在运行",
    "error.report": "报告",
    "error.startupError": "启动错误",
    "error.terminatedDueToError": "由于错误而终止",
    "error.unexpectedErrorWithMessage": "意外错误消息",
    "error.unexpectedMainProcess": "意外的主进程错误",
    "error.unexpectedRendererProcess": "意外的渲染进程错误",
    "menu.help.about": "关于",
    "menu.help.checkUpdates": "检查更新",
    "notifications.defaultMessage": "默认消息",
    "notifications.defaultTitle": "通知",
    "preferences.editor.fileRepresentation.trailingNewlines": "尾随换行符",
    "preferences.editor.misc.textDirection": "文本方向",
    "preferences.general.sidebar.fileSortBy": "文件排序方式",
    "preferences.general.window.titleBarStyle": "标题栏样式",
    "preferences.image.uploader.branch": "分支",
    "preferences.image.uploader.inputToken": "输入令牌",
    "preferences.image.uploader.legalNotices.and": "和",
    "preferences.image.uploader.legalNotices.byUsing": "使用此服务即表示您同意",
    "preferences.image.uploader.legalNotices.gdprWarning": "GDPR 警告",
    "preferences.image.uploader.legalNotices.privacyStatement": "隐私声明",
    "preferences.image.uploader.legalNotices.termsOfService": "服务条款",
    "preferences.image.uploader.noUploaderSelected": "未选择上传器",
    "preferences.image.uploader.owner": "所有者",
    "preferences.image.uploader.pleaseInstall": "请安装",
    "preferences.image.uploader.repo": "仓库",
    "preferences.image.uploader.scriptPath": "脚本路径",
    "preferences.image.uploader.services.cliScript": "CLI 脚本",
    "preferences.image.uploader.services.github": "GitHub",
    "preferences.image.uploader.services.none": "无",
    "preferences.image.uploader.services.picgo": "PicGo",
    "preferences.image.uploader.token": "令牌",
    "preferences.keybindings.description": "描述",
    "preferences.keybindings.key": "按键",
    "preferences.keybindings.restoreDefaults": "恢复默认",
    "preferences.markdown.misc.preferHeadingStyle.atx": "ATX",
    "preferences.markdown.misc.preferHeadingStyle.setext": "Setext",
    "preferences.spellchecker.hunspellDictionaries": "Hunspell 词典",
    "preferences.spellchecker.isHunspellEnabled": "启用 Hunspell",
    "preferences.spellchecker.language": "语言",
    "preferences.spellchecker.noSuggestion": "无建议",
    "preferences.theme.autoSwitchOptions.startup": "启动时",
    "preferences.theme.autoSwitchOptions.systemTheme": "跟随系统主题",
    "recent.noTabsOpen": "没有打开的标签页",
    "search.caseSensitive": "区分大小写",
    "search.findInFolder": "在文件夹中查找",
    "search.includeCodeBlocks": "包含代码块",
    "search.noResult": "无结果",
    "search.regexMode": "正则表达式模式",
    "search.replaceAll": "全部替换",
    "search.wholeWord": "全词匹配",
    "store.editor.anchorLinkCopied": "锚点链接已复制",
    "store.help.lineEndingAssertionError": "行结束断言错误",
    "tweet.tweet": "推文"
  }
};

// 递归设置嵌套对象的值
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

// 添加缺失的英文翻译
const updatedEnTranslations = { ...enTranslations };
report.missingKeys.english.forEach(key => {
  if (missingTranslations.english[key]) {
    setNestedValue(updatedEnTranslations, key, missingTranslations.english[key]);
    console.log(`添加英文翻译: ${key} = ${missingTranslations.english[key]}`);
  }
});

// 添加缺失的中文翻译
const updatedZhTranslations = { ...zhTranslations };
report.missingKeys.chinese.forEach(key => {
  if (missingTranslations.chinese[key]) {
    setNestedValue(updatedZhTranslations, key, missingTranslations.chinese[key]);
    console.log(`添加中文翻译: ${key} = ${missingTranslations.chinese[key]}`);
  }
});

// 保存更新后的翻译文件
fs.writeFileSync(
  'src/shared/i18n/locales/en.json',
  JSON.stringify(updatedEnTranslations, null, 2),
  'utf8'
);

fs.writeFileSync(
  'src/shared/i18n/locales/zh-CN.json',
  JSON.stringify(updatedZhTranslations, null, 2),
  'utf8'
);

console.log('\n=== 翻译键补充完成 ===');
console.log(`英文翻译文件已更新: ${Object.keys(missingTranslations.english).length} 个键`);
console.log(`中文翻译文件已更新: ${Object.keys(missingTranslations.chinese).length} 个键`);
console.log('\n请重新运行比对脚本验证结果。');