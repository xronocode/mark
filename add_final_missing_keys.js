const fs = require('fs');
const path = require('path');

// 翻译文件路径
const enPath = path.join(__dirname, 'src/shared/i18n/locales/en.json');
const zhPath = path.join(__dirname, 'src/shared/i18n/locales/zh-CN.json');

// 读取现有翻译文件
const enTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const zhTranslations = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

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

// 获取嵌套值的辅助函数
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

// 首先处理需要从字符串转换为对象的键
const keysToConvert = [
  'preferences.editor.fileRepresentation.trailingNewlines',
  'preferences.editor.misc.textDirection',
  'preferences.general.sidebar.fileSortBy',
  'preferences.general.window.titleBarStyle'
];

// 转换这些键为对象（如果它们当前是字符串）
keysToConvert.forEach(keyPath => {
  const enValue = getNestedValue(enTranslations, keyPath);
  const zhValue = getNestedValue(zhTranslations, keyPath);
  
  if (typeof enValue === 'string') {
    console.log(`Converting EN ${keyPath} from string to object`);
    setNestedValue(enTranslations, keyPath, { title: enValue });
  }
  
  if (typeof zhValue === 'string') {
    console.log(`Converting ZH ${keyPath} from string to object`);
    setNestedValue(zhTranslations, keyPath, { title: zhValue });
  }
});

// 需要添加的具体缺失键
const missingKeys = {
  // Trailing newlines options
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
  
  // Text direction options
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
  
  // Title bar style options
  'preferences.general.window.titleBarStyle.custom': {
    en: 'Custom',
    zh: '自定义'
  },
  'preferences.general.window.titleBarStyle.native': {
    en: 'Native',
    zh: '原生'
  }
};

// 添加缺失的翻译
let addedCount = 0;

Object.keys(missingKeys).forEach(key => {
  const translation = missingKeys[key];
  
  // 添加英文翻译
  setNestedValue(enTranslations, key, translation.en);
  console.log(`Added EN: ${key} = "${translation.en}"`);
  addedCount++;
  
  // 添加中文翻译
  setNestedValue(zhTranslations, key, translation.zh);
  console.log(`Added ZH: ${key} = "${translation.zh}"`);
  addedCount++;
});

// 保存更新后的翻译文件
fs.writeFileSync(enPath, JSON.stringify(enTranslations, null, 2), 'utf8');
fs.writeFileSync(zhPath, JSON.stringify(zhTranslations, null, 2), 'utf8');

console.log(`\n✅ Successfully added ${addedCount} missing translation keys`);
console.log('📝 Please run the comparison script again to verify the results.');