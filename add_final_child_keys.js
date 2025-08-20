const fs = require('fs');
const path = require('path');

// 翻译文件路径
const enPath = path.join(__dirname, 'src/shared/i18n/locales/en.json');
const zhPath = path.join(__dirname, 'src/shared/i18n/locales/zh-CN.json');

// 需要添加的子键翻译
const childKeysTranslations = {
  'preferences.editor.fileRepresentation.trailingNewlines.doNothing': {
    en: 'Do Nothing',
    zh: '不处理'
  },
  'preferences.editor.fileRepresentation.trailingNewlines.ensureOne': {
    en: 'Ensure One',
    zh: '确保一个'
  },
  'preferences.editor.fileRepresentation.trailingNewlines.preserve': {
    en: 'Preserve',
    zh: '保留'
  },
  'preferences.editor.fileRepresentation.trailingNewlines.trimAll': {
    en: 'Trim All',
    zh: '删除所有'
  },
  'preferences.editor.misc.textDirection.ltr': {
    en: 'Left to Right',
    zh: '从左到右'
  },
  'preferences.editor.misc.textDirection.rtl': {
    en: 'Right to Left',
    zh: '从右到左'
  },
  'preferences.general.sidebar.fileSortBy.creationTime': {
    en: 'Creation Time',
    zh: '创建时间'
  },
  'preferences.general.sidebar.fileSortBy.modificationTime': {
    en: 'Modification Time',
    zh: '修改时间'
  },
  'preferences.general.sidebar.fileSortBy.title': {
    en: 'Title',
    zh: '标题'
  },
  'preferences.general.window.titleBarStyle.custom': {
    en: 'Custom',
    zh: '自定义'
  },
  'preferences.general.window.titleBarStyle.native': {
    en: 'Native',
    zh: '原生'
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

// 辅助函数：获取嵌套对象的值
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

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
function addChildKeysTranslations() {
  try {
    // 读取英文翻译文件
    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    
    // 读取中文翻译文件
    const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
    
    let addedCount = 0;
    
    // 首先需要将某些父级键从字符串转换为对象
    const parentKeysToConvert = [
      'preferences.markdown.diagrams.sequenceTheme',
      'preferences.markdown.extensions.frontmatterType',
      'preferences.markdown.lists.listIndentation',
      'preferences.markdown.misc.preferHeadingStyle'
    ];
    
    // 转换父级键为对象
    for (const parentKey of parentKeysToConvert) {
      const enValue = getNestedValue(enData, parentKey);
      const zhValue = getNestedValue(zhData, parentKey);
      
      if (typeof enValue === 'string') {
        setNestedValue(enData, parentKey, {});
        console.log(`Converted EN parent key to object: ${parentKey}`);
      }
      
      if (typeof zhValue === 'string') {
        setNestedValue(zhData, parentKey, {});
        console.log(`Converted ZH parent key to object: ${parentKey}`);
      }
    }
    
    // 添加英文翻译
    for (const [keyPath, translations] of Object.entries(childKeysTranslations)) {
      setNestedValue(enData, keyPath, translations.en);
      console.log(`Added EN: ${keyPath} = "${translations.en}"`);
      addedCount++;
    }
    
    // 添加中文翻译
    for (const [keyPath, translations] of Object.entries(childKeysTranslations)) {
      setNestedValue(zhData, keyPath, translations.zh);
      console.log(`Added ZH: ${keyPath} = "${translations.zh}"`);
    }
    
    // 写回文件
    fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');
    fs.writeFileSync(zhPath, JSON.stringify(zhData, null, 2), 'utf8');
    
    console.log(`\n✅ 成功添加了 ${addedCount} 个子键的翻译`);
    console.log('📝 请重新运行比对脚本验证结果');
    
  } catch (error) {
    console.error('❌ 处理翻译文件时出错:', error.message);
  }
}

// 执行脚本
addChildKeysTranslations();