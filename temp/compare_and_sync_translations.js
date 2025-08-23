const fs = require('fs');
const path = require('path');

// 翻译文件目录
const localesDir = '/Users/hubo/mycode/marktext/src/shared/i18n/locales';

// 获取所有嵌套键的函数
function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys.push(...getAllKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
  }
  return keys;
}

// 根据键路径获取嵌套对象的值
function getValueByPath(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

// 根据键路径设置嵌套对象的值
function setValueByPath(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

// 主函数
function compareAndSyncTranslations() {
  console.log('开始比较和同步翻译文件...');
  
  // 读取英文翻译文件作为基准
  const enFilePath = path.join(localesDir, 'en.json');
  const enContent = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));
  const enKeys = getAllKeys(enContent);
  
  console.log(`英文翻译文件包含 ${enKeys.length} 个键`);
  
  // 获取所有翻译文件
  const translationFiles = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json') && file !== 'en.json')
    .map(file => file.replace('.json', ''));
  
  console.log(`找到 ${translationFiles.length} 个其他语言文件: ${translationFiles.join(', ')}`);
  
  const syncReport = {
    timestamp: new Date().toLocaleString(),
    baseLanguage: 'en',
    totalKeys: enKeys.length,
    languages: {},
    summary: {
      totalLanguages: translationFiles.length,
      totalMissingKeys: 0,
      languagesNeedingSync: []
    }
  };
  
  // 比较每个语言文件
  translationFiles.forEach(lang => {
    const langFilePath = path.join(localesDir, `${lang}.json`);
    const langContent = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    const langKeys = getAllKeys(langContent);
    
    // 找出缺失的键
    const missingKeys = enKeys.filter(key => !langKeys.includes(key));
    
    syncReport.languages[lang] = {
      totalKeys: langKeys.length,
      missingKeys: missingKeys.length,
      missingKeysList: missingKeys,
      completeness: ((langKeys.length / enKeys.length) * 100).toFixed(2) + '%'
    };
    
    if (missingKeys.length > 0) {
      syncReport.summary.languagesNeedingSync.push(lang);
      syncReport.summary.totalMissingKeys += missingKeys.length;
      
      console.log(`\n${lang}.json: 缺失 ${missingKeys.length} 个键`);
      
      // 补充缺失的键
      missingKeys.forEach(key => {
        const enValue = getValueByPath(enContent, key);
        setValueByPath(langContent, key, enValue); // 先用英文值占位
        console.log(`  + 添加键: ${key}`);
      });
      
      // 保存更新后的文件
      fs.writeFileSync(langFilePath, JSON.stringify(langContent, null, 2), 'utf8');
      console.log(`✅ ${lang}.json 已更新`);
    } else {
      console.log(`✅ ${lang}.json 已完整，无需更新`);
    }
  });
  
  // 保存同步报告
  const reportPath = '/Users/hubo/mycode/marktext/temp/translation_sync_report.json';
  fs.writeFileSync(reportPath, JSON.stringify(syncReport, null, 2), 'utf8');
  
  console.log(`\n=== 同步完成总结 ===`);
  console.log(`处理的语言数: ${syncReport.summary.totalLanguages}`);
  console.log(`需要同步的语言: ${syncReport.summary.languagesNeedingSync.length}`);
  console.log(`总缺失键数: ${syncReport.summary.totalMissingKeys}`);
  console.log(`详细报告已保存到: ${reportPath}`);
  
  if (syncReport.summary.languagesNeedingSync.length > 0) {
    console.log(`\n需要翻译的语言: ${syncReport.summary.languagesNeedingSync.join(', ')}`);
    console.log('注意: 新添加的键目前使用英文值作为占位符，需要进行人工翻译。');
  }
  
  return syncReport;
}

// 执行同步
if (require.main === module) {
  try {
    compareAndSyncTranslations();
  } catch (error) {
    console.error('同步过程中发生错误:', error);
    process.exit(1);
  }
}

module.exports = { compareAndSyncTranslations };