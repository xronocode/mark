const fs = require('fs');
const path = require('path');

// 翻译文件路径
const enPath = path.join(__dirname, 'src/shared/i18n/locales/en.json');
const zhPath = path.join(__dirname, 'src/shared/i18n/locales/zh-CN.json');

// 需要添加的父级键翻译
const parentKeysTranslations = {
  'preferences.editor.fileRepresentation.trailingNewlines': {
    en: 'Trailing Newlines',
    zh: '尾随换行符'
  },
  'preferences.editor.misc.textDirection': {
    en: 'Text Direction',
    zh: '文本方向'
  },
  'preferences.general.sidebar.fileSortBy': {
    en: 'File Sort By',
    zh: '文件排序方式'
  },
  'preferences.general.window.titleBarStyle': {
    en: 'Title Bar Style',
    zh: '标题栏样式'
  },
  'preferences.markdown.diagrams.sequenceTheme.handDrawn': {
    en: 'Hand Drawn',
    zh: '手绘风格'
  },
  'preferences.markdown.diagrams.sequenceTheme.simple': {
    en: 'Simple',
    zh: '简洁风格'
  },
  'preferences.markdown.extensions.frontmatterType.jsonBrace': {
    en: 'JSON with Braces',
    zh: 'JSON 大括号格式'
  },
  'preferences.markdown.extensions.frontmatterType.jsonSemicolon': {
    en: 'JSON with Semicolon',
    zh: 'JSON 分号格式'
  },
  'preferences.markdown.lists.listIndentation.dfm': {
    en: 'DFM Style',
    zh: 'DFM 风格'
  },
  'preferences.markdown.lists.listIndentation.fourSpaces': {
    en: 'Four Spaces',
    zh: '四个空格'
  },
  'preferences.markdown.lists.listIndentation.oneSpace': {
    en: 'One Space',
    zh: '一个空格'
  },
  'preferences.markdown.lists.listIndentation.tab': {
    en: 'Tab',
    zh: '制表符'
  },
  'preferences.markdown.lists.listIndentation.threeSpaces': {
    en: 'Three Spaces',
    zh: '三个空格'
  },
  'preferences.markdown.lists.listIndentation.twoSpaces': {
    en: 'Two Spaces',
    zh: '两个空格'
  },
  'preferences.markdown.misc.preferHeadingStyle.atx': {
    en: 'ATX Style',
    zh: 'ATX 风格'
  },
  'preferences.markdown.misc.preferHeadingStyle.setext': {
    en: 'Setext Style',
    zh: 'Setext 风格'
  }
};

// 辅助函数：设置嵌套对象的值
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

// 处理翻译文件
function addParentKeysTranslations() {
  try {
    // 读取英文翻译文件
    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    
    // 读取中文翻译文件
    const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
    
    let addedCount = 0;
    
    // 添加英文翻译
    for (const [keyPath, translations] of Object.entries(parentKeysTranslations)) {
      setNestedValue(enData, keyPath, translations.en);
      console.log(`Added EN: ${keyPath} = "${translations.en}"`);
      addedCount++;
    }
    
    // 添加中文翻译
    for (const [keyPath, translations] of Object.entries(parentKeysTranslations)) {
      setNestedValue(zhData, keyPath, translations.zh);
      console.log(`Added ZH: ${keyPath} = "${translations.zh}"`);
    }
    
    // 写回文件
    fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');
    fs.writeFileSync(zhPath, JSON.stringify(zhData, null, 2), 'utf8');
    
    console.log(`\n✅ 成功添加了 ${addedCount} 个父级键的翻译`);
    console.log('📝 请重新运行比对脚本验证结果');
    
  } catch (error) {
    console.error('❌ 处理翻译文件时出错:', error.message);
  }
}

// 执行脚本
addParentKeysTranslations();