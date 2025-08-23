const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/shared/i18n/locales');

// 读取三个语言文件
const jaContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'ja.json'), 'utf8'));
const enContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
const zhContent = JSON.parse(fs.readFileSync(path.join(localesDir, 'zh-CN.json'), 'utf8'));

// 深度获取所有键的函数
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

// 获取各语言文件的quickInsert键
const jaKeys = new Set(getAllKeys(jaContent.quickInsert || {}));
const enKeys = new Set(getAllKeys(enContent.quickInsert || {}));
const zhKeys = new Set(getAllKeys(zhContent.quickInsert || {}));

console.log('=== quickInsert 键数量统计 ===');
console.log(`日语文件: ${jaKeys.size} 个键`);
console.log(`英语文件: ${enKeys.size} 个键`);
console.log(`中文文件: ${zhKeys.size} 个键`);
console.log();

// 找出英语文件中存在但日语文件中不存在的键
const enOnlyKeys = [...enKeys].filter(key => !jaKeys.has(key));
console.log('=== 英语文件中多出的键 ===');
if (enOnlyKeys.length > 0) {
  enOnlyKeys.forEach(key => console.log(`  ${key}`));
} else {
  console.log('  无多余键');
}
console.log();

// 找出中文文件中存在但日语文件中不存在的键
const zhOnlyKeys = [...zhKeys].filter(key => !jaKeys.has(key));
console.log('=== 中文文件中多出的键 ===');
if (zhOnlyKeys.length > 0) {
  zhOnlyKeys.forEach(key => console.log(`  ${key}`));
} else {
  console.log('  无多余键');
}
console.log();

// 找出日语文件中存在但英语/中文文件中不存在的键
const jaOnlyKeys = [...jaKeys].filter(key => !enKeys.has(key) || !zhKeys.has(key));
console.log('=== 日语文件中独有的键 ===');
if (jaOnlyKeys.length > 0) {
  jaOnlyKeys.forEach(key => console.log(`  ${key}`));
} else {
  console.log('  无独有键');
}
console.log();

// 检查英语和中文文件是否完全一致
const enZhDiff = [...enKeys].filter(key => !zhKeys.has(key)).concat([...zhKeys].filter(key => !enKeys.has(key)));
console.log('=== 英语和中文文件差异 ===');
if (enZhDiff.length > 0) {
  enZhDiff.forEach(key => console.log(`  ${key}`));
} else {
  console.log('  英语和中文文件键完全一致');
}