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

// 主验证函数
function finalTranslationVerification() {
  console.log('开始最终翻译验证...');
  
  // 读取英文文件作为基准
  const enFilePath = path.join(localesDir, 'en.json');
  const enContent = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));
  const enKeys = getAllKeys(enContent).sort();
  
  console.log(`英文基准文件包含 ${enKeys.length} 个键`);
  
  const verificationReport = {
    timestamp: new Date().toLocaleString(),
    baseLanguage: 'en',
    totalKeys: enKeys.length,
    languages: {},
    summary: {
      fullyCompleteLanguages: [],
      incompleteLanguages: [],
      totalLanguagesChecked: 0
    }
  };
  
  // 获取所有语言文件
  const languageFiles = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json') && file !== 'en.json')
    .map(file => file.replace('.json', ''));
  
  console.log(`\n检查的语言: ${languageFiles.join(', ')}`);
  
  // 验证每个语言文件
  languageFiles.forEach(lang => {
    console.log(`\n验证 ${lang}.json...`);
    
    const langFilePath = path.join(localesDir, `${lang}.json`);
    const langContent = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    const langKeys = getAllKeys(langContent).sort();
    
    // 找出缺失的键
    const missingKeys = enKeys.filter(key => !langKeys.includes(key));
    const extraKeys = langKeys.filter(key => !enKeys.includes(key));
    
    const isComplete = missingKeys.length === 0;
    
    verificationReport.languages[lang] = {
      totalKeys: langKeys.length,
      missingKeys: missingKeys.length,
      extraKeys: extraKeys.length,
      isComplete: isComplete,
      missingKeysList: missingKeys,
      extraKeysList: extraKeys,
      completionPercentage: ((langKeys.length - missingKeys.length) / enKeys.length * 100).toFixed(2)
    };
    
    if (isComplete) {
      console.log(`  ✅ ${lang}: 完整 (${langKeys.length}/${enKeys.length} 键)`);
      verificationReport.summary.fullyCompleteLanguages.push(lang);
    } else {
      console.log(`  ❌ ${lang}: 不完整 (${langKeys.length - missingKeys.length}/${enKeys.length} 键, 缺失 ${missingKeys.length})`);
      verificationReport.summary.incompleteLanguages.push(lang);
      
      if (missingKeys.length <= 5) {
        console.log(`    缺失的键: ${missingKeys.join(', ')}`);
      } else {
        console.log(`    缺失的键 (前5个): ${missingKeys.slice(0, 5).join(', ')}...`);
      }
    }
    
    if (extraKeys.length > 0) {
      console.log(`    额外的键: ${extraKeys.length} 个`);
    }
  });
  
  verificationReport.summary.totalLanguagesChecked = languageFiles.length;
  
  // 保存验证报告
  const verificationReportPath = '/Users/hubo/mycode/marktext/temp/final_translation_verification_report.json';
  fs.writeFileSync(verificationReportPath, JSON.stringify(verificationReport, null, 2), 'utf8');
  
  console.log(`\n=== 最终验证总结 ===`);
  console.log(`基准语言 (${verificationReport.baseLanguage}): ${verificationReport.totalKeys} 个键`);
  console.log(`检查的语言数: ${verificationReport.summary.totalLanguagesChecked}`);
  console.log(`完整的语言: ${verificationReport.summary.fullyCompleteLanguages.length} 个 (${verificationReport.summary.fullyCompleteLanguages.join(', ')})`);
  console.log(`不完整的语言: ${verificationReport.summary.incompleteLanguages.length} 个 (${verificationReport.summary.incompleteLanguages.join(', ')})`);
  console.log(`详细报告已保存到: ${verificationReportPath}`);
  
  return verificationReport;
}

// 执行验证
if (require.main === module) {
  try {
    finalTranslationVerification();
  } catch (error) {
    console.error('验证过程中发生错误:', error);
    process.exit(1);
  }
}

module.exports = { finalTranslationVerification };