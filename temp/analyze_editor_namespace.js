const fs = require('fs');
const path = require('path');

// 读取所有i18n文件
const i18nDir = path.join(__dirname, '../src/shared/i18n/locales');
const files = fs.readdirSync(i18nDir).filter(file => file.endsWith('.json'));

// 提取嵌套对象的所有键
function extractKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys.push(...extractKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// 分析editor命名空间
const editorNamespaceAnalysis = {};

files.forEach(file => {
  const filePath = path.join(i18nDir, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const lang = file.replace('.json', '');
  
  if (content.editor) {
    const editorKeys = extractKeys(content.editor);
    editorNamespaceAnalysis[lang] = {
      count: editorKeys.length,
      keys: editorKeys.sort()
    };
  } else {
    editorNamespaceAnalysis[lang] = {
      count: 0,
      keys: []
    };
  }
});

// 找出所有语言中editor命名空间的键的并集
const allEditorKeys = new Set();
Object.values(editorNamespaceAnalysis).forEach(analysis => {
  analysis.keys.forEach(key => allEditorKeys.add(key));
});

const sortedAllKeys = Array.from(allEditorKeys).sort();

console.log('=== Editor命名空间分析报告 ===\n');

// 显示每种语言的键数量
console.log('各语言editor命名空间键数量:');
Object.entries(editorNamespaceAnalysis)
  .sort((a, b) => b[1].count - a[1].count)
  .forEach(([lang, analysis]) => {
    console.log(`${lang}: ${analysis.count}个键`);
  });

console.log(`\n所有语言editor键的并集: ${sortedAllKeys.length}个键\n`);

// 分析英文和中文文件缺失的键
const enKeys = new Set(editorNamespaceAnalysis.en?.keys || []);
const zhKeys = new Set(editorNamespaceAnalysis['zh-CN']?.keys || []);

const missingInEn = sortedAllKeys.filter(key => !enKeys.has(key));
const missingInZh = sortedAllKeys.filter(key => !zhKeys.has(key));

console.log('英文文件(en.json)缺失的editor键:');
if (missingInEn.length > 0) {
  missingInEn.forEach(key => console.log(`  - ${key}`));
} else {
  console.log('  无缺失键');
}

console.log('\n中文文件(zh-CN.json)缺失的editor键:');
if (missingInZh.length > 0) {
  missingInZh.forEach(key => console.log(`  - ${key}`));
} else {
  console.log('  无缺失键');
}

// 找出哪些语言文件有这些缺失的键
if (missingInEn.length > 0 || missingInZh.length > 0) {
  const uniqueMissingKeys = new Set([...missingInEn, ...missingInZh]);
  
  console.log('\n缺失键在其他语言文件中的分布:');
  uniqueMissingKeys.forEach(missingKey => {
    const langsWithKey = [];
    Object.entries(editorNamespaceAnalysis).forEach(([lang, analysis]) => {
      if (analysis.keys.includes(missingKey)) {
        langsWithKey.push(lang);
      }
    });
    console.log(`  ${missingKey}: 存在于 [${langsWithKey.join(', ')}]`);
  });
}

// 输出详细的键对比
console.log('\n=== 详细键对比 ===');
console.log('\n所有editor键列表:');
sortedAllKeys.forEach(key => {
  const presentIn = [];
  Object.entries(editorNamespaceAnalysis).forEach(([lang, analysis]) => {
    if (analysis.keys.includes(key)) {
      presentIn.push(lang);
    }
  });
  console.log(`${key}: [${presentIn.join(', ')}]`);
});