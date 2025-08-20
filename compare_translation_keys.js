const fs = require('fs');
const path = require('path');

// 读取提取的翻译键
const extractedKeys = JSON.parse(fs.readFileSync('extracted_translation_keys_flat.json', 'utf8'));

// 读取现有的翻译文件
const enTranslations = JSON.parse(fs.readFileSync('src/shared/i18n/locales/en.json', 'utf8'));
const zhTranslations = JSON.parse(fs.readFileSync('src/shared/i18n/locales/zh-CN.json', 'utf8'));

// 递归获取所有翻译键
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

// 获取现有翻译文件中的所有键
const existingEnKeys = getAllKeys(enTranslations);
const existingZhKeys = getAllKeys(zhTranslations);

// 找出缺失的键
const missingInEn = extractedKeys.filter(key => !existingEnKeys.includes(key));
const missingInZh = extractedKeys.filter(key => !existingZhKeys.includes(key));

// 找出在翻译文件中存在但未被使用的键
const unusedInEn = existingEnKeys.filter(key => !extractedKeys.includes(key));
const unusedInZh = existingZhKeys.filter(key => !extractedKeys.includes(key));

// 生成比对报告
const report = {
  summary: {
    totalExtractedKeys: extractedKeys.length,
    totalEnKeys: existingEnKeys.length,
    totalZhKeys: existingZhKeys.length,
    missingInEnCount: missingInEn.length,
    missingInZhCount: missingInZh.length,
    unusedInEnCount: unusedInEn.length,
    unusedInZhCount: unusedInZh.length
  },
  missingKeys: {
    english: missingInEn.sort(),
    chinese: missingInZh.sort()
  },
  unusedKeys: {
    english: unusedInEn.sort(),
    chinese: unusedInZh.sort()
  },
  allExtractedKeys: extractedKeys.sort(),
  existingKeys: {
    english: existingEnKeys.sort(),
    chinese: existingZhKeys.sort()
  }
};

// 保存比对报告
fs.writeFileSync(
  'translation_comparison_report.json',
  JSON.stringify(report, null, 2),
  'utf8'
);

// 输出摘要信息
console.log('=== 翻译键比对报告 ===');
console.log(`提取的翻译键总数: ${report.summary.totalExtractedKeys}`);
console.log(`英文翻译文件中的键总数: ${report.summary.totalEnKeys}`);
console.log(`中文翻译文件中的键总数: ${report.summary.totalZhKeys}`);
console.log('');
console.log(`英文翻译文件中缺失的键: ${report.summary.missingInEnCount}`);
if (report.summary.missingInEnCount > 0) {
  console.log('缺失的英文键:');
  missingInEn.slice(0, 10).forEach(key => console.log(`  - ${key}`));
  if (missingInEn.length > 10) {
    console.log(`  ... 还有 ${missingInEn.length - 10} 个键`);
  }
}
console.log('');
console.log(`中文翻译文件中缺失的键: ${report.summary.missingInZhCount}`);
if (report.summary.missingInZhCount > 0) {
  console.log('缺失的中文键:');
  missingInZh.slice(0, 10).forEach(key => console.log(`  - ${key}`));
  if (missingInZh.length > 10) {
    console.log(`  ... 还有 ${missingInZh.length - 10} 个键`);
  }
}
console.log('');
console.log(`英文翻译文件中未使用的键: ${report.summary.unusedInEnCount}`);
console.log(`中文翻译文件中未使用的键: ${report.summary.unusedInZhCount}`);
console.log('');
console.log('详细报告已保存到 translation_comparison_report.json');

// 生成缺失键的模板文件
if (missingInEn.length > 0 || missingInZh.length > 0) {
  const missingKeysTemplate = {
    english: {},
    chinese: {}
  };
  
  // 为缺失的英文键创建模板
  missingInEn.forEach(key => {
    const parts = key.split('.');
    let current = missingKeysTemplate.english;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = `[TODO: ${key}]`;
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  });
  
  // 为缺失的中文键创建模板
  missingInZh.forEach(key => {
    const parts = key.split('.');
    let current = missingKeysTemplate.chinese;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = `[待翻译: ${key}]`;
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  });
  
  fs.writeFileSync(
    'missing_keys_template.json',
    JSON.stringify(missingKeysTemplate, null, 2),
    'utf8'
  );
  
  console.log('缺失键的模板已保存到 missing_keys_template.json');
}