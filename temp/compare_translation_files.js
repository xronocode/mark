#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 支持的语言列表
const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁体中文' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'pt', name: 'Português' }
];

// 读取翻译文件
function readTranslationFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error.message);
    return null;
  }
}

// 获取所有键值对的扁平化表示
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }
  
  return flattened;
}

// 检查重复键值
function findDuplicateKeys(flattened) {
  const duplicates = [];
  const seen = new Set();
  
  for (const key in flattened) {
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
    }
  }
  
  return duplicates;
}

// 检查空值
function findEmptyValues(flattened) {
  const emptyValues = [];
  
  for (const key in flattened) {
    const value = flattened[key];
    if (value === '' || value === null || value === undefined) {
      emptyValues.push(key);
    }
  }
  
  return emptyValues;
}

// 比较多语言翻译文件
function compareMultiLanguageFiles() {
  const localesDir = path.join(__dirname, '../src/shared/i18n/locales');
  
  console.log('🌍 开始检查多语言翻译文件...');
  console.log(`翻译文件目录: ${localesDir}`);
  
  // 读取所有语言文件
  const languageData = {};
  const languageStats = {};
  
  for (const lang of SUPPORTED_LANGUAGES) {
    const filePath = path.join(localesDir, `${lang.code}.json`);
    console.log(`📖 读取 ${lang.name} (${lang.code}): ${filePath}`);
    
    const data = readTranslationFile(filePath);
    if (data) {
      const flattened = flattenObject(data);
      languageData[lang.code] = {
        raw: data,
        flattened: flattened,
        keys: Object.keys(flattened),
        name: lang.name
      };
      
      // 统计信息
      languageStats[lang.code] = {
        name: lang.name,
        keyCount: Object.keys(flattened).length,
        duplicates: findDuplicateKeys(flattened),
        emptyValues: findEmptyValues(flattened)
      };
    } else {
      console.error(`❌ 无法读取 ${lang.name} 翻译文件`);
    }
  }
  
  console.log('\n📊 各语言统计信息:');
  for (const [code, stats] of Object.entries(languageStats)) {
    console.log(`${stats.name} (${code}): ${stats.keyCount} 个键值`);
  }
  
  // 以简体中文为基准，检查其他语言的完整性
  const baseLanguage = 'zh-CN';
  const baseKeys = languageData[baseLanguage]?.keys || [];
  
  if (baseKeys.length === 0) {
    console.error('❌ 无法读取基准语言文件 (简体中文)');
    return;
  }
  
  console.log(`\n🎯 以 ${languageData[baseLanguage].name} 为基准 (${baseKeys.length} 个键值)`);
  
  const comparisonResults = {};
  let hasAnyIssues = false;
  
  // 检查每种语言与基准语言的差异
  for (const [code, data] of Object.entries(languageData)) {
    if (code === baseLanguage) continue;
    
    const currentKeys = data.keys;
    const missingKeys = baseKeys.filter(key => !currentKeys.includes(key));
    const extraKeys = currentKeys.filter(key => !baseKeys.includes(key));
    const stats = languageStats[code];
    
    const hasIssues = missingKeys.length > 0 || extraKeys.length > 0 || 
                     stats.duplicates.length > 0 || stats.emptyValues.length > 0;
    
    if (hasIssues) {
      hasAnyIssues = true;
    }
    
    comparisonResults[code] = {
      name: data.name,
      keyCount: currentKeys.length,
      missingKeys,
      extraKeys,
      duplicates: stats.duplicates,
      emptyValues: stats.emptyValues,
      hasIssues
    };
    
    // 输出结果
    console.log(`\n${hasIssues ? '❌' : '✅'} ${data.name} (${code}):`);
    console.log(`   键值数量: ${currentKeys.length}`);
    
    if (missingKeys.length > 0) {
      console.log(`   缺失键值: ${missingKeys.length} 个`);
      if (missingKeys.length <= 10) {
        missingKeys.forEach(key => console.log(`     - ${key}`));
      } else {
        missingKeys.slice(0, 10).forEach(key => console.log(`     - ${key}`));
        console.log(`     ... 还有 ${missingKeys.length - 10} 个`);
      }
    }
    
    if (extraKeys.length > 0) {
      console.log(`   多余键值: ${extraKeys.length} 个`);
      if (extraKeys.length <= 5) {
        extraKeys.forEach(key => console.log(`     + ${key}`));
      } else {
        extraKeys.slice(0, 5).forEach(key => console.log(`     + ${key}`));
        console.log(`     ... 还有 ${extraKeys.length - 5} 个`);
      }
    }
    
    if (stats.duplicates.length > 0) {
      console.log(`   重复键值: ${stats.duplicates.length} 个`);
      stats.duplicates.forEach(key => console.log(`     ⚠️ ${key}`));
    }
    
    if (stats.emptyValues.length > 0) {
      console.log(`   空值: ${stats.emptyValues.length} 个`);
      stats.emptyValues.forEach(key => console.log(`     🔍 ${key}`));
    }
  }
  
  // 检查基准语言自身的问题
  const baseStats = languageStats[baseLanguage];
  if (baseStats.duplicates.length > 0 || baseStats.emptyValues.length > 0) {
    hasAnyIssues = true;
    console.log(`\n❌ ${baseStats.name} (基准语言) 存在问题:`);
    
    if (baseStats.duplicates.length > 0) {
      console.log(`   重复键值: ${baseStats.duplicates.length} 个`);
      baseStats.duplicates.forEach(key => console.log(`     ⚠️ ${key}`));
    }
    
    if (baseStats.emptyValues.length > 0) {
      console.log(`   空值: ${baseStats.emptyValues.length} 个`);
      baseStats.emptyValues.forEach(key => console.log(`     🔍 ${key}`));
    }
  }
  
  if (!hasAnyIssues) {
    console.log('\n🎉 所有语言文件都没有发现问题！');
    console.log('   ✅ 键值完整性良好');
    console.log('   ✅ 无重复键值');
    console.log('   ✅ 无空值');
  }
  
  // 生成详细报告
  const report = {
    summary: {
      baseLanguage: baseLanguage,
      baseKeyCount: baseKeys.length,
      totalLanguages: Object.keys(languageData).length,
      hasAnyIssues,
      checkTime: new Date().toISOString()
    },
    languageStats,
    comparisonResults
  };
  
  const reportPath = path.join(__dirname, 'multilingual_comparison_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📄 详细报告已保存到: ${reportPath}`);
  
  return report;
}

// 根据路径获取值
function getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}

// 运行多语言比较
compareMultiLanguageFiles();