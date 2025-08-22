const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = path.join(__dirname, 'src/shared/i18n/locales');

// 获取所有翻译文件
const translationFiles = fs.readdirSync(localesDir)
  .filter(file => file.endsWith('.json'))
  .map(file => path.join(localesDir, file));

console.log('找到的翻译文件:', translationFiles.map(f => path.basename(f)));

// 递归获取对象的所有键路径
function getKeyPaths(obj, prefix = '') {
  const paths = [];
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        // 递归处理嵌套对象
        paths.push(...getKeyPaths(obj[key], currentPath));
      } else {
        // 叶子节点
        paths.push(currentPath);
      }
    }
  }
  
  return paths;
}

// 加载所有翻译文件
const translations = {};
const allKeyPaths = {};

for (const filePath of translationFiles) {
  try {
    const fileName = path.basename(filePath, '.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    translations[fileName] = data;
    allKeyPaths[fileName] = getKeyPaths(data);
    
    console.log(`${fileName}: ${allKeyPaths[fileName].length} 个键`);
  } catch (error) {
    console.error(`读取文件 ${filePath} 时出错:`, error.message);
  }
}

// 以英文为基准，检查其他语言的缺失键
const baseLanguage = 'en';
if (!allKeyPaths[baseLanguage]) {
  console.error('未找到英文翻译文件作为基准');
  process.exit(1);
}

const baseKeys = new Set(allKeyPaths[baseLanguage]);
const missingKeys = {};
const extraKeys = {};

console.log('\n=== 键值缺失检查报告 ===');
console.log(`以 ${baseLanguage}.json 为基准 (${baseKeys.size} 个键)\n`);

// 检查每个语言文件
for (const [language, keyPaths] of Object.entries(allKeyPaths)) {
  if (language === baseLanguage) continue;
  
  const currentKeys = new Set(keyPaths);
  
  // 找出缺失的键
  const missing = [...baseKeys].filter(key => !currentKeys.has(key));
  // 找出多余的键
  const extra = [...currentKeys].filter(key => !baseKeys.has(key));
  
  if (missing.length > 0) {
    missingKeys[language] = missing;
  }
  
  if (extra.length > 0) {
    extraKeys[language] = extra;
  }
  
  console.log(`${language}.json:`);
  console.log(`  总键数: ${keyPaths.length}`);
  console.log(`  缺失键: ${missing.length}`);
  console.log(`  多余键: ${extra.length}`);
  
  if (missing.length > 0) {
    console.log(`  缺失的键:`);
    missing.slice(0, 10).forEach(key => console.log(`    - ${key}`));
    if (missing.length > 10) {
      console.log(`    ... 还有 ${missing.length - 10} 个缺失键`);
    }
  }
  
  if (extra.length > 0) {
    console.log(`  多余的键:`);
    extra.slice(0, 10).forEach(key => console.log(`    + ${key}`));
    if (extra.length > 10) {
      console.log(`    ... 还有 ${extra.length - 10} 个多余键`);
    }
  }
  
  console.log('');
}

// 生成详细报告
const reportPath = path.join(__dirname, 'translation_comparison_report.json');
const report = {
  baseLanguage,
  totalBaseKeys: baseKeys.size,
  summary: {},
  missingKeys,
  extraKeys,
  allKeyPaths
};

// 生成摘要
for (const [language, keyPaths] of Object.entries(allKeyPaths)) {
  if (language === baseLanguage) continue;
  
  report.summary[language] = {
    totalKeys: keyPaths.length,
    missingCount: missingKeys[language] ? missingKeys[language].length : 0,
    extraCount: extraKeys[language] ? extraKeys[language].length : 0,
    completeness: ((keyPaths.length - (missingKeys[language] ? missingKeys[language].length : 0)) / baseKeys.size * 100).toFixed(2) + '%'
  };
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`详细报告已保存到: ${reportPath}`);

// 总结
console.log('\n=== 总结 ===');
const languagesWithIssues = Object.keys(missingKeys).length + Object.keys(extraKeys).length;
if (languagesWithIssues === 0) {
  console.log('✅ 所有翻译文件的键值结构都是完整的！');
} else {
  console.log(`❌ 发现 ${Object.keys(missingKeys).length} 个语言有缺失键`);
  console.log(`⚠️  发现 ${Object.keys(extraKeys).length} 个语言有多余键`);
  
  // 显示完整性最低的语言
  const completenessRanking = Object.entries(report.summary)
    .sort((a, b) => parseFloat(a[1].completeness) - parseFloat(b[1].completeness));
  
  console.log('\n完整性排名 (从低到高):');
  completenessRanking.forEach(([lang, stats]) => {
    console.log(`  ${lang}: ${stats.completeness} (缺失: ${stats.missingCount}, 多余: ${stats.extraCount})`);
  });
}