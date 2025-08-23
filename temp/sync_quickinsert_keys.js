const fs = require('fs');
const path = require('path');

// 读取翻译文件
const localesDir = path.join(__dirname, '../src/shared/i18n/locales');
const jaContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'ja.json'), 'utf8'));
const enContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
const zhCNContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'zh-CN.json'), 'utf8'));

// 深度获取所有键路径
function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys.push(...getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// 深度设置键值
function setDeepKey(obj, keyPath, value) {
  const keys = keyPath.split('.');
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

// 深度获取键值
function getDeepKey(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

// 获取日语quickInsert的所有键
const jaQuickInsertKeys = getAllKeys(jaContent.quickInsert, 'quickInsert');
console.log(`🔍 日语文件quickInsert命名空间共有 ${jaQuickInsertKeys.length} 个键`);

// 检查英语文件缺失的键
const enMissingKeys = [];
for (const keyPath of jaQuickInsertKeys) {
  if (getDeepKey(enContent, keyPath) === undefined) {
    enMissingKeys.push(keyPath);
  }
}

// 检查中文文件缺失的键
const zhCNMissingKeys = [];
for (const keyPath of jaQuickInsertKeys) {
  if (getDeepKey(zhCNContent, keyPath) === undefined) {
    zhCNMissingKeys.push(keyPath);
  }
}

console.log(`\n📋 分析结果:`);
console.log(`英语文件缺失 ${enMissingKeys.length} 个键`);
console.log(`中文文件缺失 ${zhCNMissingKeys.length} 个键`);

if (enMissingKeys.length > 0) {
  console.log(`\n🔴 英语文件缺失的键:`);
  enMissingKeys.forEach(key => console.log(`   - ${key}`));
}

if (zhCNMissingKeys.length > 0) {
  console.log(`\n🔴 中文文件缺失的键:`);
  zhCNMissingKeys.forEach(key => console.log(`   - ${key}`));
}

// 为英语文件补足缺失的键
if (enMissingKeys.length > 0) {
  console.log(`\n🔧 正在为英语文件补足缺失的键...`);
  
  for (const keyPath of enMissingKeys) {
    const jaValue = getDeepKey(jaContent, keyPath);
    // 使用日语值作为临时占位符，后续需要人工翻译
    setDeepKey(enContent, keyPath, `[TO_TRANSLATE] ${jaValue}`);
  }
  
  // 保存更新后的英语文件
  fs.writeFileSync(
    path.join(localesDir, 'en.json'),
    JSON.stringify(enContent, null, 2),
    'utf8'
  );
  console.log(`✅ 英语文件已更新`);
}

// 为中文文件补足缺失的键
if (zhCNMissingKeys.length > 0) {
  console.log(`\n🔧 正在为中文文件补足缺失的键...`);
  
  // 日语到中文的基本翻译映射
  const jaToZhMap = {
    'ガントチャート': '甘特图',
    '円グラフ': '饼图',
    'フローチャート': '流程图',
    'シーケンス図': '时序图',
    'クラス図': '类图',
    '状態図': '状态图',
    'ユーザージャーニー': '用户旅程',
    'Gitグラフ': 'Git图',
    'ER図': 'ER图',
    '要件図': '需求图',
    'gantt': 'gantt',
    'pie': 'pie',
    'flowchart': 'flowchart',
    'sequenceDiagram': 'sequenceDiagram',
    'classDiagram': 'classDiagram',
    'stateDiagram': 'stateDiagram',
    'journey': 'journey',
    'gitgraph': 'gitgraph',
    'erDiagram': 'erDiagram',
    'requirementDiagram': 'requirementDiagram'
  };
  
  for (const keyPath of zhCNMissingKeys) {
    const jaValue = getDeepKey(jaContent, keyPath);
    // 尝试翻译，如果没有映射则使用占位符
    const zhValue = jaToZhMap[jaValue] || `[需要翻译] ${jaValue}`;
    setDeepKey(zhCNContent, keyPath, zhValue);
  }
  
  // 保存更新后的中文文件
  fs.writeFileSync(
    path.join(localesDir, 'zh-CN.json'),
    JSON.stringify(zhCNContent, null, 2),
    'utf8'
  );
  console.log(`✅ 中文文件已更新`);
}

if (enMissingKeys.length === 0 && zhCNMissingKeys.length === 0) {
  console.log(`\n✅ 所有文件的quickInsert命名空间键都已同步，无需补足`);
}

console.log(`\n📋 同步完成`);
console.log('================================================================================');